# Kirgo Control Tower — Import Execution Order
**Version:** v1.0 | **Date:** 2026-06-17  
**Schema Reference:** DATABASE_SCHEMA.md v2 | **Data Reference:** DATA_DICTIONARY.md v2.1  
**Purpose:** Defines the exact sequence for all data imports, with pre-conditions and post-conditions for each step.

---

## Execution Principles

1. **Respect FK dependencies.** Never import a table before all tables it references are fully imported and validated.
2. **Seed data runs once.** Steps marked `SEED` are executed once at schema initialisation (already done via schema.sql). Do not re-run.
3. **Historical import runs once.** Steps 1–21 cover the full historical backfill. After go-live, only `INCREMENTAL` steps run on each data refresh cycle.
4. **Fail fast.** If a step fails its post-condition checks, halt. Do not proceed to dependent steps on bad data.
5. **Validate before proceeding.** Each step includes a minimum validation query to confirm success.

---

## Phase 0: Pre-Import Setup
*Run once before any historical data is loaded.*

| Step | Action | Type | Notes |
|------|--------|------|-------|
| 0.1 | Confirm `supabase/schema.sql` has been applied | Verify | Run: `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'` → expect 27 |
| 0.2 | Confirm seed data is present | Verify | Run: `SELECT COUNT(*) FROM roles` → expect 3; `SELECT COUNT(*) FROM expense_categories` → expect 15; `SELECT COUNT(*) FROM launches` → expect 4 |
| 0.3 | Confirm admin user exists | Verify | Run: `SELECT COUNT(*) FROM users WHERE role_id = (SELECT id FROM roles WHERE code = 'admin')` → expect ≥ 1 |
| 0.4 | Confirm all source files are present in `imports/raw/` | Verify | Manual check of file list against DATA_DICTIONARY.md Appendix A |
| 0.5 | Confirm product_variants are seeded | Verify | Run: `SELECT COUNT(*) FROM product_variants` → expect ≥ 28 (all canonical SKUs) |

---

## Phase 1: Reference Data (Seed — runs once)
*These tables were populated by `schema.sql`. Verify only; do not re-import.*

| Step | Table | Source | Action | Post-Condition Check |
|------|-------|--------|--------|---------------------|
| 1.1 | `roles` | Seed | Verify | `SELECT COUNT(*) FROM roles` = 3 |
| 1.2 | `expense_categories` | Seed | Verify | `SELECT COUNT(*) FROM expense_categories` = 15 |
| 1.3 | `launches` | Seed | Verify | `SELECT COUNT(*) FROM launches WHERE code IN ('L1','L2','L3','L4')` = 4 |
| 1.4 | `products` | Seed | Verify | `SELECT COUNT(*) FROM products` = 10; `SELECT COUNT(*) FROM products WHERE is_bundle = true` = 3 |
| 1.5 | `product_variants` | Seed | Verify | `SELECT COUNT(*) FROM product_variants WHERE sku IS NOT NULL` = expected count; `SELECT COUNT(*) FROM product_variants WHERE variant_id IS NULL` = 0 (no self-ref issue) |
| 1.6 | `ad_campaigns` | Seed | Verify | `SELECT COUNT(*) FROM ad_campaigns` ≥ 3 |

---

## Phase 2: Financial Reference Data
*Must run before orders (bank_transactions needed for expense reconciliation).*

### Step 2.1 — Purchase Orders
**Source:** PDF invoices (JSKS-240801, BURN-251006)  
**Destination:** `purchase_orders`  
**Dependencies:** `launches` (Phase 1.3)  
**Type:** Historical (once)

```
Pre-condition:  launches.code IN ('L2','L3') exist
Import:         purchase_orders for L2 and L3
Post-condition: SELECT COUNT(*) FROM purchase_orders = 2
                SELECT invoice_number FROM purchase_orders → 'JSKS-240801', 'BURN-251006'
```

### Step 2.2 — Purchase Order Lines
**Source:** PDF invoice line items  
**Destination:** `purchase_order_lines`  
**Dependencies:** `purchase_orders` (Step 2.1), `product_variants` (Phase 1.5)  
**Type:** Historical (once)

```
Pre-condition:  purchase_orders rows exist from Step 2.1
Import:         purchase_order_lines for each PO
Post-condition: SELECT COUNT(*) FROM purchase_order_lines > 0
                SELECT COUNT(*) FROM purchase_order_lines WHERE quantity > 0 = total rows (no zero-qty lines)
```

### Step 2.3 — Inventory Batches
**Source:** `ProductionSKU` sheet (Kirgo Numbers.xlsx)  
**Destination:** `inventory_batches`  
**Dependencies:** `product_variants` (Phase 1.5), `purchase_orders` (Step 2.1), `launches` (Phase 1.3)  
**Type:** Historical (once)

```
Pre-condition:  product_variants seeded with all canonical SKUs
Import:         One row per variant per launch batch; link purchase_order_id where applicable
Post-condition: SELECT COUNT(*) FROM inventory_batches > 0
                SELECT COUNT(*) FROM inventory_batches WHERE opening_quantity <= 0 = 0
```

### Step 2.4 — Launch Expenses
**Source:** `Expenses e537ebe9a6c3459aac82fa94dfdb26ff.csv` (L1), `KIRGO LAUNCH 2 SPENDS.md` (L2), `KIRGO LAUNCH 3 SPENDS.md` (L3)  
**Destination:** `launch_expenses`  
**Dependencies:** `launches` (Phase 1.3), `expense_categories` (Phase 1.2)  
**Type:** Historical (once)

```
Pre-condition:  expense_categories seeded (15 rows); launches L1–L3 exist
Import:         All pre-launch expenses for L1, L2, L3
Post-condition: SELECT launch_id, SUM(amount_inr) FROM launch_expenses GROUP BY launch_id
                L1 → ≈ 643,500 | L2 → ≈ 1,037,760 | L3 → ≈ 505,000
                Tolerance: ±₹1,000 (minor rounding in source)
```

---

## Phase 3: Orders
*WooCommerce must run before Shiprocket. Customers must exist before orders.*

### Step 3.1 — Customers
**Source:** `Woocom - Orders` (Kirgo Numbers.xlsx) — email/phone/name columns  
**Destination:** `customers`  
**Dependencies:** None  
**Type:** Historical (once), then Incremental

```
Pre-condition:  None
Import:         Deduplicate on LOWER(TRIM(email)); one row per unique email
Post-condition: SELECT COUNT(*) FROM customers > 0
                SELECT COUNT(*) FROM customers WHERE email IS NULL = 0
                SELECT COUNT(DISTINCT email) = COUNT(*) FROM customers (no duplicates)
```

### Step 3.2 — Orders
**Source:** `Woocom - Orders` (Kirgo Numbers.xlsx)  
**Destination:** `orders`  
**Dependencies:** `customers` (Step 3.1)  
**Type:** Historical (once), then Incremental

```
Pre-condition:  customers table populated (Step 3.1)
Import:         917 WooCommerce orders; customer_id resolved from email
Post-condition: SELECT COUNT(*) FROM orders = 917
                SELECT COUNT(*) FROM orders WHERE woocommerce_order_id IS NULL = 0
                SELECT COUNT(DISTINCT woocommerce_order_id) = COUNT(*) FROM orders (no duplicates)
```

### Step 3.3 — Order Lines
**Source:** `Woocom - Orders` (Kirgo Numbers.xlsx) — line item columns 1–4 (unpivot)  
**Destination:** `order_lines`  
**Dependencies:** `orders` (Step 3.2), `product_variants` (Phase 1.5)  
**Type:** Historical (once), then Incremental

```
Pre-condition:  orders table populated (Step 3.2)
Import:         Unpivot items 1–4; skip blank item columns
Post-condition: SELECT COUNT(*) FROM order_lines >= 917 (at least 1 line per order)
                SELECT COUNT(*) FROM order_lines WHERE order_id IS NULL = 0
                SELECT COUNT(*) FROM order_lines WHERE variant_id IS NULL
                  → Document count; must be 0 before KPI compute; resolve any unmatched SKUs
```

---

## Phase 4: Shipments
*Requires orders to be fully imported. Run all four year sheets in chronological order.*

### Step 4.1 — Shipments (2023)
**Source:** `SR - 2023` sheet (62 rows)  
**Destination:** `shipments`  
**Dependencies:** `orders` (Step 3.2), `product_variants` (Phase 1.5)  
**Type:** Historical (once)

```
Pre-condition:  orders table populated
Import:         62 rows from SR-2023; resolve order_id from shiprocket_order_id
Post-condition: SELECT COUNT(*) FROM shipments = 62
                SELECT COUNT(*) FROM shipments WHERE order_id IS NULL → log and resolve
```

### Step 4.2 — Shipments (2024)
**Source:** `SR - 2024` sheet (571 rows)  
**Destination:** `shipments`  
**Dependencies:** `orders` (Step 3.2)  
**Type:** Historical (once)

```
Post-condition: SELECT COUNT(*) FROM shipments = 62 + 571 = 633
```

### Step 4.3 — Shipments (2025)
**Source:** `SR - 2025` sheet (250 rows)  
**Destination:** `shipments`  
**Post-condition:** `SELECT COUNT(*) FROM shipments = 883`

### Step 4.4 — Shipments (2026)
**Source:** `SR - 2026` sheet (216 rows)  
**Destination:** `shipments`  
**Post-condition:** `SELECT COUNT(*) FROM shipments = 1,099 (±5 for known data quality variations)`

### Step 4.5 — AWB Uniqueness Validation
**After all four sheets are loaded:**

```sql
SELECT awb_code, COUNT(*) 
FROM shipments 
WHERE awb_code IS NOT NULL 
GROUP BY awb_code 
HAVING COUNT(*) > 1;
```
**Expected result:** 0 rows. If duplicates exist, investigate before proceeding.

---

## Phase 5: Returns

### Step 5.1 — Returns (all years)
**Source:** Returns-2023, Returns-2024, Returns-2025, Returns 2025-2026  
**Destination:** `returns`  
**Dependencies:** `shipments` (Phase 4)  
**Type:** Historical (once)

```
Pre-condition:  shipments table fully populated (Step 4.4)
Import:         All ~135 return rows; resolve shipment_id from shiprocket_order_id
Post-condition: SELECT COUNT(*) FROM returns ≈ 135
                SELECT COUNT(*) FROM returns WHERE shipment_id IS NULL → log ORPHAN_RETURN; target = 0
```

### Step 5.2 — Inventory Ledger (Opening Stock)
**Destination:** `inventory_ledger`  
**Source:** `inventory_batches` (Step 2.3) — derives opening entries  
**Type:** Historical (once)

```
Pre-condition:  inventory_batches populated (Step 2.3)
Action:         For each inventory_batches row, insert inventory_ledger row:
                  movement_type = 'opening', quantity_delta = +opening_quantity
Post-condition: SELECT COUNT(*) FROM inventory_ledger WHERE movement_type = 'opening' 
                  = COUNT(*) FROM inventory_batches
```

### Step 5.3 — Inventory Ledger (Sales)
**Destination:** `inventory_ledger`  
**Source:** `shipments` where `status = 'DELIVERED'`  
**Type:** Historical (once), then Incremental

```
Pre-condition:  shipments populated; inventory_ledger opening stock inserted (Step 5.2)
Action:         For each delivered shipment with a resolved variant_id:
                  movement_type = 'sale', quantity_delta = -product_quantity
                  For bundle variants: insert two rows (leggings + bra)
Post-condition: SELECT COUNT(*) FROM inventory_ledger WHERE movement_type = 'sale' 
                  = COUNT(*) FROM shipments WHERE status = 'DELIVERED' AND variant_id IS NOT NULL
```

### Step 5.4 — Inventory Ledger (Returns and RTOs)
**Destination:** `inventory_ledger`  
**Source:** `returns` where `qc_status = 'pass'` or `qc_status IS NULL` (RTO)  
**Type:** Historical (once), then Incremental

```
Pre-condition:  returns populated (Step 5.1)
Action:         qc_status = 'pass'  → movement_type = 'return',  quantity_delta = +product_quantity
                qc_status IS NULL   → movement_type = 'rto',     quantity_delta = +product_quantity
                qc_status = 'fail'  → no ledger entry (write-off; handled manually)
Post-condition: SELECT variant_id, SUM(quantity_delta) FROM inventory_ledger GROUP BY variant_id
                  → All values ≥ 0 (no negative stock at any point)
```

---

## Phase 6: Financial Data

### Step 6.1 — Bank Transactions
**Source:** `2026` sheet (Kirgo Numbers.xlsx)  
**Destination:** `bank_transactions`  
**Dependencies:** None  
**Type:** Historical (once for Jan–Jun 2026), then Monthly

```
Pre-condition:  None
Import:         All bank rows; run narration classifier post-import
Post-condition: SELECT COUNT(*) FROM bank_transactions > 0
                SELECT COUNT(*) FROM bank_transactions WHERE transaction_type = 'unclassified'
                  → Document count; target ≤ 5% of total rows
                SELECT COUNT(*) FROM bank_transactions WHERE NOT (withdrawal_inr IS NULL OR deposit_inr IS NULL) = 0
                  (no row should have both debit and credit)
```

### Step 6.2 — Gateway Settlements
**Destination:** `gateway_settlements`  
**Source:** Derived from `bank_transactions` during Step 6.1  
**Type:** Created automatically during bank statement import

```
Pre-condition:  bank_transactions populated (Step 6.1)
Action:         Create gateway_settlements rows for each bank row where
                  transaction_type IN ('gateway_settlement', 'cod_remittance')
                Set bank_transaction_id FK on each gateway_settlements row
                Set linked_settlement_id FK back on the bank_transactions row
Post-condition: SELECT COUNT(*) FROM gateway_settlements > 0
                SELECT COUNT(*) FROM gateway_settlements WHERE bank_transaction_id IS NULL = 0
```

### Step 6.3 — Operational Expenses
**Destination:** `expenses`  
**Source:** Manual entry based on classified `bank_transactions`  
**Dependencies:** `bank_transactions` (Step 6.1), `expense_categories` (Phase 1.2)  
**Type:** Monthly (manual, post-bank-import)

```
Pre-condition:  bank_transactions classified (Step 6.1)
Action:         For each bank debit (withdrawal_inr IS NOT NULL), create an expenses row
                  if the transaction represents an operational cost
                Link each expenses row to bank_transactions via bank_transaction_id
Post-condition: SELECT COUNT(*) FROM expenses WHERE bank_transaction_id IS NULL = 0 (target)
                Cross-check: every classified withdrawal should have an expenses entry
```

---

## Phase 7: Marketing Data

### Step 7.1 — Ad Spend Daily
**Source:** Google Ads PDF invoices, Meta Ads receipts  
**Destination:** `ad_spend_daily`  
**Dependencies:** `ad_campaigns` (Phase 1.6)  
**Type:** Monthly

```
Pre-condition:  ad_campaigns seeded for Google (736-944-6064) and Meta (729422043560314)
Import:         One row per campaign per day (or monthly total if daily unavailable)
Post-condition: SELECT campaign_id, SUM(spend_inr) FROM ad_spend_daily GROUP BY campaign_id
                  Google PMAX May 2026 → ≈ 6,688.87
                  Google Test1 May 2026 → ≈ 3,897.86
                  Meta May 2026 → ≈ 10,000.00
```

---

## Phase 8: Post-Import Validations
*Run after Phase 7 is complete. These are gates before KPI snapshot computation.*

| Step | Validation | Query | Pass Criteria |
|------|-----------|-------|--------------|
| 8.1 | WC order count | `SELECT COUNT(*) FROM orders` | = 917 |
| 8.2 | SR shipment count | `SELECT COUNT(*) FROM shipments` | ≈ 1,099 |
| 8.3 | Zero unresolved order line SKUs | `SELECT COUNT(*) FROM order_lines WHERE variant_id IS NULL` | = 0 |
| 8.4 | Zero orphan shipments | `SELECT COUNT(*) FROM shipments WHERE order_id IS NULL` | = 0 |
| 8.5 | Zero orphan returns | `SELECT COUNT(*) FROM returns WHERE shipment_id IS NULL` | = 0 |
| 8.6 | Non-negative inventory | `SELECT variant_id, SUM(quantity_delta) stock FROM inventory_ledger GROUP BY variant_id HAVING SUM(quantity_delta) < 0` | 0 rows |
| 8.7 | AWB uniqueness | `SELECT awb_code, COUNT(*) FROM shipments WHERE awb_code IS NOT NULL GROUP BY awb_code HAVING COUNT(*) > 1` | 0 rows |
| 8.8 | Bank balance continuity | Run BALANCE_BREAK check | ≤ 1 break (rounding only) |
| 8.9 | COD CRF ID match rate | `SELECT COUNT(*) FROM shipments WHERE payment_method = 'cod' AND cod_crf_id IS NOT NULL AND delivered_at IS NOT NULL` | > 0; document unmatched |
| 8.10 | order_lines sum vs order_total | `SELECT COUNT(*) FROM orders o WHERE ABS(o.order_total_inr - shipping_charged_inr + discount_inr - (SELECT COALESCE(SUM(line_total_inr),0) FROM order_lines WHERE order_id = o.id)) > 1` | = 0 |

---

## Phase 9: KPI Snapshot Computation
*Only run after all Phase 8 checks pass.*

| Step | Action | Dependency |
|------|--------|-----------|
| 9.1 | Compute `kpi_daily_snapshot` | All phases complete |
| 9.2 | Compute `kpi_monthly_snapshot` | Step 9.1 complete |
| 9.3 | Compute `inventory_forecasts` | `inventory_ledger` complete (Phase 5) |
| 9.4 | Compute `revenue_forecasts` (LA-WMA) | Step 9.2 + Step 9.3 |
| 9.5 | Compute `cashflow_forecasts` | Step 9.4 + bank_transactions |
| 9.6 | Generate rule-based `insights` | Steps 9.2–9.5 |

---

## Incremental Import Cadence (Post Go-Live)

| Source | Frequency | Steps to Re-run |
|--------|-----------|----------------|
| WooCommerce | Weekly (or on demand) | 3.1, 3.2, 3.3 → 4.x (new shipments) → 5.x (new returns/ledger) → 8.x → 9.x |
| Shiprocket | Weekly (or on demand) | 4.x → 5.3, 5.4 → 8.x → 9.x |
| Returns | Weekly | 5.1, 5.4 → 8.x → 9.x |
| Bank Statement | Monthly (by 5th of following month) | 6.1, 6.2, 6.3 → 8.x → 9.x |
| Marketing Spend | Monthly (after invoice received) | 7.1 → 9.x |
| Purchase Invoices | Per launch (once per supplier delivery) | 2.1, 2.2, 2.3 → 8.x → 9.x |

**Note:** Always run Phase 8 post-condition checks after any incremental import before triggering Phase 9.
