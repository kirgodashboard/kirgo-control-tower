# Workbook Import Execution Plan

**Version:** 1.0  
**Source:** `imports/raw/Kirgo Numbers.xlsx`  
**Total rows to import:** ~2,155 (916 WC + 1,095 SR + 144 Returns)  
**Estimated wall-clock time:** < 5 minutes on first full run  

---

## 1. Decision: Workbook Import Replaces CSV Import for Historical Data

The CSV importer (`importers/woocommerce/`) was designed for WooCommerce's standard admin CSV export format, which uses different column names than those present in the workbook (`Woocom - Orders` sheet):

| CSV export format | Workbook format |
|---|---|
| `Order ID` (title case) | `order_id` (snake_case) |
| `Date Created` | `order_date` |
| `Date Paid` | `paid_date` |
| `Billing Email` | `billing_email` |
| `Item 1 Name` | `Product Item 1 Name` |
| `Cart Discount Amount` | `discount_total` |
| `Order Shipping` | `shipping_total` |
| Payment methods: `gokwik_cod`, `easebuzz` | Payment methods: `ccavenue`, `cod`, `gokwik_prepaid` |

**The workbook importer is the correct tool for the 916 historical orders. Do not run the CSV importer against the workbook.**

The CSV importer is retained for future use once live WooCommerce API/CSV export formats are confirmed. It may need column name updates at that point.

---

## 2. Prerequisites

Before running any import phase, confirm:

| # | Check | How to verify |
|---|---|---|
| P-01 | `product_variants` table is seeded with current SKUs | `SELECT COUNT(*) FROM product_variants;` — expect > 0 |
| P-02 | `SUPABASE_DB_URL` is set in `.env.local` | `python3 -c "from importers.workbook.config import Config; Config.db_url()"` |
| P-03 | `imports/raw/Kirgo Numbers.xlsx` exists | `ls imports/raw/` |
| P-04 | Admin user exists in `users` table | `SELECT id FROM users WHERE email = 'jiten65.b@gmail.com';` |
| P-05 | `imports/config/sku_manual_map.csv` populated with legacy SKUs | Review file; add any unmapped 2023-era SKUs |
| P-06 | `Credentials` sheet not accessible to the importer | Confirmed by importer skip logic |
| P-07 | All previous import_runs cleared (for clean historical load) | `SELECT COUNT(*) FROM import_runs;` — expect 0 on first run |

---

## 3. Execution Phases

### Phase 0 — Workbook pre-flight

**Script:** `python3 -m importers.workbook.run_import --preflight`  
**What it does:**
- Opens the workbook; verifies all expected sheets exist
- Detects and logs the `Credentials` sheet with a warning; does NOT read its contents
- Validates column headers on all 9 import-target sheets
- Reports row counts per sheet
- Does NOT write to the database
- Exits with code 0 if all checks pass, code 1 on any failure

**Expected output:**
```
[PASS] Woocom - Orders    — 916 rows, 93 cols
[PASS] SR - 2023          — 61 rows, 118 cols
[PASS] SR - 2024          — 570 rows, 118 cols
[PASS] SR - 2025          — 249 rows, 118 cols
[PASS] SR - 2026          — 215 rows, 118 cols
[PASS] Returns - 2023     — 4 rows, 121 cols
[PASS] Returns - 2024     — 67 rows, 121 cols
[PASS] Returns - 2025     — 17 rows, 121 cols
[PASS] Returns 2025 - 2026 — 56 rows, 121 cols
[WARN] Credentials        — sheet detected; contents NOT read
Preflight passed.
```

**On failure:** Fix before proceeding. Common failures: workbook locked by Excel, sheet renamed, missing column.

---

### Phase 1 — WooCommerce orders (Woocom - Orders)

**Script:** `python3 -m importers.workbook.run_import --sheet wc_orders --admin-email jiten65.b@gmail.com`  
**Source sheet:** `Woocom - Orders`  
**Destination tables:** `customers`, `orders`, `order_lines`  

**Execution order within this phase:**
1. Open import_run (source='woocommerce', sheet='Woocom - Orders')
2. Load reference data: existing order IDs, customer emails, product_variants
3. For each of 916 rows:
   a. Hard validate (order_id, order_total, order_date)
   b. Deduplicate on `woocommerce_order_id`
   c. Resolve or create customer (email dedup, auto-commit)
   d. Soft validate (status, phone, postcode, paid_date, payment_method)
   e. Unpivot Product Item 1-4 slots
   f. Resolve SKUs → variant_id (4-step)
   g. Atomic INSERT: orders + order_lines (BEGIN/COMMIT/ROLLBACK per order)
4. Batch UPDATE customer aggregates: `total_orders`, `first_order_at`
5. Run reconciliation checks: RC-REV-01, RC-REV-02, RC-REV-03, RC-REV-04, RC-REV-06
6. Close import_run

**Expected counters:**
- rows_in_source: 916
- rows_imported: ~916 (minus duplicates from reruns)
- rows_failed: 0 (on clean first run)
- rows_warnings: TBD (UNRESOLVED_SKU, DQ_WARN)

**Blocking reconciliation checks:**
- RC-REV-04: `order_lines WHERE variant_id IS NULL = 0` — must be zero before moving to Phase 2. If any unresolved SKUs remain, add them to `imports/config/sku_manual_map.csv` and re-run Phase 1.

**Not yet computed:** `customers.total_revenue_inr` — requires delivered_at from Phase 2.

---

### Phase 2 — Shiprocket shipments (SR - 2023 → 2024 → 2025 → 2026)

**Script:** `python3 -m importers.workbook.run_import --sheet sr_shipments --admin-email jiten65.b@gmail.com`  
**Source sheets:** SR - 2023, SR - 2024, SR - 2025, SR - 2026 (processed in chronological order)  
**Destination table:** `shipments`  

**Execution order within this phase:**
1. Open import_run (source='shiprocket', sheet='SR-2023..SR-2026')
2. Load reference data: orders.woocommerce_order_id map, product_variants, existing (shiprocket_order_id, master_sku) pairs
3. For each SR sheet in year order (2023 → 2026), for each row:
   a. Hard validate (Master SKU, Product Quantity, Status, Channel Created At)
   b. Deduplicate on `(shiprocket_order_id, master_sku)`
   c. Try WC order join: `Order ID (int)` → `orders.woocommerce_order_id`
   d. Normalise status, clean Go-artefact numerics, parse `N/A` dates as NULL
   e. Resolve SKU → variant_id via steps 1–2 only (Master SKU → canonical or channel SKU)
   f. INSERT shipment (no transaction needed — single row, auto-commit)
4. Run SR reconciliation: RC-SR-01 (shipment count > 0), RC-SR-02 (DELIVERED rows have delivered_at), RC-SR-03 (order match rate)
5. Compute `customers.total_revenue_inr`: sum `order_lines.line_total_inr` for all orders linked to DELIVERED shipments with `delivered_at IS NOT NULL`
6. Close import_run

**Expected counters:**
- rows_in_source: 1,095
- rows_imported: ~1,095 (minus dedupes on rerun)
- rows_warnings: ADVISORY for SR rows with no WC order match

**After Phase 2:**
- `customers.total_revenue_inr` is populated
- KPI calculation is unblocked for all orders where RC-REV-04 passed in Phase 1

---

### Phase 3 — Returns (Returns - 2023 → 2024 → 2025 → 2025-2026)

**Script:** `python3 -m importers.workbook.run_import --sheet returns --admin-email jiten65.b@gmail.com`  
**Source sheets:** Returns - 2023, Returns - 2024, Returns - 2025, Returns 2025 - 2026 (chronological order)  
**Destination tables:** `shipments` (reverse), `returns`  

**Execution order within this phase:**
1. Open import_run (source='shiprocket_returns', sheet group)
2. Load reference data: existing shipments by shiprocket_order_id and awb_code, existing returns
3. For each Returns sheet in year order, for each row:
   a. Hard validate (Status, Return Reason)
   b. Find matching forward shipment:
      - Returns-2023/2024/2025: match by `Forward ID` → `shipments.shiprocket_order_id`
      - Returns-2025-2026: match by `AWB Code` → `shipments.awb_code`
   c. Insert `shipments` row for reverse leg (channel = 'return', Is Reverse = true)
   d. Insert `returns` row linked to forward shipment
   e. Normalise Refund Status, QC Status, Return Reason
4. Run returns reconciliation: RC-RT-01 (returns count > 0), RC-RT-02 (RETURN DELIVERED rows have returned_at)
5. Close import_run

---

### Phase 4 — Full reconciliation

**Script:** `python3 -m importers.workbook.run_import --reconcile-only`  

Run after all three data phases to produce a complete audit:

| Check | Severity | Query |
|---|---|---|
| RC-FULL-01 | HARD | Total WC orders = 916 |
| RC-FULL-02 | HARD | All order_lines have variant_id NOT NULL |
| RC-FULL-03 | HARD | All orders with status IN ('processing','completed') have ≥ 1 shipment |
| RC-FULL-04 | SOFT | SR DELIVERED count ≈ WC completed/processing count (within 20%) |
| RC-FULL-05 | SOFT | Returns count ≤ SR DELIVERED count |
| RC-FULL-06 | ADVISORY | Cross-check: Σ monthly_revenue vs `Monthly Revenue` sheet manually |
| RC-FULL-07 | ADVISORY | Customers with total_orders > 1 count (repeat purchase rate) |

---

## 4. Re-run Behaviour (Idempotency)

All phases are safe to re-run. Each importer checks existence before inserting:

| Phase | Dedup key | On conflict |
|---|---|---|
| WC Orders | `orders.woocommerce_order_id` | SKIP (rows_skipped_duplicate++) |
| SR Shipments | `(shiprocket_order_id, master_sku)` | SKIP |
| Returns | `(shiprocket_order_id, awb_code)` | SKIP |

After a re-run, `import_runs` will show a new row with `rows_skipped_duplicate = N` (where N = previously imported rows). This is expected and correct.

---

## 5. Rollback Strategy

There is no automated rollback. To reset the database for a clean re-import:

```sql
-- WARNING: Destroys all imported data. Run only in dev/test.
TRUNCATE returns       RESTART IDENTITY CASCADE;
TRUNCATE shipments     RESTART IDENTITY CASCADE;
TRUNCATE order_lines   RESTART IDENTITY CASCADE;
TRUNCATE orders        RESTART IDENTITY CASCADE;
TRUNCATE customers     RESTART IDENTITY CASCADE;
TRUNCATE import_errors RESTART IDENTITY CASCADE;
TRUNCATE import_runs   RESTART IDENTITY CASCADE;
```

For partial rollback (e.g., redo SR only):
```sql
TRUNCATE import_errors RESTART IDENTITY CASCADE;
DELETE FROM import_runs WHERE source = 'shiprocket';
DELETE FROM shipments WHERE created_at > '<run_started_at>';
```

---

## 6. Failure Handling

| Failure scenario | Effect | Recovery |
|---|---|---|
| Hard validation failure on WC row | Row skipped, logged to import_errors | Fix source data or add to manual map; re-run Phase 1 |
| Unresolved SKUs (RC-REV-04 HARD fail) | import_run marked `reconciliation_status = failed` | Update sku_manual_map.csv; re-run Phase 1 |
| SR row with no WC match | ADVISORY logged; shipment imported with `order_id = NULL` | Investigate; update manually if needed |
| Connection error mid-run | In-progress order rolled back; import_run marked `failed` | Re-run from beginning (idempotent) |
| Workbook file locked by Excel | Phase 0 fails immediately | Close Excel; re-run |

---

## 7. Verification Queries

Run after all phases complete:

```sql
-- WC import summary
SELECT rows_in_source, rows_imported, rows_skipped_duplicate, rows_failed, rows_warnings,
       reconciliation_status, reconciliation_notes
FROM import_runs WHERE source = 'woocommerce' ORDER BY id DESC LIMIT 1;

-- Total orders in DB
SELECT COUNT(DISTINCT woocommerce_order_id) AS total_orders FROM orders;

-- Customer count
SELECT COUNT(*) AS customers FROM customers;

-- Order lines with unresolved SKU
SELECT COUNT(*) AS unresolved_sku_lines FROM order_lines WHERE variant_id IS NULL;

-- Shipments by year and status
SELECT DATE_TRUNC('year', channel_created_at)::date AS year, status, COUNT(*)
FROM shipments GROUP BY 1, 2 ORDER BY 1, 2;

-- Revenue by month (post Phase 2)
SELECT DATE_TRUNC('month', s.delivered_at)::date AS month,
       SUM(ol.line_total_inr) AS gross_revenue_inr,
       COUNT(DISTINCT o.woocommerce_order_id) AS delivered_orders
FROM shipments s
JOIN orders o     ON o.id = s.order_id
JOIN order_lines ol ON ol.order_id = o.id
WHERE s.status = 'DELIVERED' AND s.delivered_at IS NOT NULL
GROUP BY 1 ORDER BY 1;
```
