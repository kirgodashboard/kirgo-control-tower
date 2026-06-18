# Kirgo Control Tower — KPI Technical Specification
**Version:** 1.0 | **Date:** 2026-06-18  
**Purpose:** Engineering reference for implementing all 34 KPIs. Provides formula, SQL pattern, source tables, snapshot field, refresh frequency, alert thresholds, and dashboard location for each metric.  
**Companion docs:** `KPI_DEFINITIONS.md` (business narrative) · `DATA_DICTIONARY.md` (table reference) · `BUSINESS_RULES.md` (validation rules)

---

## Implementation Notes

**Revenue recognition (BR-REV-01):** All revenue KPIs use `shipments.status = 'DELIVERED' AND shipments.delivered_at IS NOT NULL` as the filter. `orders.order_total_inr` is NOT a revenue figure.

**Shipping neutrality (BR-004):** `shipments.freight_total_inr`, `shipments.cod_charges_inr`, and `orders.shipping_charged_inr` are EXCLUDED from all revenue KPIs.

**Order counting (BR-DQ-01):** Always `COUNT(DISTINCT orders.woocommerce_order_id)` — never count shipment rows directly for order volume.

**Net revenue formula:** `SUM(ol.line_total_inr) - SUM(r.refund_amount_inr) - SUM(o.discount_inr)` for delivered orders in period.

**Snapshot-first pattern:** All P1 KPIs read from `kpi_daily_snapshot` or `kpi_monthly_snapshot` on the dashboard hot path. The SQL patterns below are used to populate those tables — not called directly on every dashboard load.

---

## Group A: Executive KPIs (6 KPIs)

---

### A-01: Monthly Gross Revenue
**Priority:** P1 | **Refresh:** Daily | **Snapshot:** `kpi_daily_snapshot.gross_revenue_inr` + `kpi_monthly_snapshot.gross_revenue_inr`

**Formula:** `SUM(order_lines.line_total_inr)` for orders with `shipments.status = 'DELIVERED'` in period

```sql
SELECT DATE_TRUNC('month', s.delivered_at) AS month,
       SUM(ol.line_total_inr)              AS gross_revenue_inr
FROM order_lines ol
JOIN shipments s ON s.order_id = ol.order_id
WHERE s.status      = 'DELIVERED'
  AND s.delivered_at IS NOT NULL
  AND s.delivered_at >= :period_start
  AND s.delivered_at <  :period_end
GROUP BY 1
ORDER BY 1;
```

**Source Tables:** order_lines · shipments  
**Alert:** None — informational P1 card  
**Dashboard:** Executive Dashboard → Revenue Card (MTD vs prior month)

---

### A-02: Net Revenue
**Priority:** P1 | **Refresh:** Daily | **Snapshot:** `kpi_daily_snapshot.net_revenue_inr` + `kpi_monthly_snapshot.net_revenue_inr`

**Formula:** `Gross Revenue - SUM(returns.refund_amount_inr) - SUM(orders.discount_inr)` for delivered orders in period

```sql
SELECT DATE_TRUNC('month', s.delivered_at) AS month,
       SUM(ol.line_total_inr)
         - COALESCE(SUM(r.refund_amount_inr) FILTER (WHERE r.returned_at BETWEEN :start AND :end), 0)
         - COALESCE(SUM(o.discount_inr), 0)   AS net_revenue_inr
FROM order_lines ol
JOIN orders o ON o.id = ol.order_id
JOIN shipments s ON s.order_id = ol.order_id
LEFT JOIN returns r ON r.shipment_id = s.id
WHERE s.status = 'DELIVERED' AND s.delivered_at IS NOT NULL
  AND s.delivered_at BETWEEN :start AND :end
GROUP BY 1;
```

**Source Tables:** order_lines · orders · shipments · returns  
**Alert:** None — informational  
**Dashboard:** Executive Dashboard → Net Revenue Card

---

### A-03: Orders Delivered
**Priority:** P1 | **Refresh:** Daily | **Snapshot:** `kpi_daily_snapshot.orders_delivered`

**Formula:** `COUNT(DISTINCT orders.woocommerce_order_id)` where shipment delivered in period

```sql
SELECT COUNT(DISTINCT o.woocommerce_order_id) AS orders_delivered
FROM orders o
JOIN shipments s ON s.order_id = o.id
WHERE s.status = 'DELIVERED' AND s.delivered_at IS NOT NULL
  AND s.delivered_at BETWEEN :start AND :end;
```

**Source Tables:** orders · shipments  
**Dashboard:** Executive Dashboard → Orders Card

---

### A-04: Average Order Value (AOV)
**Priority:** P1 | **Refresh:** Daily | **Snapshot:** `kpi_daily_snapshot.avg_order_value_inr`

**Formula:** `Gross Revenue / Orders Delivered` for period

```sql
SELECT SUM(ol.line_total_inr) / NULLIF(COUNT(DISTINCT o.woocommerce_order_id), 0) AS aov_inr
FROM order_lines ol
JOIN orders o ON o.id = ol.order_id
JOIN shipments s ON s.order_id = ol.order_id
WHERE s.status = 'DELIVERED' AND s.delivered_at BETWEEN :start AND :end;
```

**Source Tables:** order_lines · orders · shipments  
**Dashboard:** Executive Dashboard → AOV Card

---

### A-05: Active Customers (30-Day)
**Priority:** P2 | **Refresh:** Daily | **Snapshot:** `kpi_daily_snapshot.new_customers` (new only; active = derived)

**Formula:** `COUNT(DISTINCT customer_id)` for orders with a delivered shipment in rolling 30 days

```sql
SELECT COUNT(DISTINCT o.customer_id) AS active_customers_30d
FROM orders o
JOIN shipments s ON s.order_id = o.id
WHERE s.status = 'DELIVERED' AND s.delivered_at IS NOT NULL
  AND s.delivered_at >= CURRENT_DATE - INTERVAL '30 days';
```

**Source Tables:** orders · shipments  
**Dashboard:** Executive Dashboard → Active Customers Card

---

### A-06: Net Cash Position
**Priority:** P1 | **Refresh:** Daily | **Snapshot:** `kpi_daily_snapshot.closing_bank_balance_inr`

**Formula:** Latest `bank_transactions.closing_balance_inr` row

```sql
SELECT closing_balance_inr
FROM bank_transactions
WHERE closing_balance_inr IS NOT NULL
ORDER BY transaction_date DESC, id DESC
LIMIT 1;
```

**Source Tables:** bank_transactions  
**Alert:** Critical < ₹1,00,000 · Warning < ₹2,00,000  
**Dashboard:** Executive Dashboard → Cash Position Card (with COD Outstanding overlay)

---

## Group B: Sales KPIs (6 KPIs)

---

### B-01: Gross Revenue (configurable period)
**Priority:** P2 | **Refresh:** Daily | **Snapshot:** `kpi_monthly_snapshot.gross_revenue_inr`

Same formula as A-01 with configurable period (daily/weekly/monthly/custom).  
**Source Tables:** order_lines · shipments  
**Dashboard:** Sales Dashboard → Revenue trend chart

---

### B-02: Net Revenue (configurable period)
**Priority:** P3 | **Refresh:** Daily | **Snapshot:** `kpi_monthly_snapshot.net_revenue_inr`

Same formula as A-02 with configurable period.  
**Source Tables:** order_lines · orders · shipments · returns  
**Dashboard:** Sales Dashboard

---

### B-03: Units Sold
**Priority:** P2 | **Refresh:** Daily | **Snapshot:** `kpi_daily_snapshot.units_sold`

**Formula:** `SUM(order_lines.quantity)` for delivered orders in period

```sql
SELECT SUM(ol.quantity) AS units_sold
FROM order_lines ol
JOIN shipments s ON s.order_id = ol.order_id
WHERE s.status = 'DELIVERED' AND s.delivered_at BETWEEN :start AND :end;
```

**Source Tables:** order_lines · shipments  
**Dashboard:** Sales Dashboard → Units Card

---

### B-04: Revenue by Launch
**Priority:** P1 | **Refresh:** Daily | **Snapshot:** `kpi_monthly_snapshot` per `launch_id`

**Formula:** A-01 grouped by `products.launch_id`

```sql
SELECT l.code AS launch_code, l.name AS launch_name,
       SUM(ol.line_total_inr) AS gross_revenue_inr,
       COUNT(DISTINCT o.woocommerce_order_id) AS orders
FROM order_lines ol
JOIN product_variants pv ON pv.id = ol.variant_id
JOIN products p ON p.id = pv.product_id
JOIN launches l ON l.id = p.launch_id
JOIN orders o ON o.id = ol.order_id
JOIN shipments s ON s.order_id = ol.order_id
WHERE s.status = 'DELIVERED' AND s.delivered_at BETWEEN :start AND :end
GROUP BY l.code, l.name
ORDER BY gross_revenue_inr DESC;
```

**Source Tables:** order_lines · product_variants · products · launches · orders · shipments  
**Dependency:** Requires `order_lines.variant_id` to be non-NULL (post-seed UPDATE pending)  
**Dashboard:** Sales Dashboard → Revenue by Launch donut/bar

---

### B-05: Revenue by Product
**Priority:** P3 | **Refresh:** Weekly | **Snapshot:** `mv_product_profitability` (materialized view)

**Formula:** A-01 grouped by `products.id`

```sql
SELECT p.name, p.product_type,
       SUM(ol.line_total_inr) AS revenue_inr,
       SUM(ol.quantity) AS units_sold,
       SUM(ol.quantity * p.gross_margin_inr) AS gm_inr,
       p.gross_margin_pct
FROM order_lines ol
JOIN product_variants pv ON pv.id = ol.variant_id
JOIN products p ON p.id = pv.product_id
JOIN shipments s ON s.order_id = ol.order_id
WHERE s.status = 'DELIVERED' AND s.delivered_at BETWEEN :start AND :end
GROUP BY p.id, p.name, p.product_type, p.gross_margin_pct
ORDER BY revenue_inr DESC;
```

**Source Tables:** order_lines · product_variants · products · shipments  
**Dependency:** order_lines.variant_id non-NULL  
**Dashboard:** Sales Dashboard → Product table

---

### B-06: Revenue by State
**Priority:** P3 | **Refresh:** Weekly

**Formula:** A-01 grouped by `orders.billing_state`

```sql
SELECT o.billing_state,
       SUM(ol.line_total_inr) AS revenue_inr,
       COUNT(DISTINCT o.woocommerce_order_id) AS orders
FROM order_lines ol JOIN orders o ON o.id = ol.order_id
JOIN shipments s ON s.order_id = ol.order_id
WHERE s.status = 'DELIVERED' AND s.delivered_at BETWEEN :start AND :end
GROUP BY o.billing_state
ORDER BY revenue_inr DESC;
```

**Source Tables:** order_lines · orders · shipments  
**Dashboard:** Sales Dashboard → State heatmap

---

## Group C: Operations KPIs (7 KPIs)

---

### C-01: Return Rate %
**Priority:** P2 | **Refresh:** Weekly | **Snapshot:** `kpi_monthly_snapshot.return_rate_pct`

**Formula:** `COUNT(returns) / COUNT(DISTINCT delivered orders) × 100`

```sql
SELECT
  COUNT(r.id) * 100.0
  / NULLIF(COUNT(DISTINCT o.woocommerce_order_id), 0) AS return_rate_pct
FROM orders o
JOIN shipments s ON s.order_id = o.id
LEFT JOIN returns r ON r.shipment_id = s.id AND r.returned_at BETWEEN :start AND :end
WHERE s.status = 'DELIVERED' AND s.delivered_at BETWEEN :start AND :end;
```

**Alert:** Warning > 5% · OK ≤ 5%  
**Dashboard:** Operations Dashboard → Return Rate Card

---

### C-02: Return Value (INR)
**Priority:** P2 | **Refresh:** Weekly

**Formula:** `SUM(returns.refund_amount_inr)` in period

```sql
SELECT SUM(refund_amount_inr) AS return_value_inr
FROM returns WHERE returned_at BETWEEN :start AND :end
  AND refund_amount_inr IS NOT NULL;
```

**Source Tables:** returns  
**Dashboard:** Operations Dashboard → Return Value Card

---

### C-03: RTO Rate %
**Priority:** P2 | **Refresh:** Weekly | **Snapshot:** `kpi_monthly_snapshot.rto_rate_pct`

**Formula:** `COUNT(status='RTO_DELIVERED') / COUNT(all shipped) × 100`

```sql
SELECT
  COUNT(CASE WHEN status = 'RTO_DELIVERED' THEN 1 END) * 100.0
  / NULLIF(COUNT(*), 0) AS rto_rate_pct
FROM shipments
WHERE shiprocket_created_at BETWEEN :start AND :end
  AND status NOT IN ('CANCELLED');
```

**Alert:** Critical > 15% · Warning 10–15% · Watch 5–10% · OK < 5%  
**Dashboard:** Operations Dashboard → RTO Rate Card

---

### C-04: RTO Value (INR)
**Priority:** P2 | **Refresh:** Weekly

**Formula:** `SUM(freight_total_inr × 2)` for RTO_DELIVERED shipments in period (two-way freight)

```sql
SELECT SUM(freight_total_inr * 2) AS rto_cost_inr
FROM shipments
WHERE status = 'RTO_DELIVERED'
  AND rto_delivered_at BETWEEN :start AND :end;
```

**Source Tables:** shipments  
**Dashboard:** Operations Dashboard → RTO Cost Card

---

### C-05: Delivery Success Rate %
**Priority:** P2 | **Refresh:** Weekly

**Formula:** `COUNT(DELIVERED) / (COUNT(DELIVERED) + COUNT(RTO_DELIVERED)) × 100`

```sql
SELECT
  COUNT(CASE WHEN status = 'DELIVERED' THEN 1 END) * 100.0
  / NULLIF(COUNT(CASE WHEN status IN ('DELIVERED','RTO_DELIVERED') THEN 1 END), 0)
  AS delivery_success_pct
FROM shipments
WHERE (delivered_at BETWEEN :start AND :end)
   OR (rto_delivered_at BETWEEN :start AND :end);
```

**Alert:** Warning < 85% · OK ≥ 90%  
**Dashboard:** Operations Dashboard → Delivery Success Card

---

### C-06: Average Delivery Days
**Priority:** P3 | **Refresh:** Weekly

**Formula:** `AVG(delivered_at - shipped_at)` in days for DELIVERED shipments

```sql
SELECT AVG(EXTRACT(EPOCH FROM (delivered_at - shipped_at)) / 86400)::numeric(5,1)
       AS avg_delivery_days
FROM shipments
WHERE status = 'DELIVERED'
  AND delivered_at IS NOT NULL AND shipped_at IS NOT NULL
  AND delivered_at BETWEEN :start AND :end;
```

**Source Tables:** shipments  
**Alert:** Warning > 5 days · OK ≤ 4 days  
**Dashboard:** Operations Dashboard → Avg Delivery Days

---

### C-07: Courier Performance Score
**Priority:** P3 | **Refresh:** Weekly

**Formula:** Per courier: `delivery_success_rate` weighted by volume

```sql
SELECT courier_company,
       COUNT(*) AS shipments,
       COUNT(CASE WHEN status='DELIVERED' THEN 1 END) * 100.0
         / NULLIF(COUNT(CASE WHEN status IN ('DELIVERED','RTO_DELIVERED') THEN 1 END), 0)
         AS success_rate_pct,
       AVG(CASE WHEN status='DELIVERED'
           THEN EXTRACT(EPOCH FROM (delivered_at - shipped_at))/86400 END)::numeric(5,1)
         AS avg_days
FROM shipments
WHERE (delivered_at BETWEEN :start AND :end OR rto_delivered_at BETWEEN :start AND :end)
GROUP BY courier_company
ORDER BY shipments DESC;
```

**Source Tables:** shipments  
**Dashboard:** Operations Dashboard → Courier table

---

## Group D: Profitability KPIs (5 KPIs)

---

### D-01: Blended Gross Margin %
**Priority:** P1 | **Refresh:** Weekly | **Snapshot:** `kpi_monthly_snapshot.gross_margin_pct`

**Formula:** `SUM(ol.quantity × p.gross_margin_inr) / SUM(ol.line_total_inr) × 100`

```sql
SELECT
  SUM(ol.quantity * p.gross_margin_inr) AS gm_inr,
  SUM(ol.line_total_inr) AS revenue_inr,
  SUM(ol.quantity * p.gross_margin_inr) * 100.0
    / NULLIF(SUM(ol.line_total_inr), 0)  AS blended_gm_pct
FROM order_lines ol
JOIN product_variants pv ON pv.id = ol.variant_id
JOIN products p ON p.id = pv.product_id
JOIN shipments s ON s.order_id = ol.order_id
WHERE s.status = 'DELIVERED' AND s.delivered_at BETWEEN :start AND :end;
```

**Source Tables:** order_lines · product_variants · products · shipments  
**Dependency:** order_lines.variant_id non-NULL  
**Alert:** Warning < 35% · OK ≥ 40%  
**Dashboard:** Profitability Dashboard → Gross Margin Card

---

### D-02: Contribution Margin %
**Priority:** P2 | **Refresh:** Monthly | **Snapshot:** `kpi_monthly_snapshot.contribution_margin_pct`

**Formula:** `(GM − Freight − COD Charges − Ad Spend) / Net Revenue × 100`

```sql
WITH base AS (
  SELECT
    SUM(ol.quantity * p.gross_margin_inr)               AS gm_inr,
    SUM(s.freight_total_inr)                            AS freight_inr,
    SUM(s.cod_charges_inr)                              AS cod_inr,
    (SELECT COALESCE(SUM(spend_inr),0) FROM ad_spend_daily
     WHERE spend_date BETWEEN :start AND :end)          AS ad_spend_inr,
    SUM(ol.line_total_inr)
      - COALESCE((SELECT SUM(refund_amount_inr) FROM returns r2
                  JOIN shipments s2 ON s2.id = r2.shipment_id
                  WHERE s2.order_id = ol.order_id
                    AND r2.returned_at BETWEEN :start AND :end), 0)
      - COALESCE(SUM(o.discount_inr), 0)                AS net_revenue_inr
  FROM order_lines ol
  JOIN orders o ON o.id = ol.order_id
  JOIN product_variants pv ON pv.id = ol.variant_id
  JOIN products p ON p.id = pv.product_id
  JOIN shipments s ON s.order_id = ol.order_id
  WHERE s.status = 'DELIVERED' AND s.delivered_at BETWEEN :start AND :end
)
SELECT
  gm_inr - freight_inr - cod_inr - ad_spend_inr  AS cm_inr,
  (gm_inr - freight_inr - cod_inr - ad_spend_inr)
    * 100.0 / NULLIF(net_revenue_inr, 0)          AS cm_pct
FROM base;
```

**Source Tables:** order_lines · product_variants · products · orders · shipments · returns · ad_spend_daily  
**Dependencies:** order_lines.variant_id non-NULL; ad_spend_daily populated  
**Alert:** Critical CM% < 0 · Warning 0–10% · Watch 10–20% · OK > 20%  
**Dashboard:** Profitability Dashboard → Contribution Margin Panel

---

### D-03: Net Margin %
**Priority:** P2 | **Refresh:** Monthly

**Formula:** `(CM − Opex − RTO Freight) / Net Revenue × 100`

```sql
-- CM from D-02
-- opex = SUM(expenses.amount_inr WHERE expense_date IN period)
-- rto_cost = SUM(freight_total_inr * 2) FROM shipments WHERE status='RTO_DELIVERED' AND rto_delivered_at IN period
SELECT
  (:cm_inr - :opex_inr - :rto_cost_inr)            AS net_margin_inr,
  (:cm_inr - :opex_inr - :rto_cost_inr) * 100.0
    / NULLIF(:net_revenue_inr, 0)                   AS net_margin_pct;
```

**Source Tables:** expenses · shipments · kpi_monthly_snapshot (CM input)  
**Dependencies:** expenses populated · D-02 computed  
**Alert:** Critical < 0% · Warning 0–5% · OK > 5%  
**Dashboard:** Profitability Dashboard → P&L Summary Card

---

### D-04: Product Profitability
**Priority:** P2 | **Refresh:** Weekly | **Snapshot:** `mv_product_profitability` (materialized view)

See B-05 SQL pattern — same query, different dashboard context.  
**Dependencies:** order_lines.variant_id non-NULL  
**Dashboard:** Profitability Dashboard → Product table (GM% vs Revenue 2×2 matrix)

---

### D-05: Launch Profitability
**Priority:** P1 | **Refresh:** Monthly

**Formula:** `Cumulative Net Revenue (all time, per launch) − Total Investment`

```sql
SELECT l.code, l.name, l.total_investment_inr,
  SUM(ol.line_total_inr) - COALESCE(SUM(r.refund_amount_inr),0)
    - COALESCE(SUM(o.discount_inr),0)                    AS cumulative_net_revenue,
  SUM(ol.line_total_inr) - COALESCE(SUM(r.refund_amount_inr),0)
    - COALESCE(SUM(o.discount_inr),0)
    - l.total_investment_inr                              AS net_pl_inr,
  (SUM(ol.line_total_inr) - COALESCE(SUM(r.refund_amount_inr),0)
    - COALESCE(SUM(o.discount_inr),0)
    - l.total_investment_inr)
    * 100.0 / NULLIF(l.total_investment_inr, 0)          AS roi_pct
FROM order_lines ol
JOIN product_variants pv ON pv.id = ol.variant_id
JOIN products p ON p.id = pv.product_id
JOIN launches l ON l.id = p.launch_id
JOIN orders o ON o.id = ol.order_id
JOIN shipments s ON s.order_id = ol.order_id
LEFT JOIN returns r ON r.shipment_id = s.id
WHERE s.status = 'DELIVERED'
GROUP BY l.id, l.code, l.name, l.total_investment_inr
ORDER BY l.code;
```

**Dependencies:** launch_expenses populated (to compute total_investment_inr) · order_lines.variant_id non-NULL  
**Dashboard:** Profitability Dashboard → Launch ROI Panel (one card per launch with breakeven chart)

---

## Group E: Inventory KPIs (6 KPIs)

All E-group KPIs are **blocked** until `inventory_batches` and `inventory_ledger` are seeded.  
E-03, E-05, E-06 read from `inventory_forecasts` (Phase 2 compute).

---

### E-01: Inventory Value at Cost
**Priority:** P1 | **Refresh:** Real-time

```sql
SELECT SUM(stock.qty * p.cogs_total_inr) AS total_inventory_value_inr
FROM (
  SELECT il.variant_id, SUM(il.quantity_delta) AS qty
  FROM inventory_ledger il GROUP BY il.variant_id
  HAVING SUM(il.quantity_delta) > 0
) stock
JOIN product_variants pv ON pv.id = stock.variant_id
JOIN products p ON p.id = pv.product_id;
```

**Source Tables:** inventory_ledger · product_variants · products  
**Dashboard:** Inventory Dashboard → Total Inventory Value Card

---

### E-02: Inventory Turnover (Annualised)
**Priority:** P3 | **Refresh:** Monthly

**Formula:** `(Units Sold / Average Stock) × (365 / Days in Period)`

```sql
WITH sold AS (
  SELECT SUM(ol.quantity) AS units
  FROM order_lines ol JOIN shipments s ON s.order_id = ol.order_id
  WHERE s.status='DELIVERED' AND s.delivered_at BETWEEN :start AND :end
),
stock AS (
  SELECT
    SUM(CASE WHEN il.occurred_at < :start THEN il.quantity_delta ELSE 0 END) AS opening,
    SUM(CASE WHEN il.occurred_at < :end   THEN il.quantity_delta ELSE 0 END) AS closing
  FROM inventory_ledger il
)
SELECT sold.units / NULLIF((stock.opening + stock.closing) / 2.0, 0)
         * (365.0 / :days_in_period) AS annualised_turnover
FROM sold, stock;
```

**Alert:** Warning < 3× · OK 3–8× · Watch > 8×  
**Dashboard:** Inventory Dashboard → Turnover Panel

---

### E-03: Days of Inventory Remaining
**Priority:** P1 | **Refresh:** Daily | **Source:** `inventory_forecasts WHERE is_current = true`

```sql
SELECT pv.sku, pv.size, p.name,
       inf.current_stock, inf.daily_velocity_30d,
       inf.days_to_stockout_30d, inf.projected_stockout_date, inf.alert_level
FROM inventory_forecasts inf
JOIN product_variants pv ON pv.id = inf.variant_id
JOIN products p ON p.id = pv.product_id
WHERE inf.is_current = true
ORDER BY
  CASE inf.alert_level WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 WHEN 'watch' THEN 3 ELSE 4 END,
  inf.days_to_stockout_30d ASC NULLS LAST;
```

**Alert:** Critical < 14 days · Warning 14–30 · Watch 30–60 · OK > 60  
**Dashboard:** Inventory Dashboard → Stock Status table (P1 row)

---

### E-04: Dead Stock %
**Priority:** P2 | **Refresh:** Weekly

**Formula:** `COUNT(variants with stock > 0 AND zero deliveries in 60 days) / COUNT(variants with stock > 0)`

```sql
WITH active AS (
  SELECT variant_id FROM inventory_ledger GROUP BY variant_id HAVING SUM(quantity_delta) > 0
),
recent AS (
  SELECT ol.variant_id
  FROM order_lines ol JOIN shipments s ON s.order_id = ol.order_id
  WHERE s.status='DELIVERED' AND s.delivered_at >= CURRENT_DATE - 60
  GROUP BY ol.variant_id
)
SELECT
  COUNT(*) AS total_active_variants,
  COUNT(CASE WHEN a.variant_id NOT IN (SELECT variant_id FROM recent) THEN 1 END) AS dead_stock_variants,
  COUNT(CASE WHEN a.variant_id NOT IN (SELECT variant_id FROM recent) THEN 1 END) * 100.0
    / NULLIF(COUNT(*), 0) AS dead_stock_pct
FROM active a;
```

**Alert:** Warning > 20% · Watch 10–20% · OK < 10%  
**Dashboard:** Inventory Dashboard → Dead Stock Alert Panel

---

### E-05: Stock Cover Days (Collection Level)
**Priority:** P1 | **Refresh:** Daily | **Source:** `inventory_forecasts WHERE is_current = true`

```sql
SELECT l.code, l.name,
       SUM(inf.current_stock) AS total_stock,
       SUM(inf.daily_velocity_30d) AS total_velocity,
       SUM(inf.current_stock) / NULLIF(SUM(inf.daily_velocity_30d), 0) AS cover_days
FROM inventory_forecasts inf
JOIN product_variants pv ON pv.id = inf.variant_id
JOIN products p ON p.id = pv.product_id
JOIN launches l ON l.id = p.launch_id
WHERE inf.is_current = true AND inf.current_stock > 0
GROUP BY l.id, l.code, l.name
ORDER BY cover_days ASC NULLS LAST;
```

**Alert:** Critical < 30 days · Warning 30–60 · Watch 60–90 · OK > 90  
**Dashboard:** Inventory Dashboard → Collection Cover Days

---

### E-06: Reorder Quantity
**Priority:** P2 | **Refresh:** Daily | **Source:** `inventory_forecasts WHERE is_current = true AND reorder_recommended = true`

```sql
SELECT pv.sku, pv.size, p.name,
       inf.current_stock, inf.daily_velocity_30d,
       inf.units_to_reorder, inf.projected_stockout_date, inf.alert_level
FROM inventory_forecasts inf
JOIN product_variants pv ON pv.id = inf.variant_id
JOIN products p ON p.id = pv.product_id
WHERE inf.is_current = true AND inf.reorder_recommended = true
ORDER BY
  CASE inf.alert_level WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
  inf.days_to_stockout_30d;
```

**Formula:** `units_to_reorder = MAX(0, daily_velocity_30d × 90 − current_stock)`  
**Dashboard:** Inventory Dashboard → Reorder Alerts Panel

---

## Group F: Marketing KPIs (5 KPIs)

All F-group KPIs depend on `ad_spend_daily` being populated.

---

### F-01: ROAS
**Priority:** P2 | **Refresh:** Monthly | **Snapshot:** `kpi_monthly_snapshot.roas`

**Formula:** `Net Revenue / SUM(ad_spend_daily.spend_inr)`

```sql
SELECT
  :net_revenue_inr / NULLIF(SUM(spend_inr), 0) AS roas
FROM ad_spend_daily
WHERE spend_date BETWEEN :start AND :end;
```

**Alert:** Critical < 1× · Warning 1–2× · Watch 2–3× · OK ≥ 3×  
**Dashboard:** Marketing Dashboard → ROAS Card

---

### F-02: Marketing Efficiency Ratio (MER)
**Priority:** P3 | **Refresh:** Monthly

**Formula:** `Gross Revenue / SUM(ad_spend_daily.total_inr)` (uses total_inr including GST)

```sql
SELECT :gross_revenue_inr / NULLIF(SUM(total_inr), 0) AS mer
FROM ad_spend_daily WHERE spend_date BETWEEN :start AND :end;
```

**Alert:** Warning MER < 3× · OK ≥ 3×  
**Dashboard:** Marketing Dashboard → MER Panel

---

### F-03: Customer Acquisition Cost (CAC)
**Priority:** P2 | **Refresh:** Monthly

**Formula:** `SUM(ad_spend_inr) / COUNT(new customers with delivered order in period)`

```sql
WITH new_cust AS (
  SELECT COUNT(DISTINCT c.id) AS n
  FROM customers c
  JOIN orders o ON o.customer_id = c.id
  JOIN shipments s ON s.order_id = o.id
  WHERE s.status = 'DELIVERED'
    AND c.first_order_at BETWEEN :start AND :end
),
spend AS (SELECT COALESCE(SUM(spend_inr), 0) AS total FROM ad_spend_daily WHERE spend_date BETWEEN :start AND :end)
SELECT spend.total / NULLIF(new_cust.n, 0) AS cac_inr
FROM new_cust, spend;
```

**Alert:** Critical CAC > AOV · Warning CAC > 50% of CM per first order · OK CAC < 30% of AOV  
**Dashboard:** Marketing Dashboard → CAC Card

---

### F-04: Customer LTV
**Priority:** P3 | **Refresh:** Monthly | **Snapshot:** `mv_customer_ltv` (materialized view)

**Formula:** `AVG(customers.total_revenue_inr)` and median for customers with ≥ 1 delivered order

```sql
SELECT
  AVG(c.total_revenue_inr) AS avg_ltv_inr,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY c.total_revenue_inr) AS median_ltv_inr,
  COUNT(*) AS customer_count
FROM customers c
WHERE c.total_orders >= 1 AND c.total_revenue_inr > 0;
```

**Dashboard:** Marketing Dashboard → LTV Panel

---

### F-05: Repeat Purchase Rate
**Priority:** P2 | **Refresh:** Monthly

**Formula:** `COUNT(customers with ≥ 2 delivered orders) / COUNT(customers with ≥ 1) × 100`

```sql
SELECT
  COUNT(CASE WHEN total_orders >= 2 THEN 1 END) * 100.0
  / NULLIF(COUNT(CASE WHEN total_orders >= 1 THEN 1 END), 0) AS repeat_purchase_rate_pct
FROM customers;
```

**Note:** Use `total_orders` denormalised field for speed, but validate against actual delivered order counts for accuracy.  
**Alert:** Watch < 10% · OK 10–25% · Good > 25%  
**Dashboard:** Marketing Dashboard → Retention Panel

---

## Group G: Finance KPIs (6 KPIs)

---

### G-01: Cash Inflow
**Priority:** P1 | **Refresh:** Daily | **Snapshot:** `kpi_daily_snapshot.cash_deposited_inr`

**Formula:** `SUM(deposit_inr)` for `transaction_type IN ('gateway_settlement','cod_remittance')`

```sql
SELECT SUM(deposit_inr) AS cash_inflow_inr
FROM bank_transactions
WHERE transaction_type IN ('gateway_settlement', 'cod_remittance')
  AND transaction_date BETWEEN :start AND :end;
```

**Dashboard:** Finance Dashboard → Cash Inflow Card

---

### G-02: Cash Outflow
**Priority:** P1 | **Refresh:** Daily | **Snapshot:** `kpi_daily_snapshot.cash_withdrawn_inr`

**Formula:** `SUM(withdrawal_inr)` for operational transaction types (excludes founder transfers and supplier capex)

```sql
SELECT SUM(withdrawal_inr) AS cash_outflow_inr
FROM bank_transactions
WHERE transaction_type IN (
  'shiprocket_recharge', 'courier_payment', 'ad_spend_meta', 'ad_spend_google',
  'saas_subscription', 'customer_refund', 'bank_charge'
)
AND transaction_date BETWEEN :start AND :end;
```

**Dashboard:** Finance Dashboard → Cash Outflow Card

---

### G-03: Net Cash Flow
**Priority:** P1 | **Refresh:** Daily

**Formula:** `G-01 Cash Inflow − G-02 Cash Outflow`

```sql
-- Computed from G-01 and G-02 results
SELECT :cash_inflow_inr - :cash_outflow_inr AS net_cash_flow_inr;
```

**Alert:** Critical NCF < 0 AND bank balance < ₹1,00,000 · Warning NCF < 0 for 2+ months  
**Dashboard:** Finance Dashboard → Net Cash Flow Card / Waterfall

---

### G-04: Monthly Burn Rate
**Priority:** P2 | **Refresh:** Monthly

**Formula:** `AVG(monthly Cash Outflow, last 3 complete months)`

```sql
SELECT AVG(monthly_outflow) AS avg_monthly_burn_inr
FROM (
  SELECT DATE_TRUNC('month', transaction_date) AS month, SUM(withdrawal_inr) AS monthly_outflow
  FROM bank_transactions
  WHERE transaction_type IN (
    'shiprocket_recharge','courier_payment','ad_spend_meta','ad_spend_google',
    'saas_subscription','customer_refund','bank_charge'
  )
  AND transaction_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '3 months'
  AND transaction_date <  DATE_TRUNC('month', CURRENT_DATE)
  GROUP BY 1
) m;
```

**Dashboard:** Finance Dashboard → Burn Rate Panel

---

### G-05: Cash Runway
**Priority:** P2 | **Refresh:** Monthly

**Formula:** `Net Cash Position (A-06) / Monthly Burn Rate (G-04)`

```sql
SELECT :net_cash_position / NULLIF(:monthly_burn_rate, 0) AS runway_months;
```

**Alert:** Critical < 2 months · Warning 2–4 months · OK > 4 months  
**Dashboard:** Finance Dashboard → Runway Panel

---

### G-06: COD Outstanding
**Priority:** P1 | **Refresh:** Daily

**Formula:** `SUM(cod_payable_inr)` for DELIVERED COD shipments with no matched bank remittance

```sql
SELECT SUM(s.cod_payable_inr) AS cod_outstanding_inr
FROM shipments s
WHERE s.payment_method = 'cod'
  AND s.status = 'DELIVERED'
  AND (
    s.cod_crf_id IS NULL
    OR s.cod_crf_id NOT IN (
      SELECT extracted_reference FROM bank_transactions
      WHERE transaction_type = 'cod_remittance'
        AND extracted_reference IS NOT NULL
    )
  );
```

**Alert:** Watch COD Outstanding > ₹50,000 AND bank balance < ₹2,00,000  
**Dashboard:** Finance Dashboard → COD Outstanding Card (alongside Cash Position)

---

## Group H: Forecast KPIs (4 KPIs)

All H-group KPIs read from pre-computed forecast tables populated by the Phase 2 Python forecast engine.

---

### H-01: Revenue Forecast (LA-WMA)
**Priority:** P1 | **Refresh:** Nightly | **Source:** `revenue_forecasts WHERE is_current = true`

```sql
SELECT rf.forecast_month, l.name AS launch,
       rf.forecast_revenue_inr,
       rf.confidence_low_inr, rf.confidence_high_inr,
       rf.launch_phase_factor, rf.stock_availability_factor
FROM revenue_forecasts rf
JOIN launches l ON l.id = rf.launch_id
WHERE rf.is_current = true
  AND rf.forecast_month >= DATE_TRUNC('month', CURRENT_DATE)
ORDER BY rf.forecast_month, l.code;
```

**Forecast model:** WMA(3 months, weights 3/6, 2/6, 1/6) × launch_phase_factor × stock_availability_factor × seasonality  
**Alert:** Watch forecast < ₹30,000/month  
**Dashboard:** Forecast Dashboard → Revenue Forecast Panel (3-month horizon)

---

### H-02: Cash Forecast
**Priority:** P1 | **Refresh:** Nightly | **Source:** `cashflow_forecasts WHERE is_current = true`

```sql
SELECT cf.forecast_month,
       cf.opening_balance_inr, cf.expected_total_inflow_inr,
       cf.expected_total_outflow_inr, cf.expected_closing_balance_inr,
       cf.actual_closing_balance_inr
FROM cashflow_forecasts cf
WHERE cf.is_current = true
  AND cf.forecast_month >= DATE_TRUNC('month', CURRENT_DATE)
ORDER BY cf.forecast_month;
```

**Alert:** Critical expected_closing_balance < 0 · Warning < ₹50,000 · Watch < ₹1,50,000 (L4 deposit threshold)  
**Dashboard:** Finance Dashboard → Cash Forecast Panel

---

### H-03: Inventory Depletion Forecast
**Priority:** P1 | **Refresh:** Daily | **Source:** `inventory_forecasts WHERE is_current = true`

Same query as E-03 — both E-03 and H-03 read from inventory_forecasts. H-03 displays on the Forecast dashboard; E-03 displays on the Inventory dashboard.

**Dashboard:** Forecast Dashboard → Inventory Depletion Panel; critical alerts surfaced on Executive Dashboard

---

### H-04: Forecast Accuracy
**Priority:** P2 | **Refresh:** Monthly | **Source:** `revenue_forecasts WHERE actual_revenue_inr IS NOT NULL`

**Formula:** `1 − |actual − forecast| / actual × 100` per closed month

```sql
SELECT rf.forecast_month, l.name,
       rf.forecast_revenue_inr, rf.actual_revenue_inr,
       rf.forecast_accuracy_pct
FROM revenue_forecasts rf
JOIN launches l ON l.id = rf.launch_id
WHERE rf.actual_revenue_inr IS NOT NULL
ORDER BY rf.forecast_month DESC, l.code;
```

**Blended accuracy:** `AVG(forecast_accuracy_pct)` across all closed months where actual > 0  
**Alert:** Critical blended accuracy < 50% · Warning 50–70% · OK ≥ 70% · Excellent ≥ 85%  
**Dashboard:** Forecast Dashboard → Model Performance Panel

---

## KPI Dashboard Routing

| Dashboard | KPIs | Refresh |
|-----------|------|---------|
| Executive | A-01..A-06 · E-03 (alert) · H-03 (alert) | Daily |
| Sales | B-01..B-06 | Daily/Weekly |
| Operations | C-01..C-07 | Weekly |
| Profitability | D-01..D-05 | Weekly/Monthly |
| Inventory | E-01..E-06 | Daily/Weekly |
| Marketing | F-01..F-05 | Monthly |
| Finance | G-01..G-06 · H-02 | Daily |
| Forecast | H-01..H-04 | Nightly |
| Admin | import_runs · import_errors | Real-time |

---

## KPI Dependency Map

```
inventory_batches  ──► inventory_ledger  ──► inventory_forecasts  ──► E-03, E-05, E-06, H-03
                                          └──► E-01, E-02, E-04

order_lines.variant_id (post-seed UPDATE) ──► D-04, B-05, D-01, D-02

launch_expenses  ──► launches.total_investment_inr  ──► D-05

ad_spend_daily   ──► D-02 (CM%), F-01 (ROAS), F-02 (MER), F-03 (CAC)

expenses         ──► D-03 (Net Margin), G-02 (Cash Outflow), G-04 (Burn Rate)

bank_transactions (2023-25) ──► historical G-group accuracy

kpi_daily_snapshot  ──► A-01..A-06, G-01..G-03, B-01..B-03 (daily view)
kpi_monthly_snapshot ──► A-01..A-04, B-01..B-06, D-01..D-02, F-01
revenue_forecasts   ──► H-01, H-04
cashflow_forecasts  ──► H-02, G-05
inventory_forecasts ──► E-03, E-05, E-06, H-03
```
