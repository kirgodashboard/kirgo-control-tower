# Kirgo Control Tower — WooCommerce Importer Design
**Version:** v1.0 | **Date:** 2026-06-17  
**Phase:** Implementation Phase 1  
**Schema Reference:** DATABASE_SCHEMA.md v2.2  
**Source:** `Woocom - Orders` sheet (Kirgo Numbers.xlsx)  
**Destination Tables:** `customers`, `orders`, `order_lines`

---

## Document Contents

- [A. Folder Structure](#a-folder-structure)
- [B. Import Workflow](#b-import-workflow)
- [C. Mapping Specification](#c-mapping-specification)
- [D. Validation Specification](#d-validation-specification)
- [E. Reconciliation Specification](#e-reconciliation-specification)
- [F. Pseudocode](#f-pseudocode)

---

## A. Folder Structure

### A.1 Runtime File Layout

```
imports/
├── raw/
│   └── YYYY-MM-DD/
│       └── woocommerce/
│           └── woocom-orders-YYYY-MM-DD.csv     ← DROP FILE HERE BEFORE RUNNING
│
├── processed/
│   └── YYYY-MM-DD/
│       └── woocommerce/
│           └── woocom-orders-YYYY-MM-DD.csv     ← MOVED HERE after successful run
│
├── errors/
│   └── YYYY-MM-DD/
│       └── woocommerce/
│           └── woocom-orders-YYYY-MM-DD.csv     ← MOVED HERE on fatal failure
│
├── archive/
│   └── woocommerce/
│       └── YYYY/
│           └── woocom-orders-YYYY-MM-DD.csv     ← PERMANENT COPY (never delete)
│
└── config/
    └── sku_manual_map.csv                       ← Operator-maintained legacy SKU → variant_id
```

**Rule:** Never modify or overwrite a file in `raw/`. The importer only reads it; archiving creates a copy.

### A.2 Config File: `sku_manual_map.csv`

Pre-built flat-file lookup for SKUs that existed in 2023/2024 WooCommerce exports but predate the canonical `product_variants.sku` format. Maintained by the operator outside the database.

| Column | Type | Description |
|--------|------|-------------|
| `raw_sku` | text | Exactly as it appears in `Item N SKU` in the WooCommerce CSV |
| `canonical_sku` | text | Matches `product_variants.sku` exactly |
| `notes` | text | Why this mapping exists (e.g. `L1 pre-launch SKU format`) |

Zero rows is valid on first import if all SKUs already match `product_variants`. Add rows as `UNRESOLVED_SKU` errors surface.

### A.3 Importer Script Layout (design-only — no code yet)

```
importers/
└── woocommerce/
    ├── WC_IMPORTER_DESIGN.md    ← this document (symlink or copy)
    ├── config.yaml              ← column name overrides for WooCommerce export variations
    └── README.md                ← operator runbook: how to export, name the file, run
```

---

## B. Import Workflow

### B.1 Phase Overview

```
Phase 0  Pre-flight checks
Phase 1  Open import run
Phase 2  Load reference data into memory
Phase 3  Parse and header-validate CSV
Phase 4  Process rows  (validate → customer upsert → order insert → line unpivot)
Phase 5  Recompute customer aggregates
Phase 6  Post-import reconciliation checks
Phase 7  Close import run
Phase 8  Archive source file
```

### B.2 Idempotency Guarantees

| Entity | Idempotency Key | On Duplicate |
|--------|----------------|-------------|
| `orders` | `woocommerce_order_id` | SKIP row entirely; log `DUPLICATE_ORDER` (severity: info) |
| `customers` | `LOWER(TRIM(email))` | UPDATE computed fields only; never overwrite PII |
| `order_lines` | covered by order dedup — if the order is skipped, its lines are skipped | — |

**Re-import safety:** Running the importer twice on the same file produces identical database state. All 917 rows on a second run will be logged as `DUPLICATE_ORDER` with `rows_skipped_duplicate = 917`.

### B.3 Historical Data Strategy

The initial import processes the full 917-row historical CSV (Oct 2023 – Jun 2026) in a single run. Subsequent imports are incremental WooCommerce exports that include only new orders. Because dedup is key-based, not date-based, the full historical CSV can be re-imported at any time safely.

SKU drift risk (2023 SKUs vs current canonical SKUs) is handled by `sku_manual_map.csv`. Expected surface area: L1 Classic launch (Oct–Dec 2023) used a different SKU format. All `UNRESOLVED_SKU` errors from the first import must be resolved before running KPI compute.

### B.4 Transaction Scope

Each order row is processed in an atomic DB transaction that includes:
1. INSERT into `orders`
2. INSERT into `order_lines` (one row per non-empty line item)

If the line insert fails for a row, the order insert is rolled back. The order ID is not reserved in `existing_order_ids` if the transaction rolled back.

Customer inserts and updates are **outside** per-order transactions — they are committed immediately on first encounter, then aggregates are recomputed in Phase 5.

### B.5 Execution Trigger

Manual. The operator:
1. Exports WooCommerce orders CSV
2. Saves to `imports/raw/YYYY-MM-DD/woocommerce/`
3. Runs the importer script (to be built in the next phase)
4. Reviews the `import_runs` record and any `import_errors` rows

---

## C. Mapping Specification

### C.1 `customers` table

| # | WooCommerce Column | Destination Column | Transformation | On Blank |
|---|-------------------|-------------------|----------------|---------|
| M-CUS-01 | `Billing Email` | `email` | `LOWER(TRIM(value))` | Log `PII_ERROR`; do not create customer |
| M-CUS-02 | `Billing Phone` | `phone` | Strip `+91` / leading `0`; keep 10 digits; validate `^[6-9][0-9]{9}$` | NULL; log `DQ_WARN` if present but invalid |
| M-CUS-03 | `Billing First Name` | `first_name` | `TRIM(value)` | NULL |
| M-CUS-04 | `Billing Last Name` | `last_name` | `TRIM(value)` | NULL |
| M-CUS-05 | `Date Created` | `first_order_at` | Parse IST → UTC; set only if earlier than existing `first_order_at` | — |
| M-CUS-06 | `Order Attribution Source` | `acquisition_source` | From customer's first-seen order only; `LOWER(value)` | NULL |
| M-CUS-07 | *(derived in Phase 5)* | `total_orders` | `COUNT(DISTINCT woocommerce_order_id)` per customer | — |
| M-CUS-08 | *(derived in Phase 5)* | `total_revenue_inr` | `SUM(order_lines.line_total_inr)` for delivered orders only | — |

**Customer upsert rules:**
- `email` (dedup key): never overwrite
- `first_name`, `last_name`, `phone`: set on INSERT; never overwrite on UPDATE (prevents PII regression)
- `first_order_at`: always take the MIN across all known orders
- `acquisition_source`: set from the chronologically earliest order; do not overwrite once set
- `total_orders`, `total_revenue_inr`: always recomputed in Phase 5; safe to overwrite

### C.2 `orders` table

| # | WooCommerce Column | Destination Column | Transformation | On Blank |
|---|-------------------|-------------------|----------------|---------|
| M-ORD-01 | `Order ID` | `woocommerce_order_id` | `CAST(value AS int)` | REJECT (V-WC-01) |
| M-ORD-02 | `Order Number` | `woocommerce_order_number` | `TRIM(value)` | NULL |
| M-ORD-03 | *(resolved from email)* | `customer_id` | FK → `customers.id` | NULL (PII_ERROR order) |
| M-ORD-04 | `Status` | `status` | `LOWER(TRIM(value))`; see §C.4 status normalisation | REJECT |
| M-ORD-05 | `Payment Method` | `payment_method` | See §C.5 payment method normalisation | NULL |
| M-ORD-06 | `Payment Method Title` | `payment_method_title` | `TRIM(value)` as-is | NULL |
| M-ORD-07 | `Transaction ID` | `transaction_id` | `TRIM(value)` if non-blank | NULL |
| M-ORD-08 | `Cart Subtotal` | `subtotal_inr` | `ROUND(CAST(value AS numeric), 2)` | NULL |
| M-ORD-09 | `Cart Discount Amount` | `discount_inr` | `ROUND(CAST(value AS numeric), 2)` | `0.00` |
| M-ORD-10 | `Order Shipping` | `shipping_charged_inr` | `ROUND(CAST(value AS numeric), 2)` | `0.00` |
| M-ORD-11 | `Order Total` | `order_total_inr` | `ROUND(CAST(value AS numeric), 2)` | REJECT (V-WC-02) |
| M-ORD-12 | `utm_source` | `attribution_source` | `LOWER(TRIM(value))` | NULL |
| M-ORD-13 | `utm_medium` | `attribution_medium` | `LOWER(TRIM(value))` | NULL |
| M-ORD-14 | `utm_campaign` | `attribution_campaign` | `TRIM(value)` | NULL |
| M-ORD-15 | `Device` | `attribution_device` | See §C.6 device normalisation | NULL |
| M-ORD-16 | `Billing City` | `billing_city` | `TRIM(value)` | NULL |
| M-ORD-17 | `Billing State` | `billing_state` | `TRIM(value)` | NULL |
| M-ORD-18 | `Billing Postcode` | `billing_pincode` | Validate `^[1-9][0-9]{5}$`; store as text | NULL; log `DQ_WARN` if present but invalid |
| M-ORD-19 | `Date Created` | `ordered_at` | Parse IST → UTC (`timestamptz`); subtract 05:30 | REJECT (V-WC-03) |
| M-ORD-20 | `Date Paid` | `paid_at` | Parse IST → UTC; NULL if blank | NULL |

### C.3 `order_lines` table

WooCommerce exports up to 4 line items as column groups. Each group (`Item N Name`, `Item N SKU`, `Item N Quantity`, `Item N Price`, `Item N Total`, `Item N Product ID`) is unpivoted into one `order_lines` row. Skip group N entirely if both `Item N Name` and `Item N SKU` are blank.

| # | WooCommerce Column | Destination Column | Transformation | On Blank |
|---|-------------------|-------------------|----------------|---------|
| M-LIN-01 | `Item N Name` | `product_name_raw` | `TRIM(value)` | NULL (item can still import if SKU present) |
| M-LIN-02 | `Item N SKU` | `sku_raw` | `TRIM(value)` | NULL |
| M-LIN-03 | `Item N Quantity` | `quantity` | `CAST(value AS int)` | Skip item if 0 or blank |
| M-LIN-04 | `Item N Price` | `unit_price_inr` | `ROUND(CAST(value AS numeric), 2)` | `0.00` |
| M-LIN-05 | *(derived)* | `line_total_inr` | `quantity × unit_price_inr`; cross-check against `Item N Total` | — |
| M-LIN-06 | `Item N Total` | `line_subtotal_inr` | `ROUND(CAST(value AS numeric), 2)` | NULL |
| M-LIN-07 | `Item N Product ID` | *(used in SKU resolution only)* | `CAST(value AS int)` — not stored | NULL |
| M-LIN-08 | *(SKU resolution)* | `variant_id` | 4-step lookup (see §C.7); NULL if unresolved | NULL; log `UNRESOLVED_SKU` |
| M-LIN-09 | *(not in WC export)* | `woocommerce_line_item_id` | Not available in CSV export; stored as NULL | NULL |

### C.4 Order Status Normalisation

| Raw WooCommerce Value | Stored `status` |
|-----------------------|----------------|
| `Processing`, `processing` | `processing` |
| `Completed`, `completed` | `completed` |
| `Cancelled`, `cancelled` | `cancelled` |
| `Refunded`, `refunded` | `refunded` |
| `On Hold`, `on-hold`, `on_hold` | `on-hold` |
| `Pending Payment`, `pending`, `pending payment` | `pending` |
| `Failed`, `failed` | `failed` |
| Any other value | Store as-is lowercased; log `DQ_WARN` |

### C.5 Payment Method Normalisation

| Raw WooCommerce Value (case-insensitive) | Stored `payment_method` |
|------------------------------------------|------------------------|
| `Gokwik (prepaid)`, `gokwik_prepaid`, `gokwik-prepaid`, `gokwik prepaid` | `gokwik_prepaid` |
| `Gokwik (COD)`, `gokwik_cod`, `gokwik-cod`, `gokwik cod` | `gokwik_cod` |
| `EaseBuzz`, `easebuzz`, `ease buzz` | `easebuzz` |
| `Infibeam`, `infibeam`, `CCAvenue`, `ccavenue` | `infibeam` |
| `Cash on delivery`, `cod`, `COD`, `cash on delivery` | `cod` |
| `Razorpay`, `razorpay` | `razorpay` *(store if encountered; not in schema enum — log `DQ_WARN`)* |
| Any unmatched value | Store `NULL`; log `DQ_WARN` with raw value |

### C.6 Device Normalisation

| Raw Value (case-insensitive) | Stored `attribution_device` |
|------------------------------|----------------------------|
| `mobile`, `phone`, `smartphone` | `mobile` |
| `desktop`, `computer` | `desktop` |
| `tablet`, `ipad` | `tablet` |
| Any other / blank | `NULL` |

### C.7 SKU Resolution (4-Step Priority)

Applied to each `sku_raw` + optional `woocommerce_product_id` from order line:

```
Step 1 — Exact canonical match:
  LOOKUP: product_variants.sku = sku_raw
  IF found → return variant_id

Step 2 — Shiprocket channel SKU match:
  LOOKUP: product_variants.shiprocket_channel_sku = sku_raw
  IF found → return variant_id

Step 3 — WooCommerce product ID match:
  IF woocommerce_product_id IS NOT NULL:
    LOOKUP: product_variants.woocommerce_product_id = item_product_id
    IF found → return variant_id

Step 4 — Manual map lookup:
  LOOKUP: sku_manual_map.csv raw_sku = sku_raw
  IF found → return canonical_sku → then Step 1

Step 5 — Unresolved:
  return NULL
  log UNRESOLVED_SKU (severity: warning)
  order_lines.variant_id stored as NULL
  KPI compute BLOCKED until resolved (per RC-REV-04)
```

### C.8 IST → UTC Timestamp Conversion

All WooCommerce timestamps (`Date Created`, `Date Paid`) are in IST (UTC+5:30).

```
UTC = IST_datetime − 05:30
```

Example: `2023-10-15 10:42:00` (IST) → `2023-10-15 05:12:00` (UTC)

Implementation note: Parse as a naive datetime, then subtract 5 hours 30 minutes, then store as UTC `timestamptz`. Do not rely on system timezone settings.

---

## D. Validation Specification

Validation runs at three levels: file-level, row-level (hard), and field-level (soft/DQ).

### D.1 File-Level Checks (Pre-parse — fail entire run if any fail)

| Check | Condition | Action |
|-------|-----------|--------|
| F-01 | File exists and is readable | Abort; set import_run.status = 'failed' |
| F-02 | File extension is `.csv` or `.xlsx` | Abort |
| F-03 | Required columns present (see §D.4) | Abort; list missing columns in `error_summary` |
| F-04 | `product_variants` table has rows | Abort; cannot resolve any SKUs |
| F-05 | `launches` and `products` tables have rows | Abort; reference data not seeded |
| F-06 | At least 1 data row (non-header) | Abort; empty file |

### D.2 Row-Level Validation (Hard — reject individual row on failure)

| Rule | Field | Check | Error Code | Severity |
|------|-------|-------|-----------|---------|
| V-WC-01 | `Order ID` | NOT NULL AND is integer AND > 0 | `FIELD_REJECTED` | error |
| V-WC-02 | `Order Total` | NOT NULL AND is numeric AND ≥ 0 | `FIELD_REJECTED` | error |
| V-WC-03 | `Date Created` | Valid datetime, parseable as IST, and ≤ NOW() + 24h | `FIELD_REJECTED` | error |
| V-WC-07 | Line items | At least one non-blank line item (quantity > 0) exists | `FIELD_REJECTED` | error |

Rows that fail a hard rule are:
1. NOT inserted into `orders` or `order_lines`
2. Logged to `import_errors` with the full `source_row_snapshot` (JSONB)
3. Counted in `import_runs.rows_failed`

### D.3 Field-Level Validation (Soft — import row, nullify or flag bad field)

| Rule | Field | Check | Error Code | Severity | Action |
|------|-------|-------|-----------|---------|--------|
| V-WC-04 | `Status` | IN known status values after normalisation | `DQ_WARN` | warning | Store normalised; log |
| V-WC-05 | `Billing Email` | Non-blank AND matches `^\S+@\S+\.\S+$` | `PII_ERROR` | warning | customer_id = NULL; order still imported |
| V-WC-06 | Order total vs line sum | `ABS(order_total − (Σ line_total + shipping − discount)) ≤ 1.00` | `RECONCILE_WARN` | warning | Import; log variance |
| V-WC-08 | `Billing Postcode` | If present: matches `^[1-9][0-9]{5}$` | `DQ_WARN` | warning | Nullify; log |
| V-WC-09 | `Billing Phone` | If present: 10 digits after normalisation, starts with 6–9 | `DQ_WARN` | warning | Nullify; log |
| V-WC-10 | `Item N Quantity` | If item name/SKU present: quantity must be > 0 | `DQ_WARN` | warning | Skip that line item only |
| V-WC-11 | `Date Paid` | If present: valid datetime AND `paid_at >= ordered_at` | `DQ_WARN` | warning | Nullify `paid_at`; log |
| V-WC-12 | `Item N SKU` | SKU resolves to a known variant (Steps 1–4 in §C.7) | `UNRESOLVED_SKU` | warning | `variant_id = NULL`; import; blocks KPI compute |
| V-WC-13 | `Payment Method` | Matches a known payment method pattern | `DQ_WARN` | warning | Store NULL; log raw value |

Rows that trigger soft rules are:
1. Inserted into `orders` and `order_lines` (with affected fields nullified or flagged)
2. Logged to `import_errors`
3. Counted in `import_runs.rows_warnings`

### D.4 Required Column Presence Check

The following columns **must** exist in the CSV header. The check is case-insensitive; leading/trailing spaces are stripped before matching.

**Order-level columns (22):**
`Order ID`, `Order Number`, `Date Created`, `Date Paid`, `Status`,
`Payment Method`, `Payment Method Title`, `Transaction ID`,
`Cart Subtotal`, `Cart Discount Amount`, `Order Shipping`, `Order Total`,
`Billing First Name`, `Billing Last Name`, `Billing Email`, `Billing Phone`,
`Billing City`, `Billing State`, `Billing Postcode`,
`utm_source`, `utm_medium`, `utm_campaign`

**Line item columns (minimum — Item 1 required; Items 2–4 optional):**
`Item 1 Name`, `Item 1 SKU`, `Item 1 Quantity`, `Item 1 Price`, `Item 1 Total`

**Optional (use if present):**
`Item 1 Product ID`, `Item 2 Name` … `Item 4 Total`, `Item 2 Product ID` … `Item 4 Product ID`,
`Device`, `Order Attribution Source`

### D.5 Unpivot Completeness Rule

For each `Item N` group (N = 1 to 4), the group is considered **present** if ANY of:
- `Item N Name` is non-blank, OR
- `Item N SKU` is non-blank

If the group is present but `Item N Quantity` is 0 or blank, log `DQ_WARN` (V-WC-10) and skip that specific line item. The rest of the order still imports.

---

## E. Reconciliation Specification

These checks run automatically at the end of Phase 6. Results are stored in `import_runs`.

### E.1 Check Schedule

| Check | When Run | Severity | Blocks KPI Compute |
|-------|---------|---------|-------------------|
| RC-REV-01 | After every WC import | HARD | Yes |
| RC-REV-02 | After every WC import | HARD | Yes |
| RC-REV-03 | After every WC import | SOFT | No |
| RC-REV-04 | After every WC import | HARD | Yes |
| RC-REV-05 | After Shiprocket import | HARD | Yes (deferred) |
| RC-REV-06 | After every WC import | ADVISORY | No |
| RC-REV-07 | After both WC + SR imported | SOFT | No (deferred) |

Checks RC-REV-05 and RC-REV-07 are **deferred** — they require Shiprocket data. They are included in the Shiprocket importer's reconciliation phase. Documenting them here for completeness.

### E.2 RC-REV-01 — WooCommerce Order Count
**Severity:** HARD

**Purpose:** Confirm the database contains the expected number of imported orders after this run.

**Expected result:**
```
COUNT(orders) = prior_count + rows_imported (from this run)
```

**Computed as:**
```
expected = (SELECT COUNT(*) FROM orders)
           -- equals: all historical orders including this batch
```

For the initial historical import, expected = 917 minus rejected rows. Log the final count in `reconciliation_notes`.

**On failure:** Set `reconciliation_status = 'failed'`; set `hard_checks_failed = 1`. KPI compute blocked.

### E.3 RC-REV-02 — No Orders Without Lines
**Severity:** HARD

**Purpose:** Every successfully imported order must have at least one `order_lines` row.

**Check:**
```sql
SELECT COUNT(*) AS orphan_orders
FROM orders o
WHERE NOT EXISTS (
  SELECT 1 FROM order_lines ol WHERE ol.order_id = o.id
);
```
**Expected:** 0

**On failure:** Log which `woocommerce_order_id` values have no lines. These are insertion errors — investigate the row-level transaction.

### E.4 RC-REV-03 — Order Total vs Line Sum
**Severity:** SOFT

**Purpose:** Verify `order_total ≈ Σ(line_total) + shipping − discount` within ±₹1 per order.

**Check:**
```sql
SELECT COUNT(*) AS mismatched_orders
FROM orders o
LEFT JOIN (
  SELECT order_id, SUM(line_total_inr) AS line_sum
  FROM order_lines GROUP BY order_id
) ol ON ol.order_id = o.id
WHERE ABS(
  o.order_total_inr
  - COALESCE(ol.line_sum, 0)
  - o.shipping_charged_inr
  + o.discount_inr
) > 1.00;
```
**Expected:** 0 rows  
**On failure:** Log affected `woocommerce_order_id` values in `reconciliation_notes`. Set `soft_checks_warned + 1`. Import is not blocked.

### E.5 RC-REV-04 — No Unresolved SKUs
**Severity:** HARD

**Purpose:** All `order_lines` rows must have a resolved `variant_id` before KPI compute can run.

**Check:**
```sql
SELECT COUNT(*) AS unresolved_sku_lines
FROM order_lines
WHERE variant_id IS NULL;
```
**Expected:** 0

**On failure:** Do NOT block the import itself — unresolved SKU rows are still inserted. Block KPI compute only. Log count and affected `sku_raw` values in `reconciliation_notes`. Operator must add entries to `sku_manual_map.csv` and re-run.

**Note:** RC-REV-04 failing does not prevent further imports (Shiprocket, etc.) from running. It only prevents the final KPI snapshot computation step (Phase 9 of IMPORT_EXECUTION_ORDER.md).

### E.6 RC-REV-06 — Shipping Revenue Excluded (Advisory)
**Severity:** ADVISORY

**Purpose:** Document the total shipping collected; confirm it is excluded from all revenue KPIs.

**Check:**
```sql
SELECT
  SUM(shipping_charged_inr) AS total_shipping_collected_inr,
  COUNT(*) FILTER (WHERE shipping_charged_inr > 0) AS orders_with_shipping
FROM orders;
```
**Expected:** No specific threshold — document the value in `reconciliation_notes`.  
**Action:** Record result; no block.

### E.7 Reconciliation Result Mapping

After running all applicable checks, determine `reconciliation_status`:

| Condition | `reconciliation_status` |
|-----------|------------------------|
| Any HARD check failed | `failed` |
| All HARD checks passed, at least one SOFT warned | `flagged` |
| All applicable checks passed (green) | `passed` |
| Operator manually bypassed checks | `skipped` |

---

## F. Pseudocode

### F.1 Main Procedure

```
PROCEDURE import_woocommerce(
  source_file  : FilePath,
  triggered_by : UserID
) → ImportRunID

════════════════════════════════════════════════════════════════
PHASE 0: PRE-FLIGHT CHECKS
════════════════════════════════════════════════════════════════

ASSERT file_exists(source_file)
  ON FAIL → ABORT with "Source file not found at {source_file}"

ASSERT file_extension(source_file) IN ['.csv', '.xlsx']
  ON FAIL → ABORT with "Unsupported file format"

ASSERT db_table_has_rows('product_variants')
  ON FAIL → ABORT with "product_variants is empty — seed reference data first"

ASSERT db_table_has_rows('launches')
  ON FAIL → ABORT with "launches is empty — seed reference data first"


════════════════════════════════════════════════════════════════
PHASE 1: OPEN IMPORT RUN
════════════════════════════════════════════════════════════════

run_id ← DB_INSERT import_runs (
  source         = 'woocommerce',
  source_file    = basename(source_file),
  source_sheet   = 'Woocom - Orders',
  status         = 'running',
  triggered_by   = triggered_by,
  run_started_at = NOW()
)

LOG "Import run #{run_id} opened"


════════════════════════════════════════════════════════════════
PHASE 2: LOAD REFERENCE DATA INTO MEMORY
════════════════════════════════════════════════════════════════

# Load once — avoids per-row DB roundtrips across 917 rows

existing_order_ids ← SET {
  SELECT woocommerce_order_id FROM orders
}

customer_email_map ← MAP {
  SELECT LOWER(email), id FROM customers
}

variant_lookup ← {
  by_sku:          MAP { sku → id FROM product_variants },
  by_channel_sku:  MAP { shiprocket_channel_sku → id
                        FROM product_variants
                        WHERE shiprocket_channel_sku IS NOT NULL },
  by_wc_product_id: MAP { woocommerce_product_id → id
                          FROM product_variants
                          WHERE woocommerce_product_id IS NOT NULL }
}

manual_sku_map ← LOAD_CSV('imports/config/sku_manual_map.csv')
  # MAP { raw_sku → canonical_sku }
  # Empty MAP is valid; zero rows means no legacy SKU overrides needed


════════════════════════════════════════════════════════════════
PHASE 3: PARSE CSV AND VALIDATE HEADERS
════════════════════════════════════════════════════════════════

raw_rows ← PARSE_CSV(source_file, encoding='utf-8-sig')
  # utf-8-sig handles BOM from Excel CSV exports

IF PARSE fails:
  UPDATE import_runs SET status='failed',
    error_summary='Failed to parse file: {error}'
  WHERE id = run_id
  ABORT

header_row ← raw_rows[0]
data_rows  ← raw_rows[1:]   # Row 1 is header; data starts at row 2

missing_columns ← REQUIRED_COLUMNS − SET(header_row)
IF missing_columns IS NOT EMPTY:
  UPDATE import_runs SET status='failed',
    error_summary='Missing required columns: {missing_columns}'
  WHERE id = run_id
  ABORT

IF len(data_rows) == 0:
  UPDATE import_runs SET status='failed',
    error_summary='File contains no data rows'
  WHERE id = run_id
  ABORT

UPDATE import_runs SET rows_in_source = len(data_rows) WHERE id = run_id
LOG "Loaded {len(data_rows)} rows from {basename(source_file)}"


════════════════════════════════════════════════════════════════
PHASE 4: PROCESS ROWS
════════════════════════════════════════════════════════════════

counters ← { imported:0, skipped_dup:0, failed:0, warnings:0 }
deferred_customer_update_ids ← SET {}

FOR row_num, row IN enumerate(data_rows, start=2):
  # row_num=2 because row 1 is the CSV header

  ┌─ 4.1 REQUIRED FIELD VALIDATION ──────────────────────────────┐

  wc_order_id ← parse_int(row['Order ID'])
  IF wc_order_id IS NULL OR wc_order_id <= 0:
    LOG_ERROR(run_id, row_num, row,
      code='FIELD_REJECTED', field='Order ID',
      msg='Order ID is missing or non-positive integer',
      severity='error')
    counters.failed++
    CONTINUE

  order_total ← parse_decimal(row['Order Total'])
  IF order_total IS NULL OR order_total < 0:
    LOG_ERROR(run_id, row_num, row,
      code='FIELD_REJECTED', field='Order Total',
      msg='Order Total is required and must be ≥ 0',
      severity='error')
    counters.failed++
    CONTINUE

  ordered_at_utc ← parse_ist_to_utc(row['Date Created'])
  IF ordered_at_utc IS NULL:
    LOG_ERROR(run_id, row_num, row,
      code='FIELD_REJECTED', field='Date Created',
      msg='Date Created is missing or unparseable',
      severity='error')
    counters.failed++
    CONTINUE

  IF ordered_at_utc > NOW() + 24_HOURS:
    LOG_ERROR(run_id, row_num, row,
      code='FIELD_REJECTED', field='Date Created',
      msg='Date Created is in the future',
      severity='error')
    counters.failed++
    CONTINUE

  └──────────────────────────────────────────────────────────────┘

  ┌─ 4.2 ORDER DEDUP ─────────────────────────────────────────────┐

  IF wc_order_id IN existing_order_ids:
    LOG_ERROR(run_id, row_num, row,
      code='DUPLICATE_ORDER', field='Order ID',
      field_value=str(wc_order_id),
      msg='Order already imported; skipping',
      severity='info')
    counters.skipped_dup++
    CONTINUE

  └──────────────────────────────────────────────────────────────┘

  ┌─ 4.3 CUSTOMER RESOLUTION ─────────────────────────────────────┐

  email_raw ← row['Billing Email']
  email     ← LOWER(TRIM(email_raw)) IF email_raw IS NOT BLANK ELSE NULL
  customer_id ← NULL

  IF email IS NULL OR NOT matches_email_regex(email):
    LOG_ERROR(run_id, row_num, row,
      code='PII_ERROR', field='Billing Email',
      msg='Missing or invalid email — order imported without customer link',
      severity='warning')
    counters.warnings++
    # customer_id stays NULL; order still imports

  ELSE IF email IN customer_email_map:
    customer_id ← customer_email_map[email]
    deferred_customer_update_ids.add(customer_id)

  ELSE:
    # Validate phone before inserting
    phone_raw ← row['Billing Phone']
    phone     ← normalise_phone(phone_raw)   # see §F.3
    IF phone_raw IS NOT BLANK AND phone IS NULL:
      LOG_ERROR(run_id, row_num, row,
        code='DQ_WARN', field='Billing Phone',
        msg='Phone present but failed normalisation; stored as NULL',
        severity='warning')
      counters.warnings++

    customer_id ← DB_INSERT customers (
      email              = email,
      phone              = phone,
      first_name         = TRIM(row['Billing First Name']),
      last_name          = TRIM(row['Billing Last Name']),
      first_order_at     = ordered_at_utc,
      acquisition_source = LOWER(TRIM(row['Order Attribution Source'])) IF present ELSE NULL,
      total_orders       = 0,        # recomputed in Phase 5
      total_revenue_inr  = 0.00      # recomputed in Phase 5
    )

    customer_email_map[email]  ← customer_id
    deferred_customer_update_ids.add(customer_id)

  └──────────────────────────────────────────────────────────────┘

  ┌─ 4.4 SOFT FIELD VALIDATION ───────────────────────────────────┐

  # Status
  status ← LOWER(TRIM(row['Status']))
  IF status NOT IN KNOWN_STATUSES:
    LOG_ERROR(run_id, row_num, row, code='DQ_WARN', field='Status',
      msg='Unrecognised status value; stored as-is', severity='warning')
    counters.warnings++

  # Payment method
  payment_method ← normalise_payment_method(row['Payment Method'])
  IF row['Payment Method'] IS NOT BLANK AND payment_method IS NULL:
    LOG_ERROR(run_id, row_num, row, code='DQ_WARN', field='Payment Method',
      field_value=row['Payment Method'], msg='Unrecognised payment method',
      severity='warning')
    counters.warnings++

  # Billing postcode
  pincode_raw ← row['Billing Postcode']
  billing_pincode ← NULL
  IF pincode_raw IS NOT BLANK:
    IF matches_regex(pincode_raw, r'^[1-9][0-9]{5}$'):
      billing_pincode ← pincode_raw
    ELSE:
      LOG_ERROR(run_id, row_num, row, code='DQ_WARN', field='Billing Postcode',
        field_value=pincode_raw, msg='Invalid Indian postcode format; nullified',
        severity='warning')
      counters.warnings++

  # Date paid
  paid_at_utc ← NULL
  IF row['Date Paid'] IS NOT BLANK:
    paid_at_utc ← parse_ist_to_utc(row['Date Paid'])
    IF paid_at_utc IS NULL:
      LOG_ERROR(run_id, row_num, row, code='DQ_WARN', field='Date Paid',
        msg='Date Paid unparseable; nullified', severity='warning')
      counters.warnings++
    ELSE IF paid_at_utc < ordered_at_utc:
      LOG_ERROR(run_id, row_num, row, code='DQ_WARN', field='Date Paid',
        msg='Date Paid is before Date Created; nullified', severity='warning')
      paid_at_utc ← NULL
      counters.warnings++

  └──────────────────────────────────────────────────────────────┘

  ┌─ 4.5 UNPIVOT LINE ITEMS ──────────────────────────────────────┐

  line_items ← []
  FOR i IN [1, 2, 3, 4]:
    item_name  ← TRIM(row.get(f'Item {i} Name',  ''))
    item_sku   ← TRIM(row.get(f'Item {i} SKU',   ''))
    item_qty   ← parse_int(row.get(f'Item {i} Quantity', ''))
    item_price ← parse_decimal(row.get(f'Item {i} Price', ''))
    item_total ← parse_decimal(row.get(f'Item {i} Total', ''))
    item_pid   ← parse_int(row.get(f'Item {i} Product ID', ''))

    IF item_name IS BLANK AND item_sku IS BLANK:
      CONTINUE   # Group N not present — stop checking further N values

    IF item_qty IS NULL OR item_qty <= 0:
      LOG_ERROR(run_id, row_num, row, code='DQ_WARN',
        field=f'Item {i} Quantity',
        msg=f'Item {i} has name/SKU but zero/missing quantity; item skipped',
        severity='warning')
      counters.warnings++
      CONTINUE

    line_items.append({
      name:       item_name,
      sku:        item_sku,
      qty:        item_qty,
      price:      item_price   ?? 0.00,
      total:      item_total,
      product_id: item_pid,
      slot:       i
    })

  IF len(line_items) == 0:
    LOG_ERROR(run_id, row_num, row, code='FIELD_REJECTED',
      msg='Order has no valid line items after unpivot',
      severity='error')
    counters.failed++
    CONTINUE

  └──────────────────────────────────────────────────────────────┘

  ┌─ 4.6 INSERT ORDER + ORDER LINES (atomic transaction) ─────────┐

  BEGIN TRANSACTION

    order_id ← DB_INSERT orders (
      woocommerce_order_id     = wc_order_id,
      woocommerce_order_number = TRIM(row['Order Number']),
      customer_id              = customer_id,
      status                   = status,
      payment_method           = payment_method,
      payment_method_title     = TRIM(row['Payment Method Title']),
      transaction_id           = row['Transaction ID'] IF non-blank ELSE NULL,
      subtotal_inr             = parse_decimal(row['Cart Subtotal']),
      discount_inr             = parse_decimal(row['Cart Discount Amount']) ?? 0.00,
      shipping_charged_inr     = parse_decimal(row['Order Shipping']) ?? 0.00,
      order_total_inr          = order_total,
      attribution_source       = LOWER(TRIM(row['utm_source'])) IF non-blank ELSE NULL,
      attribution_medium       = LOWER(TRIM(row['utm_medium'])) IF non-blank ELSE NULL,
      attribution_campaign     = TRIM(row['utm_campaign']) IF non-blank ELSE NULL,
      attribution_device       = normalise_device(row.get('Device', '')),
      billing_city             = TRIM(row['Billing City']),
      billing_state            = TRIM(row['Billing State']),
      billing_pincode          = billing_pincode,
      ordered_at               = ordered_at_utc,
      paid_at                  = paid_at_utc
    )

    existing_order_ids.add(wc_order_id)
    computed_line_total ← 0.00

    FOR item IN line_items:

      # SKU resolution (see §C.7)
      variant_id ← resolve_variant(
        sku_raw        = item.sku,
        wc_product_id  = item.product_id,
        lookup         = variant_lookup,
        manual_map     = manual_sku_map
      )

      IF variant_id IS NULL AND (item.sku IS NOT BLANK OR item.product_id IS NOT NULL):
        LOG_ERROR(run_id, row_num, row,
          code='UNRESOLVED_SKU', field='Item SKU',
          field_value=item.sku,
          msg=f'SKU "{item.sku}" has no matching product_variants row; '
              'variant_id stored as NULL; KPI compute blocked until resolved',
          severity='warning')
        counters.warnings++

      line_total ← item.total IF item.total IS NOT NULL ELSE item.qty * item.price
      computed_line_total += line_total

      DB_INSERT order_lines (
        order_id          = order_id,
        variant_id        = variant_id,
        sku_raw           = item.sku IF non-blank ELSE NULL,
        product_name_raw  = item.name IF non-blank ELSE NULL,
        quantity          = item.qty,
        unit_price_inr    = item.price,
        line_total_inr    = line_total,
        line_subtotal_inr = item.total
      )

    END FOR (line items)

  COMMIT TRANSACTION

  └──────────────────────────────────────────────────────────────┘

  ┌─ 4.7 ORDER TOTAL RECONCILIATION (V-WC-06) ────────────────────┐

  shipping   ← parse_decimal(row['Order Shipping']) ?? 0.00
  discount   ← parse_decimal(row['Cart Discount Amount']) ?? 0.00
  computed   ← computed_line_total + shipping - discount
  variance   ← ABS(order_total - computed)

  IF variance > 1.00:
    LOG_ERROR(run_id, row_num, row,
      code='RECONCILE_WARN', field='Order Total',
      msg=f'Order {wc_order_id}: declared total ₹{order_total} ≠ '
          f'computed ₹{computed} (variance ₹{variance:.2f})',
      severity='warning')
    counters.warnings++

  └──────────────────────────────────────────────────────────────┘

  counters.imported++

END FOR (rows loop)


════════════════════════════════════════════════════════════════
PHASE 5: RECOMPUTE CUSTOMER AGGREGATES
════════════════════════════════════════════════════════════════

# Deferred batch update — one SQL statement per customer, not per row.
# total_revenue_inr is set to 0.00 for all customers at this stage because
# Shiprocket has not yet been imported. It will be recomputed fully after
# Phase 3 of IMPORT_EXECUTION_ORDER.md (shipments import).

FOR customer_id IN deferred_customer_update_ids:

  DB_UPDATE customers SET
    total_orders = (
      SELECT COUNT(DISTINCT woocommerce_order_id)
      FROM orders
      WHERE customer_id = customer_id
    ),
    first_order_at = (
      SELECT MIN(ordered_at)
      FROM orders
      WHERE customer_id = customer_id
    )
    # total_revenue_inr intentionally not updated here:
    # delivered_at comes from shipments (not yet imported)
  WHERE id = customer_id


════════════════════════════════════════════════════════════════
PHASE 6: POST-IMPORT RECONCILIATION
════════════════════════════════════════════════════════════════

recon ← RUN_RECONCILIATION_CHECKS(
  checks = [RC-REV-01, RC-REV-02, RC-REV-03, RC-REV-04, RC-REV-06]
  # RC-REV-05 and RC-REV-07 are deferred to Shiprocket importer
)

recon_status ←
  'failed'  IF recon.hard_failed > 0
  'flagged' IF recon.hard_failed == 0 AND recon.soft_warned > 0
  'passed'  OTHERWISE

LOG "Reconciliation: {recon_status} "
    "({recon.hard_passed} HARD passed, {recon.hard_failed} HARD failed, "
    "{recon.soft_warned} SOFT warned)"


════════════════════════════════════════════════════════════════
PHASE 7: CLOSE IMPORT RUN
════════════════════════════════════════════════════════════════

final_status ←
  'failed'    IF counters.imported == 0 AND counters.failed > 0
  'partial'   IF counters.failed > 0 AND counters.imported > 0
  'completed' OTHERWISE

DB_UPDATE import_runs SET
  status                 = final_status,
  run_completed_at       = NOW(),
  rows_imported          = counters.imported,
  rows_skipped_duplicate = counters.skipped_dup,
  rows_failed            = counters.failed,
  rows_warnings          = counters.warnings,
  reconciliation_status  = recon_status,
  reconciliation_run_at  = NOW(),
  reconciliation_notes   = recon.summary_text,
  hard_checks_passed     = recon.hard_passed,
  hard_checks_failed     = recon.hard_failed,
  soft_checks_passed     = recon.soft_passed,
  soft_checks_warned     = recon.soft_warned
WHERE id = run_id

LOG "Import run #{run_id} closed: {final_status}"
LOG "Imported: {counters.imported} | Skipped: {counters.skipped_dup} | "
    "Failed: {counters.failed} | Warnings: {counters.warnings}"


════════════════════════════════════════════════════════════════
PHASE 8: ARCHIVE SOURCE FILE
════════════════════════════════════════════════════════════════

year ← YEAR(NOW())
date ← DATE(NOW())

IF final_status IN ['completed', 'partial']:
  COPY  source_file → imports/archive/woocommerce/{year}/{basename(source_file)}
  MOVE  source_file → imports/processed/{date}/woocommerce/{basename(source_file)}
ELSE:
  MOVE  source_file → imports/errors/{date}/woocommerce/{basename(source_file)}

RETURN run_id

END PROCEDURE
```

---

### F.2 resolve_variant Helper

```
FUNCTION resolve_variant(
  sku_raw       : String | NULL,
  wc_product_id : Int    | NULL,
  lookup        : VariantLookup,
  manual_map    : Map<String, String>
) → VariantID | NULL

  # Step 1: Exact canonical SKU match
  IF sku_raw IS NOT BLANK AND sku_raw IN lookup.by_sku:
    RETURN lookup.by_sku[sku_raw]

  # Step 2: Shiprocket channel SKU match
  IF sku_raw IS NOT BLANK AND sku_raw IN lookup.by_channel_sku:
    RETURN lookup.by_channel_sku[sku_raw]

  # Step 3: WooCommerce product ID match
  IF wc_product_id IS NOT NULL AND wc_product_id IN lookup.by_wc_product_id:
    RETURN lookup.by_wc_product_id[wc_product_id]

  # Step 4: Manual map (legacy SKU formats from 2023)
  IF sku_raw IS NOT BLANK AND sku_raw IN manual_map:
    canonical ← manual_map[sku_raw]
    IF canonical IN lookup.by_sku:
      RETURN lookup.by_sku[canonical]

  # Step 5: Unresolved
  RETURN NULL

END FUNCTION
```

---

### F.3 normalise_phone Helper

```
FUNCTION normalise_phone(raw : String | NULL) → String | NULL

  IF raw IS NULL OR TRIM(raw) IS BLANK:
    RETURN NULL

  digits ← STRIP_NON_DIGITS(raw)   # remove spaces, hyphens, dots, +

  IF len(digits) == 12 AND digits.startswith('91'):
    digits ← digits[2:]            # strip country code +91

  IF len(digits) == 11 AND digits.startswith('0'):
    digits ← digits[1:]            # strip trunk prefix 0

  IF len(digits) == 10 AND matches_regex(digits, r'^[6-9][0-9]{9}$'):
    RETURN digits

  RETURN NULL   # invalid; caller logs DQ_WARN

END FUNCTION
```

---

### F.4 LOG_ERROR Helper

```
FUNCTION LOG_ERROR(
  run_id       : ImportRunID,
  row_number   : Int,
  raw_row      : Dict,
  code         : String,
  msg          : String,
  severity     : 'error' | 'warning' | 'info',
  field        : String | NULL = NULL,
  field_value  : String | NULL = NULL
)

  DB_INSERT import_errors (
    import_run_id       = run_id,
    row_number          = row_number,
    source_row_snapshot = JSON(raw_row),    # full row preserved for re-import
    error_code          = code,
    error_message       = msg,
    severity            = severity,
    field_name          = field,
    field_value_raw     = field_value,
    resolution_status   = 'unresolved'
  )

END FUNCTION
```

---

### F.5 parse_ist_to_utc Helper

```
FUNCTION parse_ist_to_utc(value : String | NULL) → Timestamp | NULL

  IF value IS NULL OR TRIM(value) IS BLANK:
    RETURN NULL

  # WooCommerce exports dates as: 'YYYY-MM-DD HH:MM:SS' (no timezone marker)
  # These are always IST (UTC+05:30)

  TRY:
    naive_dt ← PARSE_DATETIME(value, formats=[
      'YYYY-MM-DD HH:MM:SS',
      'DD/MM/YYYY HH:MM:SS',
      'DD/MM/YYYY HH:MM',
      'YYYY-MM-DD'
    ])
    utc_dt ← naive_dt − DURATION(hours=5, minutes=30)
    RETURN utc_dt AS timestamptz
  ON PARSE_ERROR:
    RETURN NULL

END FUNCTION
```

---

## Appendix: Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Orders dedup: SKIP, not UPDATE | WooCommerce is the authoritative source. Updating existing orders on re-import could overwrite manually corrected data. |
| Customers dedup: UPDATE computed fields only, never PII | PII columns (email, phone, name) must not be silently overwritten; they may have been corrected manually post-import. |
| Customer aggregate update deferred to Phase 5 | A single batch SQL update per customer is more efficient than N+1 updates during row processing. |
| `total_revenue_inr` not computed on WC import | Revenue recognition requires `shipments.delivered_at` (BR-004). Shiprocket must be imported first. Phase 5 only updates `total_orders` and `first_order_at`. |
| SKU resolution: import row with NULL variant_id | Blocking the entire import on one unresolved SKU would reject valid revenue data. The pipeline flags the gap and blocks only KPI compute. |
| Per-order DB transaction | Ensures an order and all its line items are atomically written. A partial write (order inserted, lines failed) is impossible. |
| Reconciliation deferred checks (RC-REV-05, RC-REV-07) | These checks reference `shipments` data. Running them before Shiprocket is imported would always fail. They are re-run as part of the Shiprocket importer post-import phase. |
| `source_row_snapshot` stored as JSONB | Allows re-import of rejected rows without returning to the source file. The full original row is preserved verbatim. |
| Pre-load reference data into memory | 917 rows × 1 DB lookup per row = 917 queries for dedup alone. Pre-loading 3 lookup maps at the start reduces this to 3 queries total. At current data volumes this is safe. |
