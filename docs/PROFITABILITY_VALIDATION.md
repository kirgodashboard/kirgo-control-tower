# Profitability Engine — Validation Reference

> Last updated: 2026-06-20  
> All-time verified values: ₹13,68,462 revenue · 37.5% gross margin · 33% contribution margin

---

## KPI Definitions & SQL Sources

### 1. Gross Revenue (`revenue_inr`)

**Source:** `get_profitability_kpis(p_start, p_end)`  
**Calculation:** `SUM(order_lines.line_total_inr)` for all `order_lines` belonging to `DELIVERED` shipments in the date range.

**Validation query:**
```sql
SELECT SUM(ol.line_total_inr) AS revenue
FROM order_lines ol
JOIN (
  SELECT DISTINCT ON (order_id) order_id
  FROM shipments
  WHERE status = 'DELIVERED'
    AND delivered_at::date BETWEEN '2023-01-01' AND CURRENT_DATE
  ORDER BY order_id, delivered_at DESC
) ds ON ds.order_id = ol.order_id
WHERE ol.line_total_inr IS NOT NULL;
```
**Dashboard value (All Time):** ₹13.68L

---

### 2. COGS — Landed Cost (`cogs_inr`)

**Source:** `get_profitability_kpis`  
**Calculation:** `SUM(ol.quantity × landed_cost_inr)` per order line.  
**Priority:** (1) `product_costs.landed_cost_inr` where `variant_id` matches and `effective_from ≤ delivered_date`, (2) fallback to `products.cogs_total_inr`.

**Validation query:**
```sql
SELECT SUM(
  ol.quantity * COALESCE(
    (SELECT pc.landed_cost_inr FROM product_costs pc
     WHERE pc.variant_id = ol.variant_id
       AND pc.effective_from <= s.delivered_at::date
     ORDER BY pc.effective_from DESC LIMIT 1),
    (SELECT p.cogs_total_inr FROM product_variants pv
     JOIN products p ON p.id = pv.product_id
     WHERE pv.id = ol.variant_id LIMIT 1)
  )
) AS cogs
FROM order_lines ol
JOIN (
  SELECT DISTINCT ON (order_id) order_id, delivered_at::date AS delivered_date
  FROM shipments WHERE status = 'DELIVERED'
  ORDER BY order_id, delivered_at DESC
) ds ON ds.order_id = ol.order_id
WHERE ol.variant_id IS NOT NULL;
```
**Dashboard value (All Time):** ₹8.55L (approx 62.5% of revenue)

---

### 3. Gross Profit & Gross Margin %

**Calculation:** `revenue_inr − cogs_inr`  
**Margin %:** `(gross_profit / revenue) × 100`

**Dashboard value (All Time):** ₹5.13L · **37.5%**

Cross-check: Product P&L table sums = Gross KPI total (100% attribution verified).

---

### 4. Outbound Shipping Cost (`shipping_cost_inr`)

**Source:** `SUM(shipments.freight_total_inr)` for all delivered shipments (one row per order via `DISTINCT ON`).

**Validation query:**
```sql
SELECT SUM(freight_total_inr)
FROM (
  SELECT DISTINCT ON (order_id) freight_total_inr
  FROM shipments WHERE status = 'DELIVERED'
  ORDER BY order_id, delivered_at DESC
) s;
```

---

### 5. COD Charges (`cod_charges_inr`)

**Source:** `SUM(shipments.cod_charges_inr)` for delivered shipments.

---

### 6. Ad Spend (`ad_spend_inr`)

**Source:** `SUM(ad_spend_daily.spend_inr)` where `spend_date BETWEEN p_start AND p_end`.

---

### 7. Contribution Margin

**Calculation:** `revenue − cogs − shipping − cod_charges − ad_spend`  
**Margin %:** `(contribution_margin / revenue) × 100`

**Dashboard value (All Time):** ~33%

---

### 8. Return Cost Impact (`return_cost_inr`)

**Source:** COGS of order lines belonging to orders with shipments in status `RTO`, `RETURNED`, or `RETURN_DELIVERED` within the date range.

**Calculation:** Same COGS lookup as delivered orders, applied to returned order lines.

**Dashboard value (All Time):** ₹0 (zero RTOs recorded to date)

---

## Join Strategy

All RPCs use this pattern to prevent double-counting multi-shipment orders:

```sql
-- Step 1: one row per order (latest shipment wins)
WITH delivered_orders AS (
  SELECT DISTINCT ON (o.id)
    o.id, s.delivered_at::date AS delivered_date, ...
  FROM orders o
  JOIN shipments s ON s.order_id = o.id
  WHERE s.status = 'DELIVERED'
  ORDER BY o.id, s.delivered_at DESC
)
-- Step 2: join order_lines on order_id only (not variant_id — shipments.variant_id is NULL)
SELECT ... FROM order_lines ol
JOIN delivered_orders dord ON dord.order_id = ol.order_id
```

**Why `DISTINCT ON`:** `shipments.variant_id` is NULL in production data; joining on both `order_id AND variant_id` returns zero rows.

---

## Trend RPC (`get_profitability_trend`)

| Period span | Bucket size |
|-------------|-------------|
| ≤ 90 days   | Weekly (`date_trunc('week', ...)`) |
| > 90 days   | Monthly (`date_trunc('month', ...)`) |

Returns: `period, revenue_inr, cogs_inr, gross_profit_inr, gross_margin_pct`

---

## Product P&L Cross-Check (All Time)

Run to verify product totals equal KPI total:

```sql
SELECT
  SUM(revenue_inr)      AS total_revenue,
  SUM(cogs_inr)         AS total_cogs,
  SUM(gross_profit_inr) AS total_gross_profit
FROM get_product_pl('2023-01-01', CURRENT_DATE);
```

Expected: matches `get_profitability_kpis` revenue and COGS exactly.

---

## Margin Thresholds (UI)

| Metric        | Green  | Amber      | Red    |
|---------------|--------|------------|--------|
| Gross Margin  | ≥ 35%  | 20–34%     | < 20%  |
| Contribution  | ≥ 15%  | 5–14%      | < 5%   |
| Return Cost   | = ₹0   | ₹1–₹20K   | > ₹50K |

---

## Files Changed

| File | Purpose |
|------|---------|
| `supabase/migrations/20260619_profitability_rpcs.sql` | 6 core RPCs (fixed join strategy) |
| `supabase/migrations/20260620_profitability_trend_rpc.sql` | Trend RPC + `return_cost_inr` added to KPI RPC |
| `frontend/src/types/kpi.ts` | `ProfitabilityKpis.return_cost_inr`, `ProfitabilityTrendPoint` |
| `frontend/src/lib/data/profitability.ts` | `fetchProfitabilityTrend` |
| `frontend/src/lib/hooks/use-profitability.ts` | `useProfitabilityTrend` |
| `frontend/src/features/profitability/kpi-row.tsx` | 6-card KPI row |
| `frontend/src/features/profitability/pl-tables.tsx` | Sort + CSV export on all 5 tables |
| `frontend/src/features/profitability/profitability-charts.tsx` | 4 charts (new) |
| `frontend/src/app/dashboard/profitability/page.tsx` | Full page with charts section |
| `frontend/src/features/director/business-summary.tsx` | Profitability insights section |
| `frontend/src/components/layout/sidebar.tsx` | Profitability moved to 3rd position |
