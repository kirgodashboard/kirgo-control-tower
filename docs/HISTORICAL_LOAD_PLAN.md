# Historical Load Plan

**Version:** 1.0  
**Source:** `imports/raw/Kirgo Numbers.xlsx`  
**Scope:** Full historical data from first order (Oct 2023) to present  
**Replaces:** `WORKBOOK_IMPORT_EXECUTION_PLAN.md`  

---

## 1. Load Sequence

```
Step 0  Pre-flight
Step 1  Products          → product_variants (manual seed — not from workbook)
Step 2  Customers         → customers
Step 3  Orders            → orders
Step 4  Order Lines       → order_lines
Step 5  Shipments         → shipments
Step 6  Returns           → returns
Step 7  Bank Transactions → bank_transactions + gateway_settlements
Step 8  Reconciliation    → verify all cross-table links
Step 9  KPI Snapshots     → kpi_snapshots (future phase)
```

Steps 2–4 are driven by `Woocom - Orders`.  
Step 5 is driven by `SR - 2023 / 2024 / 2025 / 2026`.  
Step 6 is driven by `Returns - 2023 / 2024 / 2025 / 2025-2026`.  
Step 7 is driven by `2023 / 2024 / 2025 / 2026` (bank sheets).  
Steps 1 and 8–9 are manual or post-load operations.

---

## 2. Prerequisites

| # | Check | Command |
|---|---|---|
| P-01 | Workbook file exists at expected path | `ls "imports/raw/Kirgo Numbers.xlsx"` |
| P-02 | `product_variants` seeded (required before order_lines FK resolves) | `SELECT COUNT(*) FROM product_variants;` — expect > 0 |
| P-03 | `SUPABASE_DB_URL` set in `.env.local` (direct port 5432, not pgBouncer 6543) | `python3 -c "from importers.workbook.config import Config; print(Config.db_url())"` |
| P-04 | Admin user exists in `users` table | `SELECT id FROM users WHERE email = 'jiten65.b@gmail.com';` |
| P-05 | `imports/config/sku_manual_map.csv` reviewed for 2023-era legacy SKUs | Open file; add any known unmapped SKUs |
| P-06 | Database schema v2.2+ applied | `SELECT COUNT(*) FROM import_runs;` — must not error |
| P-07 | Fresh DB (for initial load) | `SELECT COUNT(*) FROM orders;` — expect 0 |

---

## 3. Step 0 — Pre-flight

```bash
python3 -m importers.workbook.run_import --preflight
```

Checks all 9 import-target sheets and all 4 bank sheets:

```
[PASS] Woocom - Orders       — 916 rows, 93 cols
[PASS] SR - 2023             — 61 rows, 118 cols
[PASS] SR - 2024             — 570 rows, 118 cols
[PASS] SR - 2025             — 249 rows, 118 cols
[PASS] SR - 2026             — 215 rows, 118 cols
[PASS] Returns - 2023        — 4 rows, 121 cols
[PASS] Returns - 2024        — 67 rows, 121 cols
[PASS] Returns - 2025        — 17 rows, 121 cols
[PASS] Returns 2025 - 2026   — 56 rows, 121 cols
[PASS] 2023 (bank)           — 30 transactions (15 Oct – 31 Dec 2023)
[PASS] 2024 (bank)           — ~248 transactions (01 Jan – 31 Dec 2024)
[PASS] 2025  (bank)          — ~248 transactions (01 Jan – 31 Dec 2025)
[PASS] 2026 (bank)           — ~155 transactions (01 Jan – 15 Jun 2026)
[WARN] Credentials           — sheet detected; contents NOT read
Preflight passed. Ready to import.
```

**Block on failure.** Fix before proceeding.

---

## 4. Step 1 — Products (manual seed)

The workbook does not have a dedicated product catalogue sheet suitable for direct import. `product_variants` must be seeded manually before orders are imported.

**Source:** `ProductionSKU` sheet (reference only — cost/margin data) + known current SKUs.

**Why manual:** The `ProductionSKU` sheet contains size breakdowns and cost data, but lacks variant-level SKU codes in a format directly mappable to `product_variants.sku`. Product seeding is a one-time setup, not an import.

**Minimum required:** At least one `products` row and one `product_variants` row per active SKU in the WC orders.

Verify after seeding:
```sql
SELECT COUNT(*) FROM product_variants;  -- expect 10–30 rows
SELECT DISTINCT sku FROM product_variants ORDER BY sku;
```

---

## 5. Step 2–4 — Commerce: Customers → Orders → Order Lines

```bash
python3 -m importers.workbook.run_import \
  --sheet wc_orders \
  --admin-email jiten65.b@gmail.com
```

**Source sheet:** `Woocom - Orders` (916 rows)  
**Destination tables:** `customers`, `orders`, `order_lines`  
**import_runs source value:** `woocommerce`

**Execution sequence within this step:**

| Phase | Action | Table |
|---|---|---|
| 2a | For each unique email: INSERT customer (dedup on email) | `customers` |
| 3 | For each row: INSERT order (dedup on woocommerce_order_id) | `orders` |
| 4 | For each order: INSERT 1–4 order_lines (one per Product Item slot) | `order_lines` |
| 2b | Batch UPDATE total_orders + first_order_at | `customers` |

**Note:** `customers.total_revenue_inr` stays at 0 after this step — it requires `shipments.delivered_at` from Step 5.

**Gate before proceeding to Step 5:**
```sql
-- Must be zero
SELECT COUNT(*) FROM order_lines WHERE variant_id IS NULL;
```
If > 0: add missing SKU mappings to `imports/config/sku_manual_map.csv` and re-run this step (idempotent).

---

## 6. Step 5 — Shipments

```bash
python3 -m importers.workbook.run_import \
  --sheet sr_shipments \
  --admin-email jiten65.b@gmail.com
```

**Source sheets:** `SR - 2023`, `SR - 2024`, `SR - 2025`, `SR - 2026` (processed in year order)  
**Destination table:** `shipments`  
**import_runs source value:** `shiprocket`  
**Total rows:** ~1,095

**After this step runs:**  
Batch UPDATE `customers.total_revenue_inr`:
```sql
UPDATE customers SET
    total_revenue_inr = (
        SELECT COALESCE(SUM(ol.line_total_inr), 0)
        FROM orders o
        JOIN shipments s   ON s.order_id  = o.id
        JOIN order_lines ol ON ol.order_id = o.id
        WHERE o.customer_id = customers.id
          AND s.status = 'DELIVERED'
          AND s.delivered_at IS NOT NULL
    )
WHERE id IN (
    SELECT DISTINCT o.customer_id
    FROM shipments s JOIN orders o ON o.id = s.order_id
    WHERE s.status = 'DELIVERED'
);
```

This is run automatically by the importer at end of this step.

**Verify:**
```sql
SELECT status, COUNT(*) FROM shipments GROUP BY 1 ORDER BY 2 DESC;
-- Expect: DELIVERED ~896, CANCELED ~151, RTO_DELIVERED ~32, LOST ~10, NEW_ORDER ~3

SELECT COUNT(*) FROM customers WHERE total_revenue_inr > 0;
-- Should be ~200+ (customers with at least one delivered order)
```

---

## 7. Step 6 — Returns

```bash
python3 -m importers.workbook.run_import \
  --sheet returns \
  --admin-email jiten65.b@gmail.com
```

**Source sheets:** `Returns - 2023`, `Returns - 2024`, `Returns - 2025`, `Returns 2025 - 2026` (year order)  
**Destination tables:** `returns` (and reverse-leg `shipments` rows)  
**import_runs source value:** `shiprocket_returns`  
**Total rows:** ~144

---

## 8. Step 7 — Bank Transactions

```bash
python3 -m importers.workbook.run_import \
  --sheet bank_transactions \
  --admin-email jiten65.b@gmail.com
```

**Source sheets:** `2023`, `2024`, `2025 `, `2026` (all 4 processed in chronological order)  
**Destination tables:** `bank_transactions`, `gateway_settlements`  
**import_runs source value:** `bank_hdfc`  
**Total rows:** ~681 transactions

**What the importer does:**

1. Reads each bank sheet with header at row 20, skip row 21 (asterisks)
2. Filters out non-transaction rows (footer metadata, blank Date fields)
3. For each transaction row:
   a. Parse date, amounts, reference number
   b. Classify `transaction_type` via narration classifier
   c. Extract `extracted_reference` (CRF ID, CMS ref, YESF ref)
   d. Extract `counterparty` from narration
   e. Dedup check: `(transaction_date, narration_raw, withdrawal_inr, deposit_inr)`
   f. INSERT `bank_transactions` row
   g. If `gateway_settlement` or `cod_remittance`: also INSERT `gateway_settlements` row and link FK back
4. Validate balance continuity (BR-121): log DQ_WARN on any break
5. Run bank reconciliation checks

**After this step runs:**

Verify classification completeness:
```sql
SELECT transaction_type, COUNT(*), SUM(deposit_inr), SUM(withdrawal_inr)
FROM bank_transactions
GROUP BY 1
ORDER BY COUNT(*) DESC;
```

Review `unclassified` rows manually:
```sql
SELECT transaction_date, narration_raw, withdrawal_inr, deposit_inr
FROM bank_transactions
WHERE transaction_type = 'unclassified'
ORDER BY transaction_date;
```

---

## 9. Step 8 — Reconciliation

```bash
python3 -m importers.workbook.run_import --reconcile-only
```

Runs the full suite of cross-table reconciliation checks:

### Commerce reconciliation (from existing framework)

| Check | Severity | Expected result |
|---|---|---|
| RC-REV-01: WC order count | HARD | 916 |
| RC-REV-02: All orders have order_lines | HARD | 0 orphan orders |
| RC-REV-03: Order total vs line sum | SOFT | 0 variance > ₹1 |
| RC-REV-04: Unresolved SKUs | HARD | 0 NULL variant_id rows |
| RC-REV-06: Total shipping collected | ADVISORY | Document amount |

### Shipments reconciliation

| Check | Severity | Expected result |
|---|---|---|
| RC-SR-01: Shipment count | HARD | ~1,095 |
| RC-SR-02: DELIVERED rows have delivered_at | HARD | 0 exceptions |
| RC-SR-03: Order match rate | SOFT | > 70% of SR rows linked to orders |

### Returns reconciliation

| Check | Severity | Expected result |
|---|---|---|
| RC-RT-01: Returns count | HARD | ~144 |
| RC-RT-02: RETURN DELIVERED has returned_at | SOFT | 0 exceptions |

### Bank reconciliation

| Check | Severity | Expected result |
|---|---|---|
| RC-BANK-01: Balance continuity | SOFT | 0 breaks across all 4 sheets |
| RC-BANK-02: COD settlement match rate | HARD | ≥ 95% of COD bank credits matched to SR CRF IDs |
| RC-BANK-03: Unclassified transaction count | SOFT | < 50 (advisory if > 50) |
| RC-BANK-04: Total COD bank vs SR remitted | SOFT | Variance < ₹500 per year |

### Cross-domain reconciliation

| Check | Severity | Expected result |
|---|---|---|
| RC-XDOM-01: Total gateway settlements sum vs WC delivered revenue | ADVISORY | Should be within ±10% of net revenue |
| RC-XDOM-02: COD bank deposits sum vs SR COD remitted sum | SOFT | Should match ± rounding per CRF batch |

---

## 10. Step 9 — KPI Snapshots (future phase)

Not part of the initial historical load. After Steps 1–8 are verified:
- Compute monthly KPI snapshots and insert into `kpi_snapshots`
- This powers the dashboard without real-time query load

---

## 11. Full CLI Sequence (copy-paste ready)

```bash
# Pre-flight
python3 -m importers.workbook.run_import --preflight

# Step 2-4: Commerce
python3 -m importers.workbook.run_import \
  --sheet wc_orders \
  --admin-email jiten65.b@gmail.com

# Fix any UNRESOLVED_SKU (if needed)
# psql: SELECT DISTINCT sku_raw FROM order_lines WHERE variant_id IS NULL;
# Edit: imports/config/sku_manual_map.csv
# Re-run wc_orders if needed (idempotent)

# Step 5: Shipments
python3 -m importers.workbook.run_import \
  --sheet sr_shipments \
  --admin-email jiten65.b@gmail.com

# Step 6: Returns
python3 -m importers.workbook.run_import \
  --sheet returns \
  --admin-email jiten65.b@gmail.com

# Step 7: Bank transactions
python3 -m importers.workbook.run_import \
  --sheet bank_transactions \
  --admin-email jiten65.b@gmail.com

# Step 8: Full reconciliation
python3 -m importers.workbook.run_import --reconcile-only
```

Or run all in sequence:
```bash
python3 -m importers.workbook.run_import \
  --sheet all \
  --admin-email jiten65.b@gmail.com
```

---

## 12. Re-run Safety (Idempotency)

All importers are safe to re-run.

| Importer | Dedup key | On conflict |
|---|---|---|
| WC Orders | `orders.woocommerce_order_id` | SKIP |
| SR Shipments | `(shiprocket_order_id, master_sku)` | SKIP |
| Returns | `(shiprocket_order_id, awb_code)` | SKIP |
| Bank Transactions | `(transaction_date, narration_raw, withdrawal_inr, deposit_inr)` | SKIP |
| Gateway Settlements | `settlement_reference` | ON CONFLICT DO NOTHING |

---

## 13. Rollback

To reset the database for a clean re-run:

```sql
-- WARNING: Destroys all imported data. Dev/test only.
TRUNCATE returns            RESTART IDENTITY CASCADE;
TRUNCATE bank_transactions  RESTART IDENTITY CASCADE;
TRUNCATE gateway_settlements RESTART IDENTITY CASCADE;
TRUNCATE shipments          RESTART IDENTITY CASCADE;
TRUNCATE order_lines        RESTART IDENTITY CASCADE;
TRUNCATE orders             RESTART IDENTITY CASCADE;
TRUNCATE customers          RESTART IDENTITY CASCADE;
TRUNCATE import_errors      RESTART IDENTITY CASCADE;
TRUNCATE import_runs        RESTART IDENTITY CASCADE;
-- Do NOT truncate product_variants — re-seeding is manual.
```

---

## 14. Verification Queries (post-load)

```sql
-- Overall counts
SELECT 'customers'         AS tbl, COUNT(*) FROM customers
UNION ALL
SELECT 'orders',                    COUNT(*) FROM orders
UNION ALL
SELECT 'order_lines',               COUNT(*) FROM order_lines
UNION ALL
SELECT 'shipments',                 COUNT(*) FROM shipments
UNION ALL
SELECT 'returns',                   COUNT(*) FROM returns
UNION ALL
SELECT 'bank_transactions',         COUNT(*) FROM bank_transactions
UNION ALL
SELECT 'gateway_settlements',       COUNT(*) FROM gateway_settlements;

-- Revenue summary (should match Monthly Revenue sheet totals)
SELECT
    DATE_TRUNC('month', s.delivered_at)::date AS month,
    COUNT(DISTINCT o.woocommerce_order_id)    AS delivered_orders,
    SUM(ol.line_total_inr)                    AS gross_revenue_inr
FROM shipments s
JOIN orders o      ON o.id = s.order_id
JOIN order_lines ol ON ol.order_id = o.id
WHERE s.status = 'DELIVERED'
  AND s.delivered_at IS NOT NULL
GROUP BY 1
ORDER BY 1;

-- COD reconciliation status
SELECT
    gs.gateway,
    COUNT(gs.id)                  AS settlement_count,
    SUM(gs.amount_inr)            AS total_inr,
    COUNT(bt.id)                  AS bank_txn_matched,
    SUM(CASE WHEN bt.id IS NOT NULL THEN gs.amount_inr ELSE 0 END) AS matched_inr
FROM gateway_settlements gs
LEFT JOIN bank_transactions bt ON bt.id = gs.bank_transaction_id
GROUP BY 1;

-- Top unclassified bank transactions
SELECT transaction_date, narration_raw, withdrawal_inr, deposit_inr
FROM bank_transactions
WHERE transaction_type = 'unclassified'
ORDER BY GREATEST(COALESCE(withdrawal_inr,0), COALESCE(deposit_inr,0)) DESC
LIMIT 20;
```
