# Kirgo Control Tower — KPI Validation & Financial Audit Report
**Date:** 2026-07-01 | **Last updated:** 2026-07-07  
**Status:** P0 + P1 Fixes Applied (`20260706_p0_kpi_audit_fixes.sql` + `20260707_p1_return_cost.sql` deployed)  
**Auditor:** Claude Code (automated trace, full SQL review)

---

## Executive Summary

The audit traced every KPI on every dashboard from the displayed value back to the source SQL, the source table, and the business rule. **5 Critical defects and 8 High-severity inconsistencies** were identified. The most damaging issue is that **COD Outstanding shows ₹783 (Shiprocket service fees) instead of ₹3.23L (actual customer cash owed)** across the Director and Operations dashboards. A second critical issue is that the **profitability RPCs violate BR-201** — non-commercial orders (influencer/brand seeding) are included in delivered revenue and COGS.

No KPI changes should be deployed without sign-off on each fix below.

---

## Audit Map: Screen → RPC → SQL → Source Table

| Screen | KPI Group | RPC | Source Table(s) | Date Dimension |
|--------|-----------|-----|-----------------|----------------|
| Command Center | Revenue, Orders | `get_director_snapshot` | `v_revenue_events` → `orders` | `ordered_at` (MTD) |
| Command Center | COD Outstanding | `get_director_snapshot` | `v_cod_outstanding` → `shipments.cod_payable_inr` | all-time |
| Command Center | Delivery, RTO | `get_director_snapshot` | `shipments` | last 30 days |
| Command Center | Return Rate | `get_director_snapshot` | `returns` / `orders` | **MIXED** |
| Executive Overview | Revenue, Orders, AOV | `get_executive_kpis` | `v_revenue_events` → `orders` | `ordered_at` (selected period) |
| Executive Overview | RTO Rate | `get_executive_kpis` | `shipments` | `channel_created_at` |
| Customer Intelligence | Customer KPIs | `get_customer_kpis` | `orders` | `ordered_at` |
| Customer Intelligence | Growth Chart | `v_customer_growth_monthly` | `orders` | `ordered_at` |
| Customer Intelligence | Top Cities | `v_top_cities` | `orders` | all-time |
| Operations | Shipments, Delivery% | `get_operations_kpis` | `shipments` | `channel_created_at` |
| Operations | COD Outstanding | `get_operations_kpis` | `v_cod_outstanding` → `shipments.cod_payable_inr` | **WRONG** |
| Operations | COD Table | `get_cod_reconciliation` | `shipments`, `orders` | `delivered_at` |
| Profitability | All KPIs | `get_profitability_kpis` | `shipments`, `orders`, `order_lines`, `expenses` | `delivered_at` |
| Profitability | Product P&L | `get_product_pl` | `order_lines`, `shipments`, `product_costs` | `delivered_at` |
| Bank & Cash | KPIs, Balance | `get_bank_kpis` | `bank_transactions` | `transaction_date` (selected period) |
| Receivables | COD KPIs | `get_receivables_kpis` | `shipments`, `orders`, `bank_transactions` | `delivered_at` |
| System Alerts | COD Alert | `v_system_alerts` | `order_classifications`, `orders` | all-time |

---

## CRITICAL DEFECTS (data is materially wrong)

---

### DEFECT-01: COD Outstanding — Wrong Amount Displayed (₹783 vs ₹3.23L)
**Severity: CRITICAL** ✅ **FIXED — `20260706_p0_kpi_audit_fixes.sql`**  
**Affected screens: Command Center (Director Snapshot), Operations**

**What is shown:** A tiny amount (~₹783 or similar) representing Shiprocket's service fee  
**What should be shown:** ~₹3.23L — the actual cash the customers handed to delivery agents

**Root cause:**  
`v_cod_outstanding` is a view over `shipments.cod_payable_inr`. From Supabase: `cod_payable_inr` = Shiprocket's processing fee per shipment (₹46–₹110 per order). It is NOT the order total the customer paid.

`get_director_snapshot` uses:
```sql
cod_pending AS (
  SELECT COALESCE(SUM(cod_payable_inr), 0) AS total, COUNT(*) AS count 
  FROM v_cod_outstanding
)
```

`get_operations_kpis` (after 20260702 regression) uses:
```sql
'cod_outstanding_inr', (SELECT COALESCE(SUM(cod_payable_inr), 0) FROM v_cod_outstanding),
'cod_outstanding_count', (SELECT COUNT(*) FROM v_cod_outstanding)
```

**Governance history:** The 20260624 migration corrected this to use `cod_receivable_inr()` (order-basis). The 20260702 migration then **reverted** it back to `v_cod_outstanding`. This was a regression.

**Cross-dashboard impact:**  
| Surface | Amount | Method | Correct? |
|---------|--------|--------|---------|
| Director Snapshot — COD Outstanding | ~₹783 | `SUM(cod_payable_inr)` | ❌ |
| Operations — COD Outstanding | ~₹783 | `SUM(cod_payable_inr)` | ❌ |
| System Alerts — COD threshold | ~₹3.23L | `SUM(order_total_inr) WHERE cod_pending` | ✓ |
| Receivables — COD Pending | ~₹X | Delivered, unmatched CRF | Different definition |
| Operations COD table | order_total_inr | `shipments + orders` | ✓ |

**Fix required:**  
Replace `v_cod_outstanding` references in `get_director_snapshot` and `get_operations_kpis` with the order-basis calculation:
```sql
SELECT COALESCE(SUM(o.order_total_inr), 0)
FROM shipments s
JOIN orders o ON o.id = s.order_id
WHERE s.payment_method = 'cod'
  AND s.status = 'DELIVERED'
  AND s.delivered_at IS NOT NULL
  AND (s.cod_crf_id IS NULL 
       OR s.cod_crf_id NOT IN (
         SELECT extracted_reference FROM bank_transactions
         WHERE transaction_type = 'cod_remittance' AND extracted_reference IS NOT NULL
       ))
```
(Same logic as the fixed `get_receivables_kpis` and `get_customer_receivables`)

---

### DEFECT-02: Operations RTO Count — Under-counting (Only 'RTO' Status)
**Severity: CRITICAL** ✅ **FIXED — `20260706_p0_kpi_audit_fixes.sql`**  
**Affected screens: Operations Dashboard**

**What is shown:** Only shipments with exact status `'RTO'`  
**What should be shown:** All stages of return: `'RTO_DELIVERED'`, `'RTO_ACKNOWLEDGED'`, `'RTO_INITIATED'`, `'RTO'`

**Root cause:**  
`get_operations_kpis` (20260702 migration) uses:
```sql
'rto', COUNT(CASE WHEN s.status = 'RTO' THEN 1 END),
'rto_rate_pct', ROUND(COUNT(CASE WHEN s.status = 'RTO' THEN 1 END)::numeric / NULLIF(...) * 100, 1)
```

But Executive `get_executive_kpis` and Director `get_director_snapshot` correctly use:
```sql
s.status IN ('RTO_DELIVERED','RTO_ACKNOWLEDGED','RTO_INITIATED','RTO')
```

**Impact:**
- Operations shows lower RTO count than Executive for the same period
- Operations RTO% ≠ Director RTO% → management cannot reconcile
- If most returns are in `RTO_DELIVERED` state, the Operations number could be near zero

**Fix required:**  
Change Operations KPI to use all RTO status codes:
```sql
'rto', COUNT(CASE WHEN s.status IN ('RTO_DELIVERED','RTO_ACKNOWLEDGED','RTO_INITIATED','RTO') THEN 1 END),
'rto_rate_pct', ROUND(COUNT(CASE WHEN s.status IN ('RTO_DELIVERED','RTO_ACKNOWLEDGED','RTO_INITIATED','RTO') THEN 1 END)::numeric / NULLIF(COUNT(DISTINCT s.id), 0) * 100, 1)
```

---

### DEFECT-03: Operations In-Transit Count — Under-counting
**Severity: CRITICAL** ✅ **FIXED — `20260706_p0_kpi_audit_fixes.sql`**  
**Affected screens: Operations Dashboard**

**What is shown:** Only `'IN_TRANSIT'` shipments  
**What should be shown:** `'IN_TRANSIT'`, `'IN TRANSIT'` (space variant), `'OUT_FOR_DELIVERY'`, `'PICKED_UP'`

**Root cause:**  
`get_operations_kpis` (20260702) uses:
```sql
'in_transit', COUNT(CASE WHEN s.status = 'IN_TRANSIT' THEN 1 END),
```

Prior version (20260624) correctly used:
```sql
'in_transit', COUNT(CASE WHEN s.status IN ('IN_TRANSIT','IN TRANSIT','OUT_FOR_DELIVERY','PICKED_UP') THEN 1 END),
```

**Impact:** Total shipments = delivered + in_transit + rto + pending will not add up if out-for-delivery and picked-up states are excluded.

---

### DEFECT-04: Profitability RPCs Violate BR-201 (Non-Commercial Orders Included)
**Severity: CRITICAL** ✅ **FIXED — `20260706_p0_kpi_audit_fixes.sql`**  
**Affected screens: Profitability Dashboard (all P&L tables)**

**What is happening:** `influencer_promotion`, `brand_seeding`, `internal_use`, `replacement` orders that have `DELIVERED` shipments are being included in:
- Delivered Revenue (`revenue_inr`)
- COGS
- Gross Profit
- Product P&L, SKU P&L, City P&L, Launch P&L, Customer P&L

**Root cause:**  
All profitability RPCs filter on `s.status = 'DELIVERED'` but do NOT join to `order_classifications` to exclude non-commercial types. Example from `get_profitability_kpis`:
```sql
delivered_orders AS (
  SELECT DISTINCT ON (o.id) o.id, s.delivered_at::date, ...
  FROM orders o JOIN shipments s ON s.order_id = o.id
  WHERE s.status = 'DELIVERED'          -- ← no BR-201 filter
    AND s.delivered_at::date BETWEEN p_start AND p_end
)
```

CLAUDE.md explicitly requires:
> NEVER write an order-count or revenue query without this filter. The canonical function `non_commercial_order_classes()` is the single source of truth.

**Impact:**  
If 50 influencer orders were delivered, their order_total_inr is counted as revenue and their product costs as COGS — making margins appear higher or lower than reality.

**Fix required:**  
Add to `delivered_orders` CTE in all profitability RPCs:
```sql
LEFT JOIN order_classifications oc ON oc.order_id = o.id
AND COALESCE(oc.classification, 'paid_sale'::order_class) != ALL(non_commercial_order_classes())
```

Affected functions: `get_profitability_kpis`, `get_product_pl`, `get_sku_pl`, `get_city_pl`, `get_launch_pl`, `get_customer_pl`, `get_profitability_trend`

---

### DEFECT-05: Director Snapshot — Return Rate Uses Mixed Date Periods
**Severity: CRITICAL** ✅ **FIXED — `20260706_p0_kpi_audit_fixes.sql`**  
**Affected screens: Command Center (Business Summary health score)**

**What is shown:** `return_rate_pct` = customer returns in last 30 days ÷ MTD orders

**Root cause:**  
```sql
-- Numerator: 30-day rolling window
returns_30d AS (
  SELECT COUNT(*) AS return_count FROM returns r
  WHERE r.returned_at::date >= CURRENT_DATE - 30  -- last 30 days
    AND r.return_reason IS NOT NULL
),
-- Denominator: MTD orders (different window!)
mtd_revenue AS (
  SELECT COUNT(*) AS orders_count FROM v_revenue_events 
  WHERE event_at::date >= v_mtd_start  -- month-to-date
)
```

If the current date is July 5, the denominator is 5 days of orders but the numerator is 30 days of returns. Early in the month this will show an artificially high return rate (e.g., 300% in extreme cases).

**Fix required:**  
Either:
- Make both windows MTD: `WHERE r.returned_at::date >= v_mtd_start`
- Or make both 30 days: `WHERE r.returned_at::date >= CURRENT_DATE - 30` and count orders in last 30 days

---

## HIGH SEVERITY (material inconsistencies)

---

### HIGH-01: `promo_spend_inr` in TypeScript Type but Not Returned by Current SQL
**Affected:** `ProfitabilityKpis` interface, any component reading `kpis.promo_spend_inr`  
✅ **FIXED — removed `promo_spend_inr` from `ProfitabilityKpis` type in `frontend/src/types/kpi.ts`**

The TypeScript type declares `promo_spend_inr: number` but the current `get_profitability_kpis` (20260625_z version) does NOT return this field. It was in the 20260621/20260622 versions but was dropped in the full P&L rewrite.

Any dashboard component accessing `kpis.promo_spend_inr` will get `undefined`, which `formatINR(undefined)` silently renders as `₹0.00`.

**Action:** Either re-add `promo_spend_inr` to the SQL output, or remove it from the TypeScript type. Must decide whether promotional spend on orders belongs in the P&L alongside `ad_spend_inr`.

---

### HIGH-02: `return_cost_inr` Hardcoded to 0 in P&L
**Affected:** Profitability Dashboard — Contribution Margin is overstated  
✅ **FIXED — `20260707_p1_return_cost.sql` calculates RTO freight costs; waterfall shows "Memo: Return Freight (RTO)" row when non-zero**

```sql
'return_cost_inr', 0   -- hardcoded in 20260625_z_profitability_full_pnl.sql
```

RTO shipments cost money (reverse logistics). The `return_cost_inr` field exists in the TypeScript type and in the metric catalog, but the SQL never calculates it. The contribution margin formula should subtract return logistics costs.

**Action:** Calculate from returns table or from RTO shipment costs (freight on returned shipments).

---

### HIGH-03: Operations `customer_returns` Field Removed (Regression)
**Affected:** Operations Dashboard — customer returns count disappeared ✅ **FIXED — `20260706_p0_kpi_audit_fixes.sql`**

The 20260624 migration added `customer_returns` to `get_operations_kpis`. The 20260702 migration removed it from the JSON output. The `OperationsKpis` TypeScript type still has `customer_returns?: number` but the field is never populated.

This means the Operations dashboard shows no customer return count, even though the `returns` table has data.

---

### HIGH-04: Profitability Revenue ≠ Executive Revenue (Even for Same Orders)
**Affected:** Cross-dashboard reconciliation  
**This difference is by design but not labeled clearly**  
✅ **FIXED — waterfall subtitle updated to state "Revenue recognised on delivery (line-item basis) · Executive dashboard uses order_total on order date — intentional difference"**

- Executive Revenue = `orders.order_total_inr` = subtotal + shipping charged − discounts
- Profitability Revenue = `SUM(order_lines.line_total_inr)` = product line revenue only (excludes shipping revenue)

For the same set of delivered orders, these will differ by the shipping amount charged to customers. If customers paid ₹100 shipping on average across 500 orders, the profitability revenue will be ₹50,000 less than the executive revenue.

Additionally: the profitability `total_revenue_inr` (booked) uses `v_revenue_events` filtered by `event_at::date` (ordered_at) with the same p_start/p_end as the delivery-date window. This mixes two date dimensions in a single P&L statement.

**Action required:**  
- Label profitability revenue clearly as "Delivered Line Revenue (excl. shipping)"  
- Fix the `total_revenue_inr` to use `ordered_at` with a separate date range, not the delivery date range

---

### HIGH-05: COD Outstanding — Three Incompatible Definitions Across Surfaces
**This is the root of DEFECT-01 — documenting all three for clarity**

| Definition | Amount | Surface | Method |
|------------|--------|---------|--------|
| Order-basis (cod_pending classification) | ~₹3.23L | System Alerts | `SUM(order_total_inr) WHERE classification='cod_pending'` |
| Delivery + unmatched CRF | ~₹X | Receivables Dashboard | `SUM(order_total_inr) WHERE delivered, no bank match` |
| Service fee basis | ~₹783 | Director, Operations | `SUM(cod_payable_inr) WHERE v_cod_outstanding` |

All three should converge. The correct definition (post-delivery, unmatched to bank remittance) is already implemented in `get_receivables_kpis`. This same logic should be used everywhere.

---

### HIGH-06: Executive `new_customers` Not Filtered for Commercial Orders
**Affected:** Executive Overview, Director Snapshot

`get_executive_kpis` counts `new_customers` as:
```sql
WHERE customer_id IN (SELECT id FROM customers c WHERE c.first_order_at::date BETWEEN p_start AND p_end)
```

`customers.first_order_at` is set from WooCommerce sync and includes all order types (commercial and non-commercial). A recipient of a brand_seeding order who has never bought commercially would appear as a "new customer."

**Impact:** New customer count is potentially inflated by non-commercial order recipients.

---

### HIGH-07: Customer Growth Chart vs Customer KPI Row — Different Repeat Definitions
**Affected:** Customer Intelligence page — two panels on same screen may disagree

`v_customer_growth_monthly` (growth chart):
- "Returning" = any month AFTER their first-purchase month
- A customer who placed 3 orders in month 1 counts as NEW in month 1, then RETURNING in later months only if they reorder

`get_customer_kpis` (KPI row):
- "Repeat" = ANY customer who is NOT a new customer (either multi-ordered in period OR had prior orders)
- A customer with 3 orders in the same period = repeat customer

Result: For "All Time" or "30D" views, the total "repeat" customers from the KPI row will differ from the "returning customers" in the growth chart for the same months.

---

### HIGH-08: Operations `customer_returns` Count Unfiltered for Cancelled Returns
**Affects (when fixed):** Operations Dashboard

The 20260624 version counted:
```sql
'customer_returns', (SELECT COUNT(*) FROM returns r WHERE r.status NOT ILIKE '%CANCEL%')
```

This is ALL-TIME, not period-scoped. Operations KPIs are date-filtered by `channel_created_at` but customer returns were never filtered to the same period. A fixed `customer_returns` should filter by `returned_at` in the selected period.

---

## MEDIUM SEVERITY (definition mismatches, labeling issues)

| ID | Issue | Screen | Impact |
|----|-------|--------|--------|
| MED-01 | Sales Register shows all orders including non-commercial with no label | Sales Register | Revenue column sums include non-commercial if exported |
| MED-02 | `avg_collection_days` in Receivables uses `ordered_at`, not `delivered_at` | Receivables | Overstates collection time (clock should start at delivery) |
| MED-03 | `collection_efficiency_pct` based on gateway settlements only, not COD | Receivables | Incomplete picture — COD efficiency not measured |
| MED-04 | `v_top_cities` is all-time with no period filter; Customer page passes no dates | Customers | Cities always show all-time regardless of period selector |
| MED-05 | `get_inventory_kpis` BOM consumption uses hardcoded product IDs | Inventory | Will break if product catalog changes |

---

## LOW SEVERITY (intentional differences, needs documentation)

| ID | Issue | Notes |
|----|-------|-------|
| LOW-01 | Profitability uses delivered_at; Executive uses ordered_at | Intentional per business rules. Must label both clearly. |
| LOW-02 | Bank `latest_balance` not period-filtered | Correct — balance is always current, not end-of-period |
| LOW-03 | `avg_orders_per_customer` is period-scoped not lifetime | Needs label: "Avg orders in selected period" not "lifetime" |
| LOW-04 | Executive RTO uses `channel_created_at`; Operations uses `channel_created_at` | Same dimension — consistent ✓ |

---

## Phase 5 — Transaction Register Validation

| KPI | Dashboard | Should Reconcile With | Status |
|-----|-----------|----------------------|--------|
| Gross Revenue | Executive | Sales Register (sum of order_total_inr) | ⚠️ Register shows non-commercial orders too — totals will differ |
| COD Outstanding | Operations | COD table in Operations | ❌ Different amounts (DEFECT-01) |
| Purchases / COGS | Profitability | Purchase Register | Cannot reconcile — P&L uses order_lines × product_costs; Purchase Register uses purchase_orders |
| Operating Expenses | Profitability | Expenses Register | ✓ Both from `expenses` table |
| Bank Balance | Banking | Receipts − Payments Register | ✓ Both from `bank_transactions` |
| Customer Count | Customers | Customer Register | ✓ Both from `customers` + `orders` |

---

## Phase 6 — Profitability Audit: Revenue vs COGS Mismatch Investigation

### The Reported Mismatch (COD Collection ₹9.42L vs Higher Purchase Amount)

**Possible explanation (requires SQL verification against live data):**

1. **Date filter mismatch:** The profitability P&L for delivered orders uses `delivered_at`. If you run it for a period where many orders were placed but not yet delivered, the purchase register (by invoice_date) will show higher values than the profitability COGS.

2. **Purchase Register ≠ COGS:** The purchase register shows `purchase_orders.total_inr` (what was paid to suppliers). The profitability COGS uses `product_costs.landed_cost_inr × units_sold`. These are fundamentally different:
   - Purchase Register: cash paid for inventory (regardless of whether sold)
   - COGS in P&L: cost of units that were actually delivered (inventory consumed)
   - Example: If ₹5L of inventory was purchased but only ₹3L worth was sold/delivered, Purchase Register = ₹5L, COGS = ₹3L.

3. **BOM allocation gap:** Set products (Sports Bra + Leggings sets) use BOM to allocate cost. If BOM costs are missing or incorrect, COGS will be understated.

4. **BR-201 violation in profitability (DEFECT-04):** Non-commercial orders included in delivered revenue inflates the revenue side, possibly masking the true margin.

**Next step:** Run this SQL to compare:
```sql
-- Compare P&L revenue vs Purchase Register for same period
SELECT 
  (SELECT SUM(ol.line_total_inr) 
   FROM order_lines ol 
   JOIN shipments s ON s.order_id = ol.order_id 
   WHERE s.status = 'DELIVERED' AND s.delivered_at::date BETWEEN '2026-01-01' AND CURRENT_DATE
  ) AS profitability_revenue,
  
  (SELECT SUM(total_inr) FROM purchase_orders WHERE invoice_date BETWEEN '2026-01-01' AND CURRENT_DATE
  ) AS purchase_register_total,
  
  (SELECT SUM(revenue_inr) FROM v_revenue_events WHERE event_at::date BETWEEN '2026-01-01' AND CURRENT_DATE
  ) AS executive_revenue;
```

---

## Phase 7 — KPI Dictionary (Authoritative Definitions)

| KPI | Definition | Formula | Date Dimension | Source | Verified |
|-----|-----------|---------|----------------|--------|---------|
| Gross Revenue | Total commercial order value in period | `SUM(orders.order_total_inr)` for commercial orders | `ordered_at` | `v_revenue_events` | ✓ |
| Orders | Commercial order count | `COUNT(orders.id)` | `ordered_at` | `v_revenue_events` | ✓ |
| AOV | Average commercial order value | `Gross Revenue / Orders` | `ordered_at` | `get_executive_kpis` | ✓ |
| New Customers | Customers whose first_order_at is in period | `COUNT(customers WHERE first_order_at IN period)` | `ordered_at` | `get_executive_kpis` | ⚠️ BR-201 gap |
| Repeat Customer % | % of period customers who are not first-time | `(period_customers − new) / period_customers` | `ordered_at` | `get_customer_kpis` | ✓ |
| Delivered Revenue | Line revenue from delivered orders | `SUM(order_lines.line_total_inr) WHERE DELIVERED` | `delivered_at` | `get_profitability_kpis` | ⚠️ BR-201 gap, excludes shipping |
| COGS | Product cost of delivered units | `SUM(quantity × landed_cost_inr) WHERE DELIVERED` | `delivered_at` | `get_profitability_kpis` | ⚠️ BR-201 gap |
| COD Outstanding | Customer cash owed on delivered COD orders not yet bank-matched | `SUM(order_total_inr) WHERE delivered, COD, no CRF bank match` | all-time | `get_receivables_kpis` | ✓ (Receivables only) |
| RTO Rate | % of shipments returned to origin | `RTO shipments / total shipments` | `channel_created_at` | `get_operations_kpis` | ❌ misses status variants |
| Delivery Success % | % of shipments successfully delivered | `DELIVERED / total shipments` | `channel_created_at` | `get_operations_kpis` | ✓ |
| Cash Position | Latest bank closing balance | Last `closing_balance_inr` from `bank_transactions` | real-time | `get_director_snapshot` | ✓ |

---

## Phase 8 — Trust Score

| Screen | Trust Score | Critical Issues |
|--------|-------------|-----------------|
| Command Center | 🔴 40/100 | COD wrong (DEFECT-01), Return rate mixed dates (DEFECT-05) |
| Executive Overview | 🟡 75/100 | New customers not BR-201 filtered (HIGH-06) |
| Customer Intelligence | 🟡 70/100 | Growth chart vs KPI inconsistency (HIGH-07), cities all-time (MED-04) |
| Operations | 🔴 35/100 | COD wrong (DEFECT-01), RTO under-counted (DEFECT-02), In-transit under-counted (DEFECT-03) |
| Profitability | 🔴 45/100 | BR-201 violation (DEFECT-04), promo_spend missing (HIGH-01), return_cost zero (HIGH-02) |
| Bank & Cash | 🟢 85/100 | Minor: unclassified count includes credits |
| Receivables | 🟡 70/100 | avg_collection_days uses ordered_at not delivered_at (MED-02) |
| Sales Register | 🟡 65/100 | Shows non-commercial orders without visual warning (MED-01) |
| Purchase Register | 🟢 90/100 | No known defects |
| Expenses Register | 🟢 90/100 | No known defects |
| **Overall** | **🔴 62/100** | 5 Critical, 8 High issues |

---

## Recommended Fix Order

| Priority | Defect | Screens Fixed | Fix Complexity |
|----------|--------|---------------|---------------|
| P0 | DEFECT-01: COD Outstanding uses service fee not order total | Director, Operations | SQL only — 2 RPCs |
| P0 | DEFECT-02: Operations RTO misses status variants | Operations | SQL only — 1 RPC |
| P0 | DEFECT-03: Operations In-transit misses status variants | Operations | SQL only — 1 RPC |
| P0 | DEFECT-04: Profitability BR-201 violation | Profitability | SQL — 7 RPCs, add filter |
| P0 | DEFECT-05: Return rate mixed date periods | Command Center | SQL — 1 RPC |
| P1 | HIGH-03: customer_returns removed (regression) | Operations | SQL — 1 RPC, restore + date-scope |
| P1 | HIGH-01: promo_spend_inr missing | Profitability | Decide: add to SQL or remove from type |
| P1 | HIGH-02: return_cost hardcoded 0 | Profitability | SQL — calculate from returns/RTO freight |
| P1 | HIGH-06: new_customers not BR-201 filtered | Executive | SQL — 1 RPC |
| P2 | HIGH-04: Revenue definition difference documented | All | Documentation + UI labels only |
| P2 | MED-02: avg_collection_days uses ordered_at | Receivables | SQL — 1 RPC |
| P2 | MED-04: v_top_cities is always all-time | Customers | SQL — add date parameters |

---

*All SQL changes require a migration file in `supabase/migrations/YYYYMMDD_description.sql`. No implementation should begin until the root cause for each defect is confirmed against live data.*
