# Kirgo Control Tower — Reconciliation Rules
**Version:** v1.0 | **Date:** 2026-06-17  
**Schema Reference:** DATABASE_SCHEMA.md v2 | **Rules Reference:** BUSINESS_RULES.md v2.0  
**Purpose:** Formal checks that verify data integrity across sources after each import. All checks must pass before KPI snapshots are computed.

---

## Overview

| Domain | Check ID Range | Tables Involved |
|--------|---------------|----------------|
| Revenue | RC-REV-01 to RC-REV-07 | orders, order_lines, shipments |
| Shipment | RC-SHP-01 to RC-SHP-06 | shipments, orders, returns |
| Inventory | RC-INV-01 to RC-INV-05 | inventory_ledger, inventory_batches, shipments, returns |
| Bank | RC-BNK-01 to RC-BNK-06 | bank_transactions, gateway_settlements, expenses |
| COD | RC-COD-01 to RC-COD-05 | shipments, bank_transactions, gateway_settlements |

**Severity levels:**
- `HARD` — Must pass before KPI computation. Halt pipeline if fails.
- `SOFT` — Log and alert. KPI computation may proceed with a flag. Investigate within 24 hours.
- `ADVISORY` — Known data quality limitation. Document; do not block.

---

## 1. Revenue Reconciliation

**Goal:** Confirm that gross revenue in the database matches WooCommerce source data and that only delivered orders are counted.

---

### RC-REV-01 — WooCommerce Order Count
**Severity:** HARD

```sql
-- Check: Total orders imported matches expected count
SELECT COUNT(*) AS total_orders FROM orders;
-- Expected: 917
-- Tolerance: 0 (exact)
-- Failure action: Re-run WooCommerce import; check for rejected rows in import_errors
```

---

### RC-REV-02 — No Missing Order Lines
**Severity:** HARD

```sql
-- Check: Every order has at least one order_line
SELECT COUNT(*) AS orders_without_lines
FROM orders o
WHERE NOT EXISTS (
  SELECT 1 FROM order_lines ol WHERE ol.order_id = o.id
);
-- Expected: 0
-- Failure action: Import order_lines again; investigate missing line items
```

---

### RC-REV-03 — Order Total vs Line Sum Reconciliation
**Severity:** SOFT

```sql
-- Check: order_total ≈ SUM(line_total) + shipping − discount
SELECT 
  o.woocommerce_order_id,
  o.order_total_inr,
  COALESCE(SUM(ol.line_total_inr), 0) + o.shipping_charged_inr - o.discount_inr AS computed_total,
  ABS(o.order_total_inr - (COALESCE(SUM(ol.line_total_inr), 0) + o.shipping_charged_inr - o.discount_inr)) AS variance
FROM orders o
LEFT JOIN order_lines ol ON ol.order_id = o.id
GROUP BY o.id, o.woocommerce_order_id, o.order_total_inr, o.shipping_charged_inr, o.discount_inr
HAVING ABS(o.order_total_inr - (COALESCE(SUM(ol.line_total_inr), 0) + o.shipping_charged_inr - o.discount_inr)) > 1;
-- Expected: 0 rows
-- Tolerance: ±₹1 per order
-- Failure action: Investigate individual orders; check for WooCommerce export truncation
```

---

### RC-REV-04 — No Unresolved SKUs Before KPI Compute
**Severity:** HARD

```sql
-- Check: All order_lines have a resolved variant_id
SELECT COUNT(*) AS unresolved_skus
FROM order_lines
WHERE variant_id IS NULL;
-- Expected: 0
-- Failure action: Run SKU resolution; add missing SKU mappings to product_variants
```

---

### RC-REV-05 — Revenue Only From Delivered Shipments
**Severity:** HARD

```sql
-- Check: Gross revenue computation uses only delivered orders
-- Validation: For any revenue KPI, the WHERE clause must include:
--   shipments.status = 'DELIVERED' AND shipments.delivered_at IS NOT NULL
-- This check verifies no DELIVERED rows exist without a delivered_at date

SELECT COUNT(*) AS delivered_without_date
FROM shipments
WHERE status = 'DELIVERED'
AND delivered_at IS NULL;
-- Expected: 0
-- Failure action: Obtain delivered_at from Shiprocket; do not count as revenue until resolved
```

---

### RC-REV-06 — Shipping Revenue Excluded
**Severity:** ADVISORY

```sql
-- Check: shipping_charged_inr is excluded from all revenue KPI calculations
-- This is a logic check, not a data check. Document:
-- Gross Revenue = SUM(order_lines.line_total_inr) WHERE delivered
-- NOT: SUM(orders.order_total_inr) — this includes shipping
-- Per BR-004: shipping is net-neutral and must not inflate or deflate revenue KPIs
SELECT SUM(shipping_charged_inr) AS total_shipping_collected
FROM orders
WHERE status IN ('completed', 'processing');
-- Document this value; confirm it is NOT included in any revenue metric
```

---

### RC-REV-07 — Monthly Revenue vs Shiprocket Cross-Check
**Severity:** SOFT

```sql
-- Check: WooCommerce gross revenue ≈ Shiprocket declared order totals (de-duped)
-- Use for period: last completed month

-- WooCommerce revenue (source of record):
SELECT DATE_TRUNC('month', s.delivered_at) AS month,
       SUM(ol.line_total_inr) AS wc_gross_revenue
FROM shipments s
JOIN orders o ON o.id = s.order_id
JOIN order_lines ol ON ol.order_id = o.id
WHERE s.status = 'DELIVERED' AND s.delivered_at IS NOT NULL
GROUP BY 1 ORDER BY 1;

-- Shiprocket declared (de-duped by shiprocket_order_id — NOT authoritative but useful sanity check):
SELECT DATE_TRUNC('month', s.delivered_at) AS month,
       SUM(s.order_total_inr) AS sr_declared_revenue
FROM (
  SELECT DISTINCT ON (shiprocket_order_id) 
    shiprocket_order_id, order_total_inr, delivered_at
  FROM shipments
  WHERE status = 'DELIVERED'
  ORDER BY shiprocket_order_id, id
) s
GROUP BY 1 ORDER BY 1;

-- Expected: WC and SR values within ±5% per month
-- Note: BR-124 — do NOT use the 'Monthly Revenue' sheet as a reconciliation source;
--   it has known errors (Apr 2025: 15 orders recorded with ₹0 revenue)
```

---

## 2. Shipment Reconciliation

**Goal:** Confirm all WooCommerce orders have corresponding Shiprocket records, delivery statuses are consistent, and multi-item orders are correctly de-duplicated.

---

### RC-SHP-01 — WooCommerce Orders With No Shipment
**Severity:** SOFT

```sql
-- Check: All non-cancelled orders have at least one shipment
SELECT o.woocommerce_order_id, o.status, o.ordered_at
FROM orders o
WHERE o.status NOT IN ('cancelled', 'failed', 'refunded')
AND NOT EXISTS (
  SELECT 1 FROM shipments s WHERE s.order_id = o.id
)
ORDER BY o.ordered_at;
-- Expected: 0 rows (all non-cancelled orders should have a shipment)
-- Note: Some 'on-hold' orders may legitimately have no shipment; review case by case
```

---

### RC-SHP-02 — AWB Uniqueness
**Severity:** HARD

```sql
-- Check: No duplicate AWB codes
SELECT awb_code, COUNT(*) AS occurrences
FROM shipments
WHERE awb_code IS NOT NULL
GROUP BY awb_code
HAVING COUNT(*) > 1;
-- Expected: 0 rows
-- Failure action: Keep row with more date fields populated; delete duplicate; log
```

---

### RC-SHP-03 — Shipment Count vs WooCommerce Order Count
**Severity:** ADVISORY

```sql
-- Check: Understand multi-item order inflation
SELECT 
  COUNT(*) AS total_shipment_rows,
  COUNT(DISTINCT shiprocket_order_id) AS distinct_orders,
  COUNT(*) - COUNT(DISTINCT shiprocket_order_id) AS extra_rows_from_multi_item
FROM shipments;
-- Advisory: extra_rows_from_multi_item > 0 is expected and correct
-- Document the ratio; use COUNT(DISTINCT orders.woocommerce_order_id) for all order-level KPIs
-- Per BR-011: NEVER use COUNT(shipments.*) for order counts
```

---

### RC-SHP-04 — Date Sequence Integrity
**Severity:** SOFT

```sql
-- Check: All shipment date fields follow the correct sequence
SELECT id, awb_code, channel_created_at, picked_up_at, shipped_at, delivered_at
FROM shipments
WHERE 
  (picked_up_at IS NOT NULL AND channel_created_at IS NOT NULL AND picked_up_at < channel_created_at)
  OR (shipped_at IS NOT NULL AND picked_up_at IS NOT NULL AND shipped_at < picked_up_at)
  OR (delivered_at IS NOT NULL AND shipped_at IS NOT NULL AND delivered_at < shipped_at)
  OR (rto_delivered_at IS NOT NULL AND rto_initiated_at IS NOT NULL AND rto_delivered_at < rto_initiated_at);
-- Expected: 0 rows
-- Failure action: Flag affected rows; do not use their dates for revenue recognition
```

---

### RC-SHP-05 — Returns Have Forward Shipment
**Severity:** HARD

```sql
-- Check: Every return has a matching shipment
SELECT COUNT(*) AS orphan_returns
FROM returns
WHERE shipment_id IS NULL;
-- Expected: 0
-- Failure action: Resolve shipment_id using shiprocket_order_id → shipments join; re-run returns import
```

---

### RC-SHP-06 — Return Rate Sanity
**Severity:** ADVISORY

```sql
-- Check: Customer return rate (non-RTO) is within expected range (0%–15%)
SELECT 
  COUNT(CASE WHEN return_reason IS NOT NULL THEN 1 END) AS customer_returns,
  (SELECT COUNT(DISTINCT woocommerce_order_id) FROM orders WHERE status = 'completed') AS delivered_orders,
  ROUND(
    COUNT(CASE WHEN return_reason IS NOT NULL THEN 1 END)::numeric 
    / NULLIF((SELECT COUNT(DISTINCT woocommerce_order_id) FROM orders WHERE status = 'completed'), 0) * 100,
  2) AS return_rate_pct
FROM returns;
-- Advisory: Document the value; alert if > 15% (abnormal; investigate)
```

---

## 3. Inventory Reconciliation

**Goal:** Confirm the inventory ledger is internally consistent, never goes negative, and reconciles with PO quantities.

---

### RC-INV-01 — Non-Negative Stock at All Times
**Severity:** HARD

```sql
-- Check: Running stock per variant is never negative at any point in time
WITH ledger_running AS (
  SELECT 
    variant_id,
    occurred_at,
    quantity_delta,
    SUM(quantity_delta) OVER (
      PARTITION BY variant_id 
      ORDER BY occurred_at, id 
      ROWS UNBOUNDED PRECEDING
    ) AS running_stock
  FROM inventory_ledger
)
SELECT variant_id, MIN(running_stock) AS minimum_stock
FROM ledger_running
GROUP BY variant_id
HAVING MIN(running_stock) < 0;
-- Expected: 0 rows
-- Failure action: Identify the variant and date; check for out-of-sequence imports
```

---

### RC-INV-02 — Opening Stock vs Inventory Batches
**Severity:** HARD

```sql
-- Check: inventory_ledger opening entries match inventory_batches
SELECT 
  ib.variant_id,
  ib.opening_quantity AS batch_qty,
  COALESCE(SUM(il.quantity_delta), 0) AS ledger_opening_qty
FROM inventory_batches ib
LEFT JOIN inventory_ledger il ON il.batch_id = ib.id 
  AND il.movement_type = 'opening'
GROUP BY ib.variant_id, ib.opening_quantity
HAVING ib.opening_quantity <> COALESCE(SUM(il.quantity_delta), 0);
-- Expected: 0 rows
-- Failure action: Re-run inventory_ledger opening entries (IMPORT_EXECUTION_ORDER Step 5.2)
```

---

### RC-INV-03 — Sales Ledger vs Delivered Shipments
**Severity:** HARD

```sql
-- Check: For each variant, sales ledger entries match delivered shipments
SELECT 
  pv.sku,
  COUNT(s.id) AS delivered_shipments,
  ABS(COALESCE(SUM(il.quantity_delta), 0)) AS ledger_sales,
  COUNT(s.id) - ABS(COALESCE(SUM(il.quantity_delta), 0)) AS variance
FROM product_variants pv
LEFT JOIN shipments s ON s.variant_id = pv.id AND s.status = 'DELIVERED'
LEFT JOIN inventory_ledger il ON il.variant_id = pv.id AND il.movement_type = 'sale'
GROUP BY pv.id, pv.sku
HAVING COUNT(s.id) <> ABS(COALESCE(SUM(il.quantity_delta), 0));
-- Expected: 0 rows (each delivered shipment generates one negative ledger entry)
-- Exception: Bundle products generate 2 ledger entries (leggings + bra) per shipment
```

---

### RC-INV-04 — Current Stock Sanity Check
**Severity:** SOFT

```sql
-- Check: Current stock on hand per variant
SELECT 
  pv.sku,
  SUM(il.quantity_delta) AS current_stock,
  pv.is_active
FROM product_variants pv
JOIN inventory_ledger il ON il.variant_id = pv.id
GROUP BY pv.id, pv.sku, pv.is_active
ORDER BY current_stock;
-- Advisory: Review any variant with current_stock < 0 (should be caught by RC-INV-01)
-- Review any active variant with current_stock = 0 (should be marked is_active = false)
-- Document stock levels for each active SKU
```

---

### RC-INV-05 — Bundle Inventory Double-Deduction
**Severity:** SOFT

```sql
-- Check: For each delivered bundle shipment, verify TWO ledger entries exist
SELECT 
  s.id AS shipment_id,
  s.shiprocket_order_id,
  COUNT(il.id) AS ledger_entries
FROM shipments s
JOIN product_variants pv ON pv.id = s.variant_id
JOIN products p ON p.id = pv.product_id AND p.is_bundle = true
LEFT JOIN inventory_ledger il ON il.reference_id = s.id 
  AND il.movement_type = 'sale' AND il.reference_type = 'shipment'
WHERE s.status = 'DELIVERED'
GROUP BY s.id, s.shiprocket_order_id
HAVING COUNT(il.id) <> 2;
-- Expected: 0 rows (each bundle shipment should have exactly 2 negative ledger entries)
-- Failure action: Add missing ledger entries for leggings and bra components
```

---

## 4. Bank Reconciliation

**Goal:** Confirm the bank statement is complete, correctly classified, and every classified debit has a corresponding expense entry.

---

### RC-BNK-01 — Bank Balance Continuity
**Severity:** HARD

```sql
-- Check: Each row's closing balance = prior row's closing balance + deposit − withdrawal
WITH ordered AS (
  SELECT 
    id,
    transaction_date,
    narration_raw,
    COALESCE(deposit_inr, 0) AS deposit,
    COALESCE(withdrawal_inr, 0) AS withdrawal,
    closing_balance_inr,
    LAG(closing_balance_inr) OVER (ORDER BY transaction_date, id) AS prior_closing
  FROM bank_transactions
)
SELECT id, transaction_date, narration_raw,
       prior_closing + deposit - withdrawal AS expected_balance,
       closing_balance_inr AS actual_balance,
       ABS((prior_closing + deposit - withdrawal) - closing_balance_inr) AS variance
FROM ordered
WHERE prior_closing IS NOT NULL
  AND ABS((prior_closing + deposit - withdrawal) - closing_balance_inr) > 1;
-- Expected: 0 rows
-- Tolerance: ±₹1 (rounding)
-- Failure action: Identify the break; check for missing rows in export
```

---

### RC-BNK-02 — Unclassified Transaction Rate
**Severity:** SOFT

```sql
-- Check: Unclassified transactions are within acceptable threshold
SELECT 
  transaction_type,
  COUNT(*) AS row_count,
  ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER () * 100, 1) AS pct
FROM bank_transactions
GROUP BY transaction_type
ORDER BY row_count DESC;
-- Advisory: unclassified should be ≤ 10% of rows; alert if > 10%
-- Failure action: Review unclassified narrations; update narration classifier patterns
```

---

### RC-BNK-03 — Gateway Settlement Coverage
**Severity:** SOFT

```sql
-- Check: Every gateway_settlement row has a linked bank_transaction
SELECT COUNT(*) AS unlinked_settlements
FROM gateway_settlements
WHERE bank_transaction_id IS NULL;
-- Expected: 0
-- Failure action: Re-run settlement matching step; may indicate new gateway reference format
```

---

### RC-BNK-04 — Expense Coverage of Classified Debits
**Severity:** SOFT

```sql
-- Check: Every classified non-transfer debit has an expenses row
SELECT 
  bt.id,
  bt.transaction_date,
  bt.narration_raw,
  bt.withdrawal_inr,
  bt.transaction_type
FROM bank_transactions bt
WHERE bt.withdrawal_inr IS NOT NULL
  AND bt.transaction_type NOT IN ('founder_transfer', 'unclassified')
  AND NOT EXISTS (
    SELECT 1 FROM expenses e WHERE e.bank_transaction_id = bt.id
  );
-- Expected: 0 rows (every classified debit should have an expenses entry)
-- Note: 'founder_transfer' is explicitly excluded per BR-072 (not an operating expense)
```

---

### RC-BNK-05 — Supplier Payment Reconciliation
**Severity:** SOFT

```sql
-- Check: Supplier payments (PayPal) reconcile with purchase_orders totals
SELECT 
  bt.transaction_date,
  bt.withdrawal_inr AS bank_debit_inr,
  po.invoice_number,
  po.total_inr AS po_total_inr,
  ABS(bt.withdrawal_inr - po.total_inr) AS variance
FROM bank_transactions bt
JOIN purchase_orders po ON po.id = bt.linked_purchase_order_id
WHERE bt.transaction_type = 'supplier_payment';
-- Expected: variance ≤ ₹500 per payment (FX rounding tolerance)
-- Failure action: Check fx_rate_inr; may need to use actual bank rate vs invoice rate
```

---

### RC-BNK-06 — Ad Spend Bank vs Platform Reconciliation
**Severity:** SOFT

```sql
-- Check: Ad spend debits from bank ≈ total_inr in ad_spend_daily
SELECT 
  DATE_TRUNC('month', bt.transaction_date) AS month,
  SUM(bt.withdrawal_inr) AS bank_ad_spend,
  (SELECT SUM(total_inr) FROM ad_spend_daily 
   WHERE DATE_TRUNC('month', spend_date) = DATE_TRUNC('month', bt.transaction_date)) AS platform_ad_spend
FROM bank_transactions bt
WHERE bt.transaction_type IN ('ad_spend_meta', 'ad_spend_google')
GROUP BY 1 ORDER BY 1;
-- Expected: bank_ad_spend ≈ platform_ad_spend per month (±₹500 for payment timing differences)
-- Note: bank_ad_spend uses total_inr (spend + GST); platform_ad_spend is spend only for Google
--   and total for Meta. Compare carefully.
```

---

## 5. COD Reconciliation

**Goal:** Confirm every COD order has a CRF ID, every CRF batch has a matching bank credit, and remittance amounts reconcile.

---

### RC-COD-01 — COD Shipments Have CRF IDs
**Severity:** SOFT

```sql
-- Check: All delivered COD shipments have a CRF ID
SELECT COUNT(*) AS cod_without_crf
FROM shipments
WHERE payment_method = 'cod'
  AND status = 'DELIVERED'
  AND cod_crf_id IS NULL;
-- Expected: 0
-- Note: Some older 2023 shipments may lack CRF IDs — document these as DATA_GAP
```

---

### RC-COD-02 — CRF ID to Bank Transaction Match
**Severity:** SOFT

```sql
-- Check: Every distinct CRF ID in shipments has a matching bank transaction
SELECT DISTINCT s.cod_crf_id
FROM shipments s
WHERE s.cod_crf_id IS NOT NULL
  AND s.status = 'DELIVERED'
  AND NOT EXISTS (
    SELECT 1 
    FROM bank_transactions bt 
    WHERE bt.extracted_reference = s.cod_crf_id
      AND bt.transaction_type = 'cod_remittance'
  );
-- Expected: 0 rows (all CRF IDs matched to bank credits)
-- Note: Unmatched CRFs may be outside the bank statement period (Jan–Jun 2026);
--   document as PERIOD_BOUNDARY_GAP for pre-2026 CRF IDs
```

---

### RC-COD-03 — COD Remittance Amount Reconciliation
**Severity:** SOFT

```sql
-- Check: Bank credit for each CRF ≈ SUM(remitted_inr) for that CRF batch
SELECT 
  s.cod_crf_id,
  SUM(s.remitted_inr) AS shiprocket_remittance,
  bt.deposit_inr AS bank_credit,
  ABS(SUM(s.remitted_inr) - bt.deposit_inr) AS variance
FROM shipments s
JOIN bank_transactions bt ON bt.extracted_reference = s.cod_crf_id
WHERE s.cod_crf_id IS NOT NULL
GROUP BY s.cod_crf_id, bt.deposit_inr
HAVING ABS(SUM(s.remitted_inr) - bt.deposit_inr) > 50;
-- Expected: 0 rows
-- Tolerance: ±₹50 per CRF batch (Shiprocket rounding in COD deductions)
-- Failure action: Check COD charges deductions; verify cod_payable_inr vs remitted_inr
```

---

### RC-COD-04 — COD Mix Rate Sanity
**Severity:** ADVISORY

```sql
-- Check: COD as % of delivered orders is within historical range (25%–60%)
SELECT 
  COUNT(CASE WHEN payment_method = 'cod' THEN 1 END) AS cod_orders,
  COUNT(*) AS total_delivered,
  ROUND(COUNT(CASE WHEN payment_method = 'cod' THEN 1 END)::numeric / COUNT(*) * 100, 1) AS cod_mix_pct
FROM shipments
WHERE status = 'DELIVERED';
-- Advisory: Alert if cod_mix_pct < 15% or > 70% (extreme values indicate data quality issue)
```

---

### RC-COD-05 — COD Settlement Lag Validation
**Severity:** ADVISORY

```sql
-- Check: COD remittance dates are within expected T+7 to T+14 window from delivery
SELECT 
  s.cod_crf_id,
  MIN(s.delivered_at::date) AS earliest_delivery,
  s.cod_remittance_date,
  s.cod_remittance_date - MIN(s.delivered_at::date) AS lag_days
FROM shipments s
WHERE s.payment_method = 'cod'
  AND s.status = 'DELIVERED'
  AND s.cod_remittance_date IS NOT NULL
GROUP BY s.cod_crf_id, s.cod_remittance_date
HAVING s.cod_remittance_date - MIN(s.delivered_at::date) NOT BETWEEN 7 AND 21;
-- Advisory: Lag outside 7–21 days is unusual; investigate CRF batches with extreme lags
-- Note: T+7 is minimum; T+14 is Shiprocket standard; allow up to T+21 for holiday periods
```

---

## Reconciliation Run Schedule

| Check Group | Run Frequency | Trigger |
|-------------|--------------|---------|
| RC-REV-01 to RC-REV-07 | After every WooCommerce import | Automatic post-import |
| RC-SHP-01 to RC-SHP-06 | After every Shiprocket import | Automatic post-import |
| RC-INV-01 to RC-INV-05 | After every shipment or return import | Automatic post-import |
| RC-BNK-01 to RC-BNK-06 | After every bank statement import | Monthly (automatic post-import) |
| RC-COD-01 to RC-COD-05 | After bank statement import | Monthly (automatic post-import) |
| All checks | Before KPI snapshot computation | Automatic gate in Phase 8 |

## Reconciliation Failure Escalation

| Severity | Response Time | Action |
|----------|--------------|--------|
| HARD | Immediate | Halt pipeline; do not compute KPIs; notify admin |
| SOFT | Within 24 hours | Log to import_errors; compute KPIs with RECONCILE_FLAG = true; notify admin |
| ADVISORY | Within 7 days | Document in DATA_DICTIONARY.md Appendix E; no pipeline impact |
