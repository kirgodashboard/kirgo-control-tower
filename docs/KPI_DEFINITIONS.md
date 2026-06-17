# Kirgo Control Tower — KPI Definitions
**Version:** v2.0 | **Date:** 2026-06-17
**Schema Reference:** DATABASE_SCHEMA.md v2 | **Data Reference:** DATA_DICTIONARY.md v2.1
**Currency:** INR throughout unless stated

---

## KPI Index

| ID | KPI Name | Group | Priority | Refresh |
|----|----------|-------|----------|---------|
| A-01 | Monthly Gross Revenue | Executive | P1 | Daily |
| A-02 | Net Revenue | Executive | P1 | Daily |
| A-03 | Orders Delivered | Executive | P1 | Daily |
| A-04 | Average Order Value (AOV) | Executive | P1 | Daily |
| A-05 | Active Customers (30-Day) | Executive | P2 | Daily |
| A-06 | Net Cash Position | Executive | P1 | Daily |
| B-01 | Gross Revenue | Sales | P1 | Daily |
| B-02 | Net Revenue | Sales | P1 | Daily |
| B-03 | Units Sold | Sales | P2 | Daily |
| B-04 | Revenue by Launch | Sales | P1 | Daily |
| B-05 | Revenue by Product | Sales | P2 | Weekly |
| B-06 | Revenue by State | Sales | P3 | Weekly |
| C-01 | Return Rate % | Return & Logistics | P2 | Weekly |
| C-02 | Return Value | Return & Logistics | P2 | Weekly |
| C-03 | RTO Rate % | Return & Logistics | P2 | Weekly |
| C-04 | RTO Value | Return & Logistics | P2 | Weekly |
| C-05 | Delivery Success Rate % | Return & Logistics | P2 | Weekly |
| C-06 | Average Delivery Days | Return & Logistics | P3 | Weekly |
| C-07 | Courier Performance Score | Return & Logistics | P3 | Weekly |
| D-01 | Blended Gross Margin % | Profitability | P1 | Weekly |
| D-02 | Contribution Margin % | Profitability | P1 | Monthly |
| D-03 | Net Margin % | Profitability | P2 | Monthly |
| D-04 | Product Profitability | Profitability | P2 | Weekly |
| D-05 | Launch Profitability | Profitability | P1 | Per Launch |
| E-01 | Inventory Value at Cost | Inventory | P1 | Real-time |
| E-02 | Inventory Turnover (Annualised) | Inventory | P3 | Monthly |
| E-03 | Days of Inventory Remaining | Inventory | P1 | Daily |
| E-04 | Dead Stock % | Inventory | P2 | Weekly |
| E-05 | Stock Cover Days (Collection) | Inventory | P1 | Daily |
| E-06 | Reorder Quantity | Inventory | P1 | Daily |
| F-01 | Return on Ad Spend (ROAS) | Marketing | P2 | Monthly |
| F-02 | Marketing Efficiency Ratio (MER) | Marketing | P3 | Monthly |
| F-03 | Customer Acquisition Cost (CAC) | Marketing | P2 | Monthly |
| F-04 | Customer Lifetime Value (LTV) | Marketing | P3 | Monthly |
| F-05 | Repeat Purchase Rate | Marketing | P2 | Monthly |
| G-01 | Cash Inflow | Finance | P1 | Daily |
| G-02 | Cash Outflow | Finance | P1 | Daily |
| G-03 | Net Cash Flow | Finance | P1 | Daily |
| G-04 | Monthly Burn Rate | Finance | P2 | Monthly |
| G-05 | Cash Runway | Finance | P2 | Monthly |
| G-06 | COD Outstanding | Finance | P1 | Daily |
| H-01 | Revenue Forecast (LA-WMA) | Forecast | P1 | On Demand / Nightly |
| H-02 | Cash Forecast | Forecast | P1 | On Demand / Nightly |
| H-03 | Inventory Depletion Forecast | Forecast | P1 | Daily |
| H-04 | Forecast Accuracy | Forecast | P2 | Monthly |

---

## Legend

**Priority Levels:**
- P1 — Mission-critical. Drives immediate decisions. Must be accurate within 24 hours of data import.
- P2 — Operational. Reviewed weekly. T+2 data latency acceptable.
- P3 — Strategic. Reviewed monthly. Used for trend analysis and planning.

**Refresh Frequency:**
- Real-time — Updated on every `inventory_ledger` insert (stock movements).
- Daily — Recomputed nightly from `kpi_daily_snapshot` after data import.
- Weekly — Computed from closed-week data for operational dashboards.
- Monthly — Computed after month close for P&L and marketing dashboards.
- On Demand — Triggered manually by analyst; result stored in the relevant forecasts table.
- Per Launch — Computed at launch, updated monthly until depletion.

**SQL Pseudocode Convention:** All SQL in this document is analytical pseudocode. Table and column names match `DATABASE_SCHEMA.md v2` exactly. None of this is executable code or a migration — it describes computation logic for the implementation team.

**Revenue Recognition:** All revenue KPIs use delivery date as the recognition date (BR-REV-01). A sale is recognised when `shipments.status = 'DELIVERED'` and `shipments.delivered_at IS NOT NULL`.

**De-duplication Rule:** Always count orders as `COUNT(DISTINCT orders.woocommerce_order_id)`. Never count `shipments` rows directly for order volume — a multi-item order produces multiple Shiprocket rows sharing one `shiprocket_order_id` (BR-DQ-01).

**Source of Record:** WooCommerce is the authoritative source for all order and revenue data (BR-DQ-02). The `Monthly Revenue` sheet in Kirgo Numbers.xlsx must not be used for reconciliation — it contains known errors (BR-DQ-03).

---

## Group A: Executive KPIs

---

### A-01: Monthly Gross Revenue

**Business Definition:** Total INR value of all delivered order lines in the calendar month. Recognises revenue at the point of delivery, not order placement.

**Purpose:** Primary top-line indicator of business health. Tracks the launch-decay revenue curve and signals when a new launch is needed.

**Formula:**
```
Monthly Gross Revenue = SUM(order_lines.line_total_inr)
  WHERE shipments.status = 'DELIVERED'
    AND shipments.delivered_at BETWEEN [month_start] AND [month_end]
```

**SQL Logic (Pseudocode):**
```
-- Preferred: read from pre-computed snapshot
SELECT gross_revenue_inr
FROM kpi_monthly_snapshot
WHERE snapshot_month = :month AND launch_id IS NULL

-- Raw computation (for validation)
SELECT SUM(ol.line_total_inr)
FROM order_lines ol
JOIN shipments s ON s.order_id = ol.order_id
WHERE s.status = 'DELIVERED'
  AND s.delivered_at >= :month_start AND s.delivered_at < :month_end
```

**Source Tables:** `order_lines`, `shipments`, `kpi_monthly_snapshot` (pre-computed)

**Refresh Frequency:** Daily (from `kpi_monthly_snapshot`); raw tables recomputed nightly

**Dashboard Location:** Executive Dashboard → Revenue Card (top row, left)

**Alert Thresholds:**
| Level | Condition | Action |
|-------|-----------|--------|
| Critical | < ₹20,000 / month | Check for import failures; verify Shiprocket data is current |
| Warning | < ₹50,000 / month | Review inventory levels; check if active collections are depleted |
| Watch | ₹50,000–₹80,000 / month | Monitor trend direction |
| OK | ≥ ₹80,000 / month | Core collection performing at launch-phase pace |

**Drill-down Capability:**
- By day (daily delivery curve)
- By collection / launch_id
- By payment method (prepaid vs COD split)
- By billing state
- vs prior month (MoM growth %)
- vs same month prior year (YoY)

**Reconciliation Notes / Exclusions / Edge Cases:**
- Shipping fees collected from customers (`orders.shipping_charged_inr`) are excluded — outbound shipping is net-neutral per BR-REV-04.
- For multi-item orders: revenue = SUM of all `order_lines` rows for that order. The `shipments.order_total_inr` column is duplicated across Shiprocket rows for the same order — do not sum it directly.
- Historical benchmarks: Oct 2023 ₹29k (L1 launch) → Feb 2024 ₹97k (peak) → avg ~₹28k/month mid-2024 → Jan 2026 ₹69k (L3 launch) → Feb 2026 ₹98k (new peak).
- Edge case: orders placed in month N but delivered in month N+1 count as month N+1 revenue.

---

### A-02: Net Revenue

**Business Definition:** Gross Revenue minus customer refunds that have been processed and minus order-level promotional discounts applied at checkout.

**Purpose:** The primary P&L line. Used for contribution margin, ROAS, and financial reporting. Gross Revenue inflated by returns would overstate business performance.

**Formula:**
```
Net Revenue = Gross Revenue
            − SUM(returns.refund_amount_inr WHERE refund_status = 'processed')
            − SUM(orders.discount_inr)
```

**SQL Logic (Pseudocode):**
```
-- Gross revenue for period
gross = SUM(ol.line_total_inr) FROM order_lines + shipments WHERE DELIVERED in period

-- Refunds processed in period (use refund processed date, not return date)
refunds = SUM(r.refund_amount_inr)
  FROM returns r
  WHERE r.refund_status = 'processed'
    AND r.returned_at >= :period_start AND r.returned_at < :period_end

-- Discounts on delivered orders in period
discounts = SUM(o.discount_inr)
  FROM orders o JOIN shipments s ON s.order_id = o.id
  WHERE s.status = 'DELIVERED' AND s.delivered_at IN period

Net Revenue = gross - refunds - discounts
```

**Source Tables:** `order_lines`, `shipments`, `returns`, `orders`, `kpi_monthly_snapshot`

**Refresh Frequency:** Daily

**Dashboard Location:** Executive Dashboard → Revenue Card (top row, second tile)

**Alert Thresholds:**
| Level | Condition | Action |
|-------|-----------|--------|
| Warning | Net Revenue < 90% of Gross Revenue | Investigate spike in returns or refund processing |
| OK | Net Revenue ≥ 90% of Gross Revenue | Normal refund rate |

**Drill-down Capability:**
- Gross vs Net waterfall chart
- Refund amount by month
- Discount amount by month
- Return rate contribution

**Reconciliation Notes / Exclusions / Edge Cases:**
- RTO costs (two-way freight) are NOT deducted here — they reduce Contribution Margin, not Net Revenue. RTOs are a logistics cost, not a revenue reversal.
- Shipping collected from customer (`shipping_charged_inr`) is NOT deducted — it is already excluded from Gross Revenue (BR-REV-04).
- Only `refund_status = 'processed'` refunds are deducted. Pending refunds are tracked separately.
- Edge case: refund processed in a different month from the original sale — deduct in the month the refund is processed, not the month of sale.

---

### A-03: Orders Delivered

**Business Definition:** Count of distinct WooCommerce orders where at least one shipment reached `DELIVERED` status in the period.

**Purpose:** Volume metric. Paired with AOV to explain revenue movements. A revenue increase is more sustainable if driven by more orders than by AOV alone.

**Formula:**
```
Orders Delivered = COUNT(DISTINCT orders.woocommerce_order_id)
  WHERE shipments.status = 'DELIVERED'
    AND shipments.delivered_at IN [period]
```

**SQL Logic (Pseudocode):**
```
SELECT COUNT(DISTINCT o.woocommerce_order_id)
FROM orders o
JOIN shipments s ON s.order_id = o.id
WHERE s.status = 'DELIVERED'
  AND s.delivered_at >= :period_start AND s.delivered_at < :period_end
```

**Source Tables:** `orders`, `shipments`, `kpi_daily_snapshot` (orders_delivered column)

**Refresh Frequency:** Daily

**Dashboard Location:** Executive Dashboard → Orders Card (top row)

**Alert Thresholds:**
| Level | Condition | Action |
|-------|-----------|--------|
| Critical | < 5 orders / month | Check shipment data import; verify no outage |
| Warning | < 15 orders / month | Low velocity — inventory or demand issue |
| Watch | 15–25 orders / month | Below L3 Core launch pace (BR-FORE-03: min viable = 20/month) |
| OK | ≥ 25 orders / month | Healthy collection velocity |

**Drill-down Capability:**
- By day (delivery cadence chart)
- By collection
- By payment method (COD vs prepaid mix)
- By courier
- Orders placed vs orders delivered gap (pipeline lag)

**Reconciliation Notes / Exclusions / Edge Cases:**
- Count `DISTINCT woocommerce_order_id`, not shipment rows. A 2-item order = 1 order.
- An order with both a delivered item and an RTO item still counts as delivered (partially fulfilled).
- Cancelled orders and RTO-only orders are excluded.
- Historical range: 7–34 orders/month (see BR-FORE-03).

---

### A-04: Average Order Value (AOV)

**Business Definition:** Gross Revenue divided by the count of distinct delivered orders in the period. Measures the average spend per transaction.

**Purpose:** Tracks the effect of product mix shifts (bundles vs individual items), collection pricing, and discount depth. A rising AOV signals that customers are buying higher-priced items or bundles.

**Formula:**
```
AOV = Gross Revenue / Orders Delivered
```

**SQL Logic (Pseudocode):**
```
SELECT kms.gross_revenue_inr / NULLIF(kms.orders_delivered, 0) AS aov
FROM kpi_monthly_snapshot kms
WHERE snapshot_month = :month AND launch_id IS NULL
```

**Source Tables:** `kpi_monthly_snapshot`, `order_lines`, `shipments`

**Refresh Frequency:** Daily

**Dashboard Location:** Executive Dashboard → AOV Card (top row)

**Alert Thresholds:**
| Level | Condition | Action |
|-------|-----------|--------|
| Warning | AOV < ₹1,500 | Investigate — may indicate Classic-era inventory clearing or heavy discounting |
| Watch | ₹1,500–₹2,500 | Summer/Classic mix era; monitor for Core mix uplift |
| OK | ≥ ₹2,500 | Core collection price point performing; consistent with L3 (₹3,013 Jan 2026) |

**Drill-down Capability:**
- AOV by collection
- AOV trend over 12 months
- AOV by payment method (COD vs prepaid — COD customers may order more conservatively)
- AOV by state
- AOV vs bundle attach rate

**Reconciliation Notes / Exclusions / Edge Cases:**
- NULL when Orders Delivered = 0 in the period.
- Shipping charged to customer is included in `order_total_inr` but excluded from `line_total_inr` (which is what Gross Revenue uses). AOV therefore reflects product value, not including shipping.
- Benchmarks by era: Classic/Summer era ₹1,700–₹2,100; Core launch Jan 2026 ₹3,013.
- A spike in AOV from bundles (Set products) does not mean proportionally higher margin — set COGS = component COGS + ₹75 packaging (BR-GM-03).

---

### A-05: Active Customers (30-Day)

**Business Definition:** Count of distinct customers who had at least one order delivered in the rolling last 30 days.

**Purpose:** Measures current demand breadth. Distinguishes between revenue driven by many customers vs a few repeat buyers. Critical for identifying customer concentration risk.

**Formula:**
```
Active Customers (30D) = COUNT(DISTINCT orders.customer_id)
  WHERE shipments.status = 'DELIVERED'
    AND shipments.delivered_at >= [today − 30 days]
```

**SQL Logic (Pseudocode):**
```
SELECT COUNT(DISTINCT o.customer_id)
FROM orders o
JOIN shipments s ON s.order_id = o.id
WHERE s.status = 'DELIVERED'
  AND s.delivered_at >= CURRENT_DATE - INTERVAL '30 days'
```

**Source Tables:** `orders`, `shipments`, `customers`

**Refresh Frequency:** Daily

**Dashboard Location:** Executive Dashboard → Customers Card

**Alert Thresholds:**
| Level | Condition | Action |
|-------|-----------|--------|
| Watch | < 10 active customers / 30 days | Very low demand breadth; check if period coincides with post-launch decay |
| OK | ≥ 20 active customers / 30 days | Consistent with minimum viable velocity (BR-FORE-03) |

**Drill-down Capability:**
- New vs returning customers split
- Active customers trend (rolling 30-day over 12 months)
- Customers by acquisition source (utm_source)
- Customers by state

**Reconciliation Notes / Exclusions / Edge Cases:**
- Based on delivery date, not order date — a customer who ordered 35 days ago but received delivery today is counted as active.
- Customers with only cancelled or RTO orders are excluded.
- Does not distinguish order volume per customer — one customer with 3 delivered orders = 1 active customer.

---

### A-06: Net Cash Position

**Business Definition:** The current balance in the Kirgo HDFC business account, taken from the most recent bank statement entry.

**Purpose:** Single most important liquidity metric. Determines whether Kirgo can fund the next supplier instalment, ad spend, or operational expense without a capital injection.

**Formula:**
```
Net Cash Position = MAX(bank_transactions.closing_balance_inr)
  WHERE transaction_date = (SELECT MAX(transaction_date) FROM bank_transactions)
```

**SQL Logic (Pseudocode):**
```
SELECT closing_balance_inr
FROM bank_transactions
ORDER BY transaction_date DESC, id DESC
LIMIT 1
```

**Source Tables:** `bank_transactions`, `kpi_daily_snapshot` (closing_bank_balance_inr)

**Refresh Frequency:** Daily (after bank statement import)

**Dashboard Location:** Executive Dashboard → Cash Position Card (top row, right)

**Alert Thresholds:**
| Level | Condition | Action |
|-------|-----------|--------|
| Critical | < ₹50,000 | Immediate action — insufficient for next Shiprocket recharge + SaaS cycle |
| Warning | < ₹1,50,000 | Below 1× average monthly COGS; reduce ad spend; defer non-essential outflows |
| Watch | ₹1,50,000–₹3,00,000 | Monitor closely if L4 supplier deposit is imminent (~₹1,50,000) |
| OK | > ₹3,00,000 | Adequate for 1–2 months of operations without revenue |

**Drill-down Capability:**
- 30-day and 90-day cash trend chart
- Inflow vs outflow waterfall
- Days since last bank import (data freshness indicator)
- Cash vs COD Outstanding (settlement lag visibility)

**Reconciliation Notes / Exclusions / Edge Cases:**
- This is bank balance only. It does NOT include COD amounts in transit (yet to be remitted by Shiprocket).
- Founder transfer credits (personal injections) inflate this balance — they should be tagged in `bank_transactions.transaction_type = 'founder_transfer'` and can be filtered out for "pure business cash" view.
- Bank data is currently available only for Jan–Jun 2026 (HDFC statement period). Older balances are not tracked.
- Minimum healthy balance benchmark: ≥ 1× average monthly COGS.

---

## Group B: Sales KPIs

---

### B-01: Gross Revenue

**Business Definition:** Total INR value of delivered order lines for a configurable time period. Identical calculation to A-01 but exposed with full filtering and drill-down capabilities in the Sales module.

**Purpose:** The primary analytical revenue view. Unlike the Executive Card (fixed monthly), this KPI supports date-range selection, collection filters, and per-SKU breakdowns.

**Formula:**
```
Gross Revenue = SUM(order_lines.line_total_inr)
  WHERE shipments.status = 'DELIVERED'
    AND shipments.delivered_at BETWEEN [start_date] AND [end_date]
    [AND products.launch_id = :launch_id]        -- optional filter
    [AND order_lines.variant_id = :variant_id]   -- optional filter
```

**SQL Logic (Pseudocode):**
```
SELECT SUM(ol.line_total_inr)
FROM order_lines ol
JOIN orders o ON o.id = ol.order_id
JOIN shipments s ON s.order_id = o.id
JOIN product_variants pv ON pv.id = ol.variant_id
JOIN products p ON p.id = pv.product_id
WHERE s.status = 'DELIVERED'
  AND s.delivered_at BETWEEN :start AND :end
  AND (:launch_id IS NULL OR p.launch_id = :launch_id)
```

**Source Tables:** `order_lines`, `orders`, `shipments`, `product_variants`, `products`

**Refresh Frequency:** Daily

**Dashboard Location:** Sales Dashboard → Revenue Panel (configurable date picker)

**Alert Thresholds:** Same as A-01; not repeated here.

**Drill-down Capability:**
- Daily revenue bars (trend chart)
- By collection (launch_id)
- By product variant (SKU)
- By payment method
- By state
- WoW / MoM / YoY comparison
- Daily average revenue in period

**Reconciliation Notes / Exclusions / Edge Cases:**
- Same exclusions as A-01: no shipping fees, revenue at delivery date.
- When comparing against kpi_monthly_snapshot for validation, both should match within ±₹1 rounding.
- For WTD/MTD views: compare against the same WTD/MTD in the prior period for apples-to-apples.

---

### B-02: Net Revenue

**Business Definition:** Gross Revenue minus processed refunds and order discounts for the selected period. The configurable-period version of A-02.

**Purpose:** Analytical sales metric. Used in the Sales module to compute ROAS, contribution margin, and period-level P&L. Always prefer Net Revenue over Gross Revenue when computing unit economics.

**Formula:**
```
Net Revenue = Gross Revenue − Refunds Processed in Period − Discounts on Delivered Orders
```

**SQL Logic (Pseudocode):**
```
-- Same as A-02 but with configurable date range
gross = SUM(ol.line_total_inr) WHERE DELIVERED in [:start, :end]
refunds = SUM(r.refund_amount_inr) WHERE refund_status='processed' AND returned_at IN [:start, :end]
discounts = SUM(o.discount_inr) WHERE o.id IN (delivered orders in period)
Net Revenue = gross - refunds - discounts
```

**Source Tables:** `order_lines`, `shipments`, `returns`, `orders`

**Refresh Frequency:** Daily

**Dashboard Location:** Sales Dashboard → Net Revenue Panel

**Alert Thresholds:**
| Level | Condition | Action |
|-------|-----------|--------|
| Warning | Net < 90% of Gross | Investigate returns spike |
| OK | Net ≥ 90% of Gross | Normal |

**Drill-down Capability:** Same as B-01 plus refund breakdown by product and by reason.

**Reconciliation Notes / Exclusions / Edge Cases:** Same as A-02.

---

### B-03: Units Sold

**Business Definition:** Total number of individual garment units delivered to customers in the period. One order for a set (leggings + bra bundle) counts as 1 unit (the bundle variant), not 2 garments.

**Purpose:** Volume complement to revenue. Tracks demand at the unit level, powers average unit price and COGS calculations, and feeds inventory depletion modelling.

**Formula:**
```
Units Sold = SUM(order_lines.quantity)
  WHERE shipments.status = 'DELIVERED'
    AND shipments.delivered_at BETWEEN [start] AND [end]
```

**SQL Logic (Pseudocode):**
```
SELECT SUM(ol.quantity)
FROM order_lines ol
JOIN shipments s ON s.order_id = ol.order_id
WHERE s.status = 'DELIVERED'
  AND s.delivered_at BETWEEN :start AND :end
```

**Source Tables:** `order_lines`, `shipments`, `kpi_daily_snapshot` (units_sold column)

**Refresh Frequency:** Daily

**Dashboard Location:** Sales Dashboard → Units Panel

**Alert Thresholds:** No fixed threshold — monitor as trend vs prior period.

**Drill-down Capability:**
- By SKU / variant
- By size (identify size distribution: M and S are historically highest — FORECASTING_MODEL.md §3.4)
- By collection
- Units per order (= Units Sold / Orders Delivered)

**Reconciliation Notes / Exclusions / Edge Cases:**
- RTO'd units are excluded (they were shipped but not delivered — inventory_ledger records the return).
- Bundle variants (sets) count as 1 unit in order_lines. Inventory_ledger will show 2 separate deductions (1 legging + 1 bra) per bundle sale via BR-INV-01 decomposition logic.
- Do not double-count: if order_lines has 1 set and 1 bra, units_sold = 2, not 3.

---

### B-04: Revenue by Launch

**Business Definition:** Gross Revenue segmented by collection (launch). Shows which launch is actively driving revenue and at what point each collection is on its decay curve.

**Purpose:** Critical for understanding portfolio dynamics. When multiple collections are active simultaneously (e.g., Summer + Core), this KPI shows whether Core is cannibalising Summer or they are complementary.

**Formula:**
```
Revenue by Launch[L] = SUM(order_lines.line_total_inr)
  WHERE products.launch_id = L
    AND shipments.status = 'DELIVERED'
    AND delivered_at IN [period]
```

**SQL Logic (Pseudocode):**
```
SELECT p.launch_id, l.name, SUM(ol.line_total_inr) AS revenue
FROM order_lines ol
JOIN product_variants pv ON pv.id = ol.variant_id
JOIN products p ON p.id = pv.product_id
JOIN launches l ON l.id = p.launch_id
JOIN shipments s ON s.order_id = ol.order_id
WHERE s.status = 'DELIVERED'
  AND s.delivered_at BETWEEN :start AND :end
GROUP BY p.launch_id, l.name
```

**Source Tables:** `order_lines`, `product_variants`, `products`, `launches`, `shipments`, `kpi_monthly_snapshot`

**Refresh Frequency:** Daily

**Dashboard Location:** Sales Dashboard → Revenue by Collection stacked bar / pie chart

**Alert Thresholds:**
| Level | Condition | Action |
|-------|-----------|--------|
| Watch | Any single collection > 90% of total revenue | Over-reliance; check if other collections are depleted |
| Watch | Active collection revenue drops > 40% MoM | Exceeds normal decay; check stock availability |

**Drill-down Capability:**
- Revenue trend per collection (decay curve visualisation)
- % share of total revenue per collection
- Month-since-launch axis (normalised launch curve comparison across L1/L2/L3)
- Units sold per collection
- Sell-through rate: SUM(units sold) / SUM(opening_quantity) per launch

**Reconciliation Notes / Exclusions / Edge Cases:**
- Collections share no SKUs — there is no ambiguity in attribution.
- Classic Leggings 2 (L2) is a restocked version of Classic — it belongs to launch_id = 2 (Summer + Restock).
- Bundle products (sets) are attributed to the launch they belong to — Core Set → L3.
- If launch_id is NULL on a product (data error), that revenue appears as unattributed in the chart.

---

### B-05: Revenue by Product

**Business Definition:** Gross Revenue segmented by individual product variant (SKU × size). Shows which specific SKUs are the revenue drivers.

**Purpose:** SKU-level revenue ranking. Identifies hero SKUs, size distribution of demand, and underperforming variants. Feeds reorder quantity decisions.

**Formula:**
```
Revenue by Product[SKU] = SUM(order_lines.line_total_inr)
  WHERE order_lines.variant_id = SKU
    AND shipments.status = 'DELIVERED'
    AND delivered_at IN [period]
```

**SQL Logic (Pseudocode):**
```
SELECT pv.sku, p.name, pv.size, SUM(ol.line_total_inr) AS revenue, SUM(ol.quantity) AS units
FROM order_lines ol
JOIN product_variants pv ON pv.id = ol.variant_id
JOIN products p ON p.id = pv.product_id
JOIN shipments s ON s.order_id = ol.order_id
WHERE s.status = 'DELIVERED'
  AND s.delivered_at BETWEEN :start AND :end
GROUP BY pv.sku, p.name, pv.size
ORDER BY revenue DESC
```

**Source Tables:** `order_lines`, `product_variants`, `products`, `shipments`

**Refresh Frequency:** Weekly

**Dashboard Location:** Sales Dashboard → Product Performance table (sortable)

**Alert Thresholds:** No fixed thresholds — used as a ranking table, not a threshold alert.

**Drill-down Capability:**
- Revenue rank (top 10 SKUs)
- Revenue vs gross margin per SKU (scatter plot: high revenue vs high margin)
- Size distribution heatmap (row = product, column = size, value = units)
- Trend: weekly revenue per SKU

**Reconciliation Notes / Exclusions / Edge Cases:**
- Unresolved SKUs (`variant_id IS NULL` in order_lines) will appear as NULL in the product breakdown — must be zero before go-live (import validation check).
- Bundle set variants appear as a single SKU. Their constituent leggings and bra are not double-counted here.

---

### B-06: Revenue by State

**Business Definition:** Gross Revenue grouped by the customer's billing state from WooCommerce.

**Purpose:** Geographic demand distribution. Identifies high-value markets, RTO risk by state, and potential targets for state-specific marketing campaigns.

**Formula:**
```
Revenue by State[S] = SUM(order_lines.line_total_inr)
  WHERE orders.billing_state = S
    AND shipments.status = 'DELIVERED'
    AND delivered_at IN [period]
```

**SQL Logic (Pseudocode):**
```
SELECT o.billing_state, SUM(ol.line_total_inr) AS revenue, COUNT(DISTINCT o.id) AS orders
FROM order_lines ol
JOIN orders o ON o.id = ol.order_id
JOIN shipments s ON s.order_id = o.id
WHERE s.status = 'DELIVERED'
  AND s.delivered_at BETWEEN :start AND :end
GROUP BY o.billing_state
ORDER BY revenue DESC
```

**Source Tables:** `order_lines`, `orders`, `shipments`

**Refresh Frequency:** Weekly

**Dashboard Location:** Sales Dashboard → Geographic Map / State Table

**Alert Thresholds:** No fixed thresholds — ranking view only.

**Drill-down Capability:**
- Revenue vs RTO rate by state (cross with C-03)
- Top 5 states by revenue and by order count
- COD mix by state
- AOV by state

**Reconciliation Notes / Exclusions / Edge Cases:**
- State names may need normalisation (e.g., `Maharashtra` vs `MH` vs `Mah.`) during import.
- Uses `orders.billing_state` (WooCommerce billing address). For logistics analysis (RTO by state), use `shipments.customer_state` instead.
- States with < 3 orders in the period should be grouped as "Other" in visualisations to avoid identifying individual customers.

---

## Group C: Return & Logistics KPIs

---

### C-01: Return Rate %

**Business Definition:** Percentage of delivered orders where the customer initiated a return (excluding RTOs, which are logistics failures not customer decisions).

**Purpose:** Measures product-market fit and fulfilment quality from the customer's perspective. A rising return rate signals sizing issues, product quality problems, or mismatch between product listing and physical item.

**Formula:**
```
Return Rate % = COUNT(DISTINCT returns WHERE return_reason IS NOT NULL)
              / COUNT(DISTINCT shipments WHERE status = 'DELIVERED')
              × 100
```

**SQL Logic (Pseudocode):**
```
delivered = COUNT(DISTINCT s.id) FROM shipments s WHERE s.status = 'DELIVERED' AND delivered_at IN period

customer_returns = COUNT(DISTINCT r.id)
  FROM returns r
  JOIN shipments s ON r.shipment_id = s.id
  WHERE r.return_reason IS NOT NULL      -- customer-initiated; not RTO
    AND r.returned_at IN period

Return Rate % = (customer_returns / delivered) × 100
```

**Source Tables:** `returns`, `shipments`

**Refresh Frequency:** Weekly

**Dashboard Location:** Operations Dashboard → Returns Panel

**Alert Thresholds:**
| Level | Condition | Action |
|-------|-----------|--------|
| Critical | > 8% | Investigate product quality or listing accuracy immediately |
| Warning | 4–8% | Review size guide; check return reasons for patterns |
| OK | < 4% | Healthy for D2C activewear |

**Drill-down Capability:**
- Return rate by product / SKU
- Return reasons taxonomy (free text clustering until structured taxonomy is available)
- Return rate by collection (L1 vs L2 vs L3)
- Return rate trend over 12 months
- COD vs prepaid return rate (COD customers may have higher returns)

**Reconciliation Notes / Exclusions / Edge Cases:**
- RTOs (`status = 'RTO_DELIVERED'` on the shipment) are explicitly excluded — they are tracked under C-03 (RTO Rate %).
- A single customer initiating a return on a 2-item order = 1 return against 1 delivered order.
- `return_reason IS NOT NULL` filter distinguishes customer returns from RTO returns in the `returns` table. RTO rows may exist in `returns` with NULL `return_reason`.
- Return rate denominator is delivered orders (not all shipped orders) per BR-RET-01.

---

### C-02: Return Value

**Business Definition:** Total INR refunded to customers for processed returns in the period.

**Purpose:** Tracks the cash cost of returns. Feeds Net Revenue calculation and helps prioritise which return categories to reduce (high-value returns vs high-frequency low-value returns).

**Formula:**
```
Return Value = SUM(returns.refund_amount_inr WHERE refund_status = 'processed')
  AND returned_at IN [period]
```

**SQL Logic (Pseudocode):**
```
SELECT SUM(r.refund_amount_inr)
FROM returns r
WHERE r.refund_status = 'processed'
  AND r.returned_at BETWEEN :start AND :end
  AND r.return_reason IS NOT NULL   -- customer-initiated only
```

**Source Tables:** `returns`

**Refresh Frequency:** Weekly

**Dashboard Location:** Operations Dashboard → Returns Panel (paired with C-01)

**Alert Thresholds:**
| Level | Condition | Action |
|-------|-----------|--------|
| Warning | Return Value > 5% of Gross Revenue in period | High refund drain; investigate return reasons |
| OK | Return Value ≤ 5% of Gross Revenue | Normal |

**Drill-down Capability:**
- Return value by product
- Average refund amount per return
- Pending vs processed refunds (cash commitment)
- Refund mode breakdown (original payment method vs bank transfer)

**Reconciliation Notes / Exclusions / Edge Cases:**
- `refund_status = 'pending'` amounts represent a future cash outflow commitment — track separately as "pending refund liability."
- Refund amounts should reconcile to corresponding bank outflows classified as `transaction_type = 'customer_refund'` in `bank_transactions`.

---

### C-03: RTO Rate %

**Business Definition:** Percentage of dispatched shipments that were returned to origin (Shiprocket status `RTO_DELIVERED`). Includes both failed delivery attempts and refused deliveries.

**Purpose:** Most important fulfilment health metric. High RTO rates waste two-way freight cost, tie up cash in COD orders that never convert, and damage courier relationships. Industry benchmark: < 10% healthy; > 20% problematic.

**Formula:**
```
RTO Rate % = COUNT(shipments WHERE status = 'RTO_DELIVERED')
           / COUNT(shipments WHERE status IN ('DELIVERED', 'RTO_DELIVERED'))
           × 100
```

**SQL Logic (Pseudocode):**
```
SELECT
  SUM(CASE WHEN s.status = 'RTO_DELIVERED' THEN 1 ELSE 0 END) * 100.0
  / NULLIF(SUM(CASE WHEN s.status IN ('DELIVERED','RTO_DELIVERED') THEN 1 ELSE 0 END), 0)
FROM shipments s
WHERE s.shipped_at BETWEEN :start AND :end
```

**Source Tables:** `shipments`, `kpi_monthly_snapshot` (rto_rate_pct column)

**Refresh Frequency:** Weekly

**Dashboard Location:** Operations Dashboard → RTO Panel

**Alert Thresholds:**
| Level | Condition | Action |
|-------|-----------|--------|
| Critical | > 20% | Escalate to Shiprocket account manager; audit NDR handling process |
| Warning | 10–20% | Review COD vs prepaid split; investigate high-RTO states or couriers |
| Watch | 8–10% | Monitor trend; acceptable but at the threshold |
| OK | < 8% | Healthy |

**Drill-down Capability:**
- RTO Rate by courier (Delhivery vs Blue Dart vs Amazon)
- RTO Rate by zone (z_a through z_e)
- RTO Rate by payment method (COD expected to be higher than prepaid)
- RTO Rate by state
- NDR attempts distribution for RTO shipments (0 NDR = immediate refusal; 3+ NDR = repeated attempts before RTO)
- RTO Rate by month (trend — pre and post ad-driven traffic)

**Reconciliation Notes / Exclusions / Edge Cases:**
- Denominator includes only `DELIVERED` and `RTO_DELIVERED` — excludes shipments still in transit or cancelled.
- Time basis: use `shipped_at` for the denominator cohort (outcome-resolved shipments), not `rto_delivered_at`. This ensures the rate is cohort-consistent.
- COD RTOs have a direct cash impact beyond freight: the COD amount is never collected. Include this in C-04 (RTO Value).
- `rto_risk` column (low/medium/high from Shiprocket RAD score) can be used to predict RTOs before they happen — surface in the Forecast module.

---

### C-04: RTO Value

**Business Definition:** Total two-way freight cost incurred on RTO shipments, representing the cash lost when a shipment fails to deliver.

**Purpose:** Quantifies the financial cost of RTOs. Two-way freight on a zone-D shipment (~₹300 each way = ₹600 loss) on a ₹1,999 product is a ~30% direct cost hit. This KPI makes the urgency of RTO reduction tangible.

**Formula:**
```
RTO Value = SUM(shipments.freight_total_inr × 2)
  WHERE status = 'RTO_DELIVERED'
    AND rto_delivered_at IN [period]
```

**SQL Logic (Pseudocode):**
```
SELECT SUM(s.freight_total_inr * 2) AS rto_freight_cost
FROM shipments s
WHERE s.status = 'RTO_DELIVERED'
  AND s.rto_delivered_at BETWEEN :start AND :end
```

**Source Tables:** `shipments`, `kpi_monthly_snapshot` (rto_cost_inr column)

**Refresh Frequency:** Weekly

**Dashboard Location:** Operations Dashboard → RTO Panel (paired with C-03)

**Alert Thresholds:**
| Level | Condition | Action |
|-------|-----------|--------|
| Warning | RTO Value > 3% of Gross Revenue | Freight cost is materially eroding contribution margin |
| OK | RTO Value ≤ 3% of Gross Revenue | Within acceptable range |

**Drill-down Capability:**
- RTO freight cost by courier
- RTO freight cost by zone
- COD revenue lost on RTOs (SUM of cod_payable_inr for RTO'd COD shipments)
- Average freight cost per RTO by zone

**Reconciliation Notes / Exclusions / Edge Cases:**
- The `freight_total_inr × 2` formula assumes return freight ≈ forward freight. Shiprocket may charge differently for reverse logistics — validate against actual Shiprocket invoices when available.
- COD RTOs have an additional hidden cost: the COD amount (collected by courier but never remitted, or returned if remittance was pending). Track separately as "COD at risk."
- For prepaid RTOs: refund is issued to customer; company bears two-way freight with no revenue recovery.

---

### C-05: Delivery Success Rate %

**Business Definition:** Percentage of dispatched shipments that reached `DELIVERED` status within the estimated delivery date (EDD), with zero NDR attempts.

**Purpose:** First-attempt delivery rate. Measures courier efficiency and address data quality. A high NDR rate indicates either poor address data from WooCommerce or courier-side execution issues.

**Formula:**
```
Delivery Success Rate % =
  COUNT(shipments WHERE status = 'DELIVERED' AND ndr_attempts = 0)
  / COUNT(shipments WHERE status IN ('DELIVERED', 'RTO_DELIVERED'))
  × 100
```

**SQL Logic (Pseudocode):**
```
SELECT
  SUM(CASE WHEN s.status = 'DELIVERED' AND s.ndr_attempts = 0 THEN 1 ELSE 0 END) * 100.0
  / NULLIF(COUNT(s.id), 0)
FROM shipments s
WHERE s.status IN ('DELIVERED', 'RTO_DELIVERED')
  AND s.shipped_at BETWEEN :start AND :end
```

**Source Tables:** `shipments`

**Refresh Frequency:** Weekly

**Dashboard Location:** Operations Dashboard → Delivery Panel

**Alert Thresholds:**
| Level | Condition | Action |
|-------|-----------|--------|
| Warning | < 70% first-attempt delivery | Review address validation at checkout; audit courier NDR handling |
| OK | ≥ 80% first-attempt delivery | Healthy |

**Drill-down Capability:**
- Success rate by courier
- Success rate by state / zone
- Success rate by payment method
- NDR attempts distribution histogram

**Reconciliation Notes / Exclusions / Edge Cases:**
- `ndr_attempts = 0` means delivered on first attempt.
- Shipments with `ndr_attempts > 0` but `status = 'DELIVERED'` were eventually delivered after failed attempts — counted as delivered but not first-attempt success.
- EDD comparison requires EDD to be non-NULL. When EDD is NULL, the on-time dimension of the score is omitted.

---

### C-06: Average Delivery Days

**Business Definition:** Average number of calendar days from WooCommerce order creation to delivery confirmation, for successfully delivered shipments.

**Purpose:** Customer experience metric. Longer delivery times correlate with higher return intent and lower repeat purchase rate. Grouped by zone and courier to identify where delays originate.

**Formula:**
```
Average Delivery Days = AVG(
  EXTRACT(DAY FROM shipments.delivered_at − shipments.channel_created_at)
)
WHERE shipments.status = 'DELIVERED'
  AND channel_created_at IN [period]
```

**SQL Logic (Pseudocode):**
```
SELECT
  s.courier_company,
  s.zone,
  AVG(EXTRACT(DAY FROM s.delivered_at - s.channel_created_at)) AS avg_days
FROM shipments s
WHERE s.status = 'DELIVERED'
  AND s.channel_created_at BETWEEN :start AND :end
GROUP BY s.courier_company, s.zone
```

**Source Tables:** `shipments`

**Refresh Frequency:** Weekly

**Dashboard Location:** Operations Dashboard → Delivery Performance Panel

**Alert Thresholds:**
| Zone | Target | Warning |
|------|--------|---------|
| z_a / z_b | ≤ 3 days | > 4 days |
| z_c | ≤ 5 days | > 6 days |
| z_d | ≤ 7 days | > 8 days |
| z_e | ≤ 9 days | > 12 days |

**Drill-down Capability:**
- Distribution histogram (1 day, 2 days, 3 days... 10+ days)
- By courier
- By zone
- By COD vs prepaid (COD may have longer delivery due to payment confirmation steps)
- Trend over time (is courier speed improving?)

**Reconciliation Notes / Exclusions / Edge Cases:**
- Uses `channel_created_at` (WooCommerce order time), not `shiprocket_created_at` — this captures any delay between order placement and Shiprocket upload.
- RTO'd shipments excluded (they never completed delivery).
- Outliers (> 30 days): likely data errors or extreme remote deliveries. Exclude from average; flag for manual review.

---

### C-07: Courier Performance Score

**Business Definition:** Composite 0–100 score per courier, weighted across delivery success rate, NDR rate, and speed vs zone benchmark.

**Purpose:** Single number for courier comparison. Enables objective courier selection and contract negotiation. Tracks whether courier performance is improving or declining over time.

**Formula:**
```
Score = (Delivery Rate % × 0.50) + ((100 − NDR Rate %) × 0.30) + (On-time Rate % × 0.20)

Where:
  Delivery Rate % = delivered / (delivered + RTO) × 100
  NDR Rate % = shipments with ndr_attempts > 0 / total dispatched × 100
  On-time Rate % = delivered on or before EDD / total delivered × 100
```

**SQL Logic (Pseudocode):**
```
-- Per courier, for period
SELECT
  courier_company,
  (delivery_rate * 0.50) + ((100 - ndr_rate) * 0.30) + (ontime_rate * 0.20) AS score
FROM (
  SELECT
    courier_company,
    SUM(CASE WHEN status='DELIVERED' THEN 1 ELSE 0 END)*100.0 / COUNT(*) AS delivery_rate,
    SUM(CASE WHEN ndr_attempts > 0 THEN 1 ELSE 0 END)*100.0 / COUNT(*) AS ndr_rate,
    SUM(CASE WHEN status='DELIVERED' AND delivered_at <= edd THEN 1 ELSE 0 END)*100.0
      / NULLIF(SUM(CASE WHEN status='DELIVERED' THEN 1 ELSE 0 END), 0) AS ontime_rate
  FROM shipments
  WHERE shipped_at BETWEEN :start AND :end
  GROUP BY courier_company
) sub
```

**Source Tables:** `shipments`

**Refresh Frequency:** Weekly

**Dashboard Location:** Operations Dashboard → Courier Scorecard table

**Alert Thresholds:**
| Level | Score | Action |
|-------|-------|--------|
| Poor | < 60 | Escalate; reduce order allocation to this courier |
| Fair | 60–75 | Monitor; request improvement plan from courier account manager |
| Good | 75–90 | Maintain |
| Excellent | > 90 | Prioritise for high-value / prepaid orders |

**Drill-down Capability:**
- Score components breakdown (delivery, NDR, speed) per courier
- Score trend by month per courier
- Zone-level score per courier

**Reconciliation Notes / Exclusions / Edge Cases:**
- On-time rate requires EDD to be non-NULL. When EDD is NULL for a shipment, exclude it from the on-time component calculation.
- Current couriers in data: Delhivery, Blue Dart, Amazon Logistics. Score is only meaningful when a courier has ≥ 20 shipments in the period.
- Score is for operational use only — not a contractual metric.

---

## Group D: Profitability KPIs

---

### D-01: Blended Gross Margin %

**Business Definition:** The weighted average gross margin across all delivered products in the period. Gross margin = Revenue minus unit-level COGS (manufacturing + shoot/import amortisation + packaging provision). Excludes outbound shipping, COD charges, and ad spend.

**Purpose:** Measures intrinsic product profitability before variable sales costs. Rising blended GM% indicates a shift toward higher-margin collections (Summer/Core) or a reduction in low-margin Classic stock clearing.

**Formula:**
```
Blended Gross Margin % =
  SUM(order_lines.quantity × products.gross_margin_inr)   [delivered orders]
  / SUM(order_lines.line_total_inr)                        [delivered orders]
  × 100
```

**SQL Logic (Pseudocode):**
```
SELECT
  SUM(ol.quantity * p.gross_margin_inr) * 100.0
  / NULLIF(SUM(ol.line_total_inr), 0) AS blended_gm_pct
FROM order_lines ol
JOIN product_variants pv ON pv.id = ol.variant_id
JOIN products p ON p.id = pv.product_id
JOIN shipments s ON s.order_id = ol.order_id
WHERE s.status = 'DELIVERED'
  AND s.delivered_at BETWEEN :start AND :end
```

**Source Tables:** `order_lines`, `product_variants`, `products`, `shipments`, `kpi_monthly_snapshot`

**Refresh Frequency:** Weekly

**Dashboard Location:** Profitability Dashboard → Margin Panel

**Alert Thresholds:**
| Level | Condition | Action |
|-------|-----------|--------|
| Warning | < 30% | Classic-era COGS mix or unusual discounting |
| Watch | 30–40% | Mixed collection era |
| OK | ≥ 40% | Summer/Core era margins; Core L3 blended ~43% |

**Drill-down Capability:**
- GM% by collection (L1 ~31%, L2 ~50%, L3 ~43%)
- GM% by product type (sets vs individual pieces)
- GM% trend month-over-month
- Gross Margin INR (absolute, not just %)

**Reconciliation Notes / Exclusions / Edge Cases:**
- `products.gross_margin_inr` and `gross_margin_pct` are GENERATED columns — they are computed at product creation and update when `selling_price_inr` or any COGS component changes. Always read from the products table, never re-derive manually.
- Bundle COGS: Core Set COGS = leggings COGS + bra COGS + ₹75 packaging. The ₹75 is already embedded in `cogs_shipping_pkg_inr` at the bundle product level (BR-GM-03). Do NOT add ₹75 again when computing bundle margin.
- Per BR-GM-02: actual outbound shipping charges are excluded from Gross Margin. They appear in Contribution Margin (D-02).

---

### D-02: Contribution Margin %

**Business Definition:** Gross Margin minus variable selling costs (outbound freight, COD charges, and period ad spend), expressed as a percentage of Net Revenue. This is the per-period metric that reflects what the business actually keeps after fulfilling and selling each unit.

**Purpose:** The operational profitability signal. If Contribution Margin is negative or very low, the business cannot sustain itself regardless of revenue growth. Tracks whether operational efficiency improvements (lower RTO → lower freight, better ad ROAS → lower CAC) are flowing through to the bottom line.

**Formula:**
```
Contribution Margin INR =
  SUM(ol.quantity × p.gross_margin_inr)    [delivered, in period]
  − SUM(s.freight_total_inr)               [delivered shipments in period]
  − SUM(s.cod_charges_inr)                 [delivered shipments in period]
  − SUM(ad_spend_daily.spend_inr)          [period total ad spend]

Contribution Margin % = Contribution Margin INR / Net Revenue × 100
```

**SQL Logic (Pseudocode):**
```
gross_margin = SUM(ol.quantity * p.gross_margin_inr)  [delivered in period]
freight      = SUM(s.freight_total_inr)               [delivered in period]
cod_charges  = SUM(s.cod_charges_inr)                 [delivered in period]
ad_spend     = SUM(ads.spend_inr)                     [WHERE spend_date IN period]

CM_inr = gross_margin - freight - cod_charges - ad_spend
CM_pct = CM_inr / net_revenue * 100
```

**Source Tables:** `order_lines`, `products`, `product_variants`, `shipments`, `ad_spend_daily`, `kpi_monthly_snapshot`

**Refresh Frequency:** Monthly (requires closed period for accurate ad spend totals)

**Dashboard Location:** Profitability Dashboard → Contribution Margin Panel

**Alert Thresholds:**
| Level | Condition | Action |
|-------|-----------|--------|
| Critical | CM% < 0 | Business is losing money on each sale after variable costs |
| Warning | CM% 0–10% | Very thin margin; ad spend or freight costs are excessive |
| Watch | CM% 10–20% | Adequate but limited; target > 20% |
| OK | CM% > 20% | Healthy — covers fixed costs with room for growth investment |

**Drill-down Capability:**
- CM waterfall chart (Gross Revenue → COGS → Gross Margin → −Freight → −COD Charges → −Ad Spend → CM)
- CM by collection
- CM sensitivity: "what if RTO rate drops 5%?" / "what if ad spend is reduced 20%?"

**Reconciliation Notes / Exclusions / Edge Cases:**
- Ad spend is attributed at the period level (not per order) per BR-CM-02 — no order-level ad attribution exists yet.
- RTO freight is excluded from here (it is in C-04 RTO Value) — the freight in this formula is for delivered shipments only.
- Customer refunds are excluded from CM — they are netted in Net Revenue (A-02/B-02).
- Google Ads GST (18% IGST) is a tax, not ad spend — use `spend_inr` (net), not `total_inr`, in the ad spend line.

---

### D-03: Net Margin %

**Business Definition:** Contribution Margin minus all operating expenses (SaaS subscriptions, bank charges, miscellaneous opex), expressed as a percentage of Net Revenue. This is the closest equivalent to EBIT for Kirgo's stage.

**Purpose:** True bottom-line profitability signal. Excludes launch investment (treated as capex — see D-05 for that). Answers: "After paying for everything it takes to run the business each month, what's left?"

**Formula:**
```
Net Margin INR = Contribution Margin INR
              − SUM(expenses.amount_inr WHERE expense_date IN period)
              − SUM(rto_two_way_freight)   [= SUM(s.freight_total_inr × 2) for RTO_DELIVERED]

Net Margin % = Net Margin INR / Net Revenue × 100
```

**SQL Logic (Pseudocode):**
```
cm_inr     = [Contribution Margin INR from D-02]
opex       = SUM(e.amount_inr) FROM expenses WHERE expense_date IN period
rto_cost   = SUM(s.freight_total_inr * 2) FROM shipments WHERE status='RTO_DELIVERED'
               AND rto_delivered_at IN period

Net Margin INR = cm_inr - opex - rto_cost
Net Margin %   = Net Margin INR / net_revenue * 100
```

**Source Tables:** `expenses`, `shipments`, `kpi_monthly_snapshot`

**Refresh Frequency:** Monthly

**Dashboard Location:** Profitability Dashboard → P&L Summary Card

**Alert Thresholds:**
| Level | Condition | Action |
|-------|-----------|--------|
| Critical | < 0% | Business burning cash every month; requires structural review |
| Warning | 0–5% | Very thin; single bad month (high RTO, big ad push) turns negative |
| OK | > 5% | Sustainable; ≥ 10% is strong for a D2C brand at this stage |

**Drill-down Capability:**
- Monthly Net Margin trend
- P&L waterfall: Revenue → Net Revenue → Gross Margin → CM → Net Margin
- Opex breakdown by category

**Reconciliation Notes / Exclusions / Edge Cases:**
- Launch investment (`launch_expenses`) is excluded — it is capex, not recurring opex. Its recovery is tracked in D-05.
- Founder salary or personal drawings are excluded (they appear as `founder_transfer` in bank_transactions, not in `expenses`).
- Net Margin does not account for tax liabilities — Kirgo is an entity subject to GST; tax obligations are outside the current schema scope.

---

### D-04: Product Profitability

**Business Definition:** Per-product ranking of revenue generated, gross margin INR, and gross margin %, for the selected period.

**Purpose:** Identifies hero products and underperformers. A product with high revenue but low GM% may be dragging down the blended margin. A product with high GM% but low revenue is an opportunity to promote.

**Formula:**
```
Per product p:
  Revenue[p]       = SUM(ol.line_total_inr WHERE variant.product_id = p AND delivered)
  Gross Margin[p]  = SUM(ol.quantity × p.gross_margin_inr)
  GM %[p]          = p.gross_margin_pct  [static from products table]
  Units Sold[p]    = SUM(ol.quantity WHERE delivered)
```

**SQL Logic (Pseudocode):**
```
SELECT
  p.name, l.code AS launch,
  SUM(ol.quantity) AS units,
  SUM(ol.line_total_inr) AS revenue,
  SUM(ol.quantity * p.gross_margin_inr) AS gm_inr,
  p.gross_margin_pct
FROM order_lines ol
JOIN product_variants pv ON pv.id = ol.variant_id
JOIN products p ON p.id = pv.product_id
JOIN launches l ON l.id = p.launch_id
JOIN shipments s ON s.order_id = ol.order_id
WHERE s.status = 'DELIVERED'
  AND s.delivered_at BETWEEN :start AND :end
GROUP BY p.id, p.name, l.code, p.gross_margin_pct
ORDER BY gm_inr DESC
```

**Source Tables:** `order_lines`, `product_variants`, `products`, `launches`, `shipments`

**Refresh Frequency:** Weekly

**Dashboard Location:** Profitability Dashboard → Product Profitability table

**Alert Thresholds:** No fixed thresholds — used as a ranking/matrix view.

**Drill-down Capability:**
- 2×2 matrix: Revenue (x-axis) vs GM% (y-axis); size = units sold
- Per product: GM trend over time (has it changed due to price edits?)
- Bundle vs individual piece profitability comparison

**Reconciliation Notes / Exclusions / Edge Cases:**
- `gross_margin_pct` on the `products` table is a static GENERATED column (set at product creation). It reflects current selling price and COGS. If selling price or COGS is updated, the GENERATED column updates automatically.
- For set/bundle products, the gross_margin_inr already correctly reflects the bundle economics per BR-GM-03.

---

### D-05: Launch Profitability

**Business Definition:** Per-launch P&L. Tracks total investment, cumulative net revenue since launch, current net profit/loss, implied payback period, and estimated final ROI at sell-through.

**Purpose:** The definitive metric for evaluating whether each product launch was a good business decision. Answers: "Has L2 Summer paid back its ₹10.4L investment? When will L3 Core break even?"

**Formula:**
```
Launch P&L:
  Total Investment  = launches.total_investment_inr
  Cumulative Revenue = SUM(order_lines.line_total_inr) WHERE launch_id = L AND DELIVERED [all time]
  Cumulative Net Revenue = Cumulative Revenue − Cumulative Refunds − Discounts [all time]
  Net P&L (to date) = Cumulative Net Revenue − Total Investment
  ROI %             = Net P&L / Total Investment × 100
  Payback Period    = Total Investment / AVG(monthly net contribution, first 6 months post-launch)

Monthly Net Contribution (for payback):
  = Monthly Gross Margin − Monthly Freight − Monthly COD Charges [for this launch only]
```

**SQL Logic (Pseudocode):**
```
-- Cumulative net revenue per launch (all time)
SELECT p.launch_id,
  SUM(ol.line_total_inr) - SUM(COALESCE(refunds_per_order, 0)) - SUM(o.discount_inr) AS cumulative_net_rev
FROM order_lines ol
JOIN ... [standard joins]
WHERE s.status = 'DELIVERED'
GROUP BY p.launch_id

-- Join to launches.total_investment_inr for net P&L
-- Payback period from first 6 months post launched_at
```

**Source Tables:** `launches`, `order_lines`, `orders`, `shipments`, `returns`, `products`, `product_variants`, `launch_expenses`

**Refresh Frequency:** Monthly (updated once per month with that month's data)

**Dashboard Location:** Profitability Dashboard → Launch ROI Panel (one card per launch)

**Alert Thresholds:**
| Level | Condition | Action |
|-------|-----------|--------|
| Watch | Payback Period > 18 months | Launch investment is taking too long to recover |
| OK | Payback Period < 12 months | Target for D2C apparel at this scale |

**Drill-down Capability:**
- Cumulative revenue curve vs investment line (breakeven chart)
- Monthly revenue contribution per launch
- Remaining stock value (inventory_batches × COGS) to add to total launch asset
- Estimated final ROI at 100% sell-through

**Reconciliation Notes / Exclusions / Edge Cases:**
- `launches.total_investment_inr` is a derived sum from `launch_expenses`. If launch expenses have not been fully entered, this figure will be understated.
- Payback uses net contribution margin (not gross revenue) to be conservative.
- Benchmarks: L1 ₹6.43L, L2 ₹10.38L, L3 ₹5.05L investment. L3 had the highest AOV (₹3,013 in Jan 2026 launch month) suggesting a faster payback curve.
- Sell-Through Rate (related metric): SUM(units sold since launch) / SUM(inventory_batches.opening_quantity) × 100 — target > 70% within 6 months of launch.

---

## Group E: Inventory KPIs

---

### E-01: Inventory Value at Cost

**Business Definition:** The total INR value of all current stock on hand, valued at COGS (not selling price). Represents the capital currently tied up in inventory.

**Purpose:** Balance sheet metric. Tells the founder how much of the launch investment is still "in the warehouse." Used alongside Cash Position to understand total business assets.

**Formula:**
```
Inventory Value = SUM(
  SUM(inventory_ledger.quantity_delta)  [per variant]
  × products.cogs_total_inr
)
GROUP BY variant_id
```

**SQL Logic (Pseudocode):**
```
SELECT SUM(stock_on_hand * p.cogs_total_inr) AS total_inventory_value
FROM (
  SELECT il.variant_id, SUM(il.quantity_delta) AS stock_on_hand
  FROM inventory_ledger il
  GROUP BY il.variant_id
  HAVING SUM(il.quantity_delta) > 0
) stock
JOIN product_variants pv ON pv.id = stock.variant_id
JOIN products p ON p.id = pv.product_id
```

**Source Tables:** `inventory_ledger`, `product_variants`, `products`

**Refresh Frequency:** Real-time (updates on every `inventory_ledger` insert)

**Dashboard Location:** Inventory Dashboard → Total Inventory Value Card

**Alert Thresholds:** No fixed threshold — contextual vs launch investment.

**Drill-down Capability:**
- Value by collection
- Value by product type (leggings vs bra vs set)
- Value by size
- Value as % of total launch investment (how much of the ₹X investment is still unsold)

**Reconciliation Notes / Exclusions / Edge Cases:**
- Use COGS, not selling price — this is a cost-basis asset valuation.
- Variants with `SUM(quantity_delta) = 0` are sold out and contribute ₹0.
- Variants with `SUM(quantity_delta) < 0` indicate a data error (negative stock) — must be 0 per DQ check C4.
- Bundle variants: use `bundle_product.cogs_total_inr` (which already includes the component COGS correctly per BR-GM-03). Do not sum component COGS separately.

---

### E-02: Inventory Turnover (Annualised)

**Business Definition:** How many times the average inventory value is sold and replaced in a year. A higher turnover means capital is cycling faster.

**Purpose:** Efficiency metric. For a batch-launch D2C model where each launch has a finite stock, low turnover signals slow sell-through and potential cash lockup. Industry benchmark: 4–8× per year for D2C apparel.

**Formula:**
```
Inventory Turnover (annualised) =
  (Units Sold in Period / Average Stock in Period) × (365 / Days in Period)

Average Stock = (Opening Stock + Closing Stock) / 2
```

**SQL Logic (Pseudocode):**
```
units_sold   = SUM(ol.quantity) [delivered in period]
opening_stk  = SUM(il.quantity_delta) per variant WHERE occurred_at < :period_start
closing_stk  = SUM(il.quantity_delta) per variant WHERE occurred_at < :period_end
avg_stock    = (opening_stk + closing_stk) / 2

turnover = (units_sold / avg_stock) * (365.0 / days_in_period)
```

**Source Tables:** `inventory_ledger`, `order_lines`, `shipments`

**Refresh Frequency:** Monthly

**Dashboard Location:** Inventory Dashboard → Turnover Metrics Panel

**Alert Thresholds:**
| Level | Condition | Action |
|-------|-----------|--------|
| Warning | < 3× annualised | Sell-through pace too slow; consider promotional push |
| OK | 3–8× annualised | Industry-normal range for D2C activewear |
| Watch | > 8× annualised | High velocity — ensure next PO is in motion before stockout |

**Drill-down Capability:**
- Turnover by collection
- Turnover by product type
- Turnover trend over quarters

**Reconciliation Notes / Exclusions / Edge Cases:**
- For collections early in their lifecycle (< 3 months since launch), annualised turnover will appear misleadingly high — add a "months since launch" filter.
- If opening or closing stock is zero (e.g., at very start or end of a collection), the average stock formula may inflate the rate. Use the non-zero period for meaningful calculation.
- This KPI does not account for stock quality — dead stock (unsold XS/XL sizes) reduces turnover even if M/L sizes move fast.

---

### E-03: Days of Inventory Remaining

**Business Definition:** For each variant (SKU × size), the number of days until stockout at the current 30-day average daily sales velocity.

**Purpose:** Most actionable inventory KPI. The number that triggers the reorder decision. Values < 30 days should initiate supplier contact; values < 14 days are critical.

**Formula:**
```
Days of Inventory[variant] =
  Current Stock on Hand[variant]
  / Daily Velocity 30D[variant]

Daily Velocity 30D = Units Sold in last 30 days / 30
```

**SQL Logic (Pseudocode):**
```
-- Read from pre-computed table (preferred)
SELECT pv.sku, pv.size, inf.current_stock, inf.days_to_stockout_30d, inf.alert_level
FROM inventory_forecasts inf
JOIN product_variants pv ON pv.id = inf.variant_id
WHERE inf.is_current = true
ORDER BY inf.days_to_stockout_30d ASC NULLS LAST
```

**Source Tables:** `inventory_forecasts` (pre-computed), `inventory_ledger`, `order_lines`

**Refresh Frequency:** Daily

**Dashboard Location:** Inventory Dashboard → Stock Status table (top row; rows sorted by alert level)

**Alert Thresholds:**
| Level | Days to Stockout | Dashboard Colour | Action |
|-------|-----------------|-----------------|--------|
| Critical | < 14 days | Red | Place reorder immediately; alert founder |
| Warning | 14–30 days | Orange | Initiate supplier contact; prepare PO |
| Watch | 30–60 days | Yellow | Review forecast; plan next order |
| OK | > 60 days | Green | Monitor normally |

**Drill-down Capability:**
- Sorted table: all active variants ranked by days to stockout
- Stock level per variant (units remaining)
- Sales velocity trend (7-day vs 30-day velocity comparison)
- Projected stockout date (calendar)

**Reconciliation Notes / Exclusions / Edge Cases:**
- When `daily_velocity_30d = 0` (no sales in 30 days), `days_to_stockout` is NULL (infinite). This may reflect a genuinely slow SKU or a stale collection — do not suppress from the table.
- XS and XL sizes are structurally slower-moving (5% of opening stock each per FORECASTING_MODEL.md §3.4). A 180-day figure for XS is not alarming.
- Stock on hand is from `SUM(inventory_ledger.quantity_delta)` per variant — real-time, not from inventory_batches.opening_quantity.

---

### E-04: Dead Stock %

**Business Definition:** Percentage of active variants (with stock > 0) that have had zero deliveries in the past 60 days.

**Purpose:** Identifies inventory that is consuming warehouse space and has COGS already sunk but generating no revenue. At depletion stage, dead stock may require promotional markdowns to clear.

**Formula:**
```
Dead Stock % =
  COUNT(variants WHERE current_stock > 0 AND units_sold_last_60d = 0)
  / COUNT(variants WHERE current_stock > 0)
  × 100
```

**SQL Logic (Pseudocode):**
```
-- Variants with stock
active_variants = (SELECT variant_id FROM inventory_ledger GROUP BY variant_id HAVING SUM(quantity_delta) > 0)

-- Units sold in last 60 days per variant
recent_sales = (
  SELECT ol.variant_id, SUM(ol.quantity) AS units_60d
  FROM order_lines ol JOIN shipments s ON s.order_id = ol.order_id
  WHERE s.status='DELIVERED' AND s.delivered_at >= CURRENT_DATE - 60
  GROUP BY ol.variant_id
)

-- Dead stock = in active_variants but not in recent_sales (or units_60d = 0)
Dead Stock % = COUNT(active WHERE not in recent_sales OR units_60d = 0) / COUNT(active) * 100
```

**Source Tables:** `inventory_ledger`, `order_lines`, `shipments`, `product_variants`

**Refresh Frequency:** Weekly

**Dashboard Location:** Inventory Dashboard → Dead Stock Alert Panel

**Alert Thresholds:**
| Level | Condition | Action |
|-------|-----------|--------|
| Warning | Dead Stock % > 20% | Review pricing; consider bundle promotion or discount |
| Watch | Dead Stock % 10–20% | Monitor; typical for XS/XL sizes at launch tail |
| OK | Dead Stock % < 10% | Normal |

**Drill-down Capability:**
- List of dead stock variants with current stock count and COGS value
- Days since last sale per variant
- Dead stock value at cost (= dead stock units × cogs_total_inr)

**Reconciliation Notes / Exclusions / Edge Cases:**
- 60-day window is conservative — for rare sizes (XS, XL), consider a 90-day window to avoid false dead stock classification.
- `L4 Core Flare` variants (not yet launched) should be excluded — they will show zero sales but are not dead stock.
- Dead stock that accumulates unsold at collection depletion may be sold as a bundle or at a markdown — track separately from active sell-through.

---

### E-05: Stock Cover Days (Collection Level)

**Business Definition:** Estimated days until a collection's entire remaining stock is depleted, based on current 30-day velocity across all variants in that collection.

**Purpose:** Collection-level stockout horizon. Unlike E-03 (per-variant), this gives the launch-level view: "The Core collection, at current pace, will be sold out in approximately X days." Useful for planning the L4 launch timing.

**Formula:**
```
Stock Cover Days[launch] =
  SUM(current_stock[variant] FOR all variants IN launch)
  / SUM(daily_velocity_30d[variant] FOR all variants IN launch)
```

**SQL Logic (Pseudocode):**
```
SELECT p.launch_id, l.name,
  SUM(inf.current_stock) AS total_stock,
  SUM(inf.daily_velocity_30d) AS total_velocity,
  SUM(inf.current_stock) / NULLIF(SUM(inf.daily_velocity_30d), 0) AS cover_days
FROM inventory_forecasts inf
JOIN product_variants pv ON pv.id = inf.variant_id
JOIN products p ON p.id = pv.product_id
JOIN launches l ON l.id = p.launch_id
WHERE inf.is_current = true AND inf.current_stock > 0
GROUP BY p.launch_id, l.name
```

**Source Tables:** `inventory_forecasts`, `product_variants`, `products`, `launches`

**Refresh Frequency:** Daily

**Dashboard Location:** Inventory Dashboard → Collection Cover Days Panel (one row per active launch)

**Alert Thresholds:**
| Level | Condition | Action |
|-------|-----------|--------|
| Critical | < 30 days | Begin L4 deposit process immediately; supplier lead time ≈ 90+ days |
| Warning | 30–60 days | Initiate L4 PO discussions; finalise design and sampling |
| Watch | 60–90 days | Planning horizon — review L4 design and timing |
| OK | > 90 days | Comfortable runway |

**Drill-down Capability:**
- Cover days per variant within the collection (reveals size-level imbalances)
- Cover days trend (is it accelerating or stabilising?)
- Cross-reference with L4 planned launch date

**Reconciliation Notes / Exclusions / Edge Cases:**
- This is a blended collection view — some variants within the collection may be critically low while others have excess. Always check E-03 per-variant view alongside this.
- When some variants have zero velocity, their stock is excluded from the denominator, which may understate collection-level cover days for slow sizes.

---

### E-06: Reorder Quantity

**Business Definition:** For each variant where `reorder_recommended = true`, the estimated number of units to order in the next purchase order to cover 90 days of demand.

**Purpose:** Direct input to the next supplier purchase order. Removes guesswork from reorder sizing. Grounded in actual 30-day velocity data rather than subjective estimation.

**Formula:**
```
Reorder Quantity[variant] =
  MAX(0, (daily_velocity_30d × 90) − current_stock)

Applied only when:
  inventory_forecasts.reorder_recommended = true
  AND inventory_forecasts.is_current = true
```

**SQL Logic (Pseudocode):**
```
SELECT pv.sku, pv.size, p.name,
  inf.current_stock,
  inf.daily_velocity_30d,
  inf.units_to_reorder,
  inf.projected_stockout_date
FROM inventory_forecasts inf
JOIN product_variants pv ON pv.id = inf.variant_id
JOIN products p ON p.id = pv.product_id
WHERE inf.is_current = true
  AND inf.reorder_recommended = true
ORDER BY inf.days_to_stockout_30d ASC
```

**Source Tables:** `inventory_forecasts`, `product_variants`, `products`

**Refresh Frequency:** Daily

**Dashboard Location:** Inventory Dashboard → Reorder Alerts Panel

**Alert Thresholds:** Same as E-03 — alert_level drives the urgency indicator here.

**Drill-down Capability:**
- Reorder quantity by size (input for PO line items)
- Total reorder cost estimate: SUM(units_to_reorder × cogs_manufacture_inr)
- Historical accuracy of past reorder quantities (compare to actual velocity post-restock)

**Reconciliation Notes / Exclusions / Edge Cases:**
- 90-day demand buffer is a conservative assumption. For slower-moving sizes (XS, XL), 90 days may result in over-ordering. The implementation team should allow the analyst to override the buffer days.
- Minimum order quantity (MOQ) from suppliers is not tracked in the schema yet — this is a missing field (DATA_DICTIONARY.md Appendix E). Reorder Quantity should be validated against supplier MOQ before issuing a PO.
- If `daily_velocity_30d = 0` for a variant, `units_to_reorder = 0` even if current stock is low. This may happen for genuinely dead SKUs — do not order more of them.

---

## Group F: Marketing KPIs

---

### F-01: Return on Ad Spend (ROAS)

**Business Definition:** Net Revenue generated per ₹1 of net ad spend in the period. Measures the direct revenue return on advertising investment.

**Purpose:** Primary marketing efficiency signal. Answers: "For every rupee spent on Google/Meta, how many rupees in revenue did we generate?" Currently blended across all channels since UTM attribution is incomplete.

**Formula:**
```
ROAS = Net Revenue / SUM(ad_spend_daily.spend_inr)
  WHERE spend_date IN [period]
```

**SQL Logic (Pseudocode):**
```
net_revenue = [from B-02, same period]
ad_spend    = SUM(ads.spend_inr) FROM ad_spend_daily WHERE spend_date IN period

ROAS = net_revenue / NULLIF(ad_spend, 0)
```

**Source Tables:** `ad_spend_daily`, `order_lines`, `shipments`, `returns`, `kpi_monthly_snapshot`

**Refresh Frequency:** Monthly (ad spend data lags by invoice cycle)

**Dashboard Location:** Marketing Dashboard → ROAS Card

**Alert Thresholds:**
| Level | Condition | Action |
|-------|-----------|--------|
| Critical | < 1× | Ad spend exceeds revenue generated; immediate pause required |
| Warning | 1–2× | Below breakeven for contribution margin positive; reduce spend or improve targeting |
| Watch | 2–3× | Below target; monitor creative and audience |
| OK | ≥ 3× | Target minimum for D2C fashion (covers COGS + shipping + some CM) |

**Drill-down Capability:**
- ROAS by platform (Google vs Meta, when split data is available)
- ROAS by campaign (when campaign-level spend and UTM data are linked)
- ROAS trend over months

**Reconciliation Notes / Exclusions / Edge Cases:**
- Use `spend_inr` (net of overdelivery credits), NOT `total_inr` (which includes GST). GST is a tax, not marketing spend.
- ROAS denominator is total ad spend in the period. ROAS numerator is Net Revenue delivered in the same period. Due to delivery lag, some revenue from May ad spend may be delivered in June — this introduces a ~3–7 day lag distortion in monthly ROAS. For a D2C fashion brand with fast delivery, this is acceptable.
- May 2026 known data: Google ₹10,440 net + Meta ₹10,000 = ₹20,440 total spend. Revenue that month is the denominator check.
- Attribution gap: ~70% of orders may lack UTM parameters. Blended ROAS is therefore an underestimate of true ad-driven ROAS.

---

### F-02: Marketing Efficiency Ratio (MER)

**Business Definition:** Gross Revenue divided by total marketing spend (including GST and all channel costs). A broader measure than ROAS that uses gross revenue and the full marketing cost to the business.

**Purpose:** Business-level marketing efficiency. Unlike ROAS, MER uses gross revenue (before returns and discounts) and includes total cost (including GST). Used for planning marketing budgets relative to revenue targets.

**Formula:**
```
MER = Gross Revenue / SUM(ad_spend_daily.total_inr)
  WHERE spend_date IN [period]
```

**SQL Logic (Pseudocode):**
```
gross_rev = [Gross Revenue from B-01, same period]
total_mkt = SUM(ads.total_inr) FROM ad_spend_daily WHERE spend_date IN period
            -- total_inr = spend_inr + gst_inr

MER = gross_rev / NULLIF(total_mkt, 0)
```

**Source Tables:** `ad_spend_daily`, `order_lines`, `shipments`

**Refresh Frequency:** Monthly

**Dashboard Location:** Marketing Dashboard → MER Panel (alongside ROAS)

**Alert Thresholds:**
| Level | Condition | Action |
|-------|-----------|--------|
| Warning | MER < 3× | Marketing spend is consuming excessive revenue share |
| OK | MER ≥ 3× | Standard D2C target |

**Drill-down Capability:**
- MER vs ROAS side-by-side (the gap = refunds + discounts + GST effect)
- MER trend over months
- MER sensitivity to ad spend level

**Reconciliation Notes / Exclusions / Edge Cases:**
- MER will always be ≥ ROAS because MER uses gross revenue (larger numerator) and uses total_inr (larger denominator). The two metrics moving in opposite directions signals a change in refund rate or GST cost.
- At Kirgo's current scale, all marketing = paid ads. When influencer fees or organic content costs are tracked, add them to the MER denominator.
- NULL when no ad spend in the period (org-only months).

---

### F-03: Customer Acquisition Cost (CAC)

**Business Definition:** Total ad spend divided by the number of new customers whose first delivered order falls within the period.

**Purpose:** Sustainability check. If CAC exceeds the contribution margin per first order, Kirgo is spending more to acquire a customer than it earns from them. Must be compared against LTV to assess the long-term economics.

**Formula:**
```
CAC = SUM(ad_spend_daily.spend_inr)
    / COUNT(DISTINCT customers WHERE first_order_at IN [period] AND has delivered order)
```

**SQL Logic (Pseudocode):**
```
ad_spend     = SUM(ads.spend_inr) FROM ad_spend_daily WHERE spend_date IN period

new_customers = COUNT(DISTINCT c.id)
  FROM customers c
  JOIN orders o ON o.customer_id = c.id
  JOIN shipments s ON s.order_id = o.id
  WHERE s.status = 'DELIVERED'
    AND c.first_order_at BETWEEN :start AND :end

CAC = ad_spend / NULLIF(new_customers, 0)
```

**Source Tables:** `ad_spend_daily`, `customers`, `orders`, `shipments`

**Refresh Frequency:** Monthly

**Dashboard Location:** Marketing Dashboard → CAC Card

**Alert Thresholds:**
| Level | Condition | Action |
|-------|-----------|--------|
| Critical | CAC > AOV | Each new customer costs more to acquire than they spend |
| Warning | CAC > 50% of CM per first order | Marketing is consuming majority of contribution |
| OK | CAC < 30% of AOV | Efficient acquisition; LTV likely positive |

**Drill-down Capability:**
- CAC trend over months
- CAC by channel (when UTM data is available)
- CAC vs AOV of new customers (first purchase AOV)
- CAC vs LTV ratio

**Reconciliation Notes / Exclusions / Edge Cases:**
- CAC uses all ad spend in the period, not just spend attributed to new customer orders. This is a blended CAC — it assumes all ad spend is for acquisition (some spend may re-target existing customers, which overstates CAC).
- ~70% of WooCommerce orders lack UTM attribution — new customers from organic/direct channels are counted in the denominator but their acquisition had no ad cost. This understates true paid CAC.
- For Kirgo's launch-driven model, CAC spikes in launch months (high ad spend, fewer organic customers) and is lower in steady-state months (lower spend, still converting organic demand).

---

### F-04: Customer Lifetime Value (LTV)

**Business Definition:** Average cumulative net revenue per customer across all their delivered orders, measured from first purchase to date.

**Purpose:** Long-term economic indicator. Validates whether the business is building a loyal customer base or acquiring one-time buyers. Compared against CAC to assess whether the acquisition model is economically sound.

**Formula:**
```
LTV = SUM(customers.total_revenue_inr) / COUNT(customers)
    WHERE total_orders >= 1 AND total_revenue_inr > 0
```

**SQL Logic (Pseudocode):**
```
SELECT AVG(c.total_revenue_inr) AS avg_ltv,
       PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY c.total_revenue_inr) AS median_ltv
FROM customers c
WHERE c.total_orders >= 1
  AND c.total_revenue_inr > 0
```

**Source Tables:** `customers`

**Refresh Frequency:** Monthly

**Dashboard Location:** Marketing Dashboard → LTV Panel

**Alert Thresholds:**
| Level | Condition | Action |
|-------|-----------|--------|
| Watch | Median LTV < ₹2,000 | Most customers are buying once and at low AOV |
| OK | Median LTV ≥ ₹2,500 | One full Core-price purchase covers average LTV; room to grow with repeats |

**Drill-down Capability:**
- LTV distribution histogram (what % of customers have spent ₹1k, ₹3k, ₹5k+)
- LTV by acquisition source (utm_source)
- LTV by acquisition cohort (first_order_at month)
- Repeat buyers' LTV vs one-time buyers' LTV

**Reconciliation Notes / Exclusions / Edge Cases:**
- `customers.total_revenue_inr` is maintained by the application on each delivered order (see DATA_DICTIONARY.md). It reflects delivered revenue only, not all orders placed.
- At 32 months of history with a limited SKU range, cohort LTV data is sparse. Median LTV is more informative than average (a few high-spend customers can skew average).
- LTV will naturally grow over time as customers place repeat orders. Current LTV is therefore a lower-bound estimate of eventual LTV.
- True LTV should deduct COGS and contribution margin costs — what's shown here is revenue-based LTV. Margin-adjusted LTV = LTV × Blended GM% − CAC.

---

### F-05: Repeat Purchase Rate

**Business Definition:** Percentage of the total customer base who have placed two or more delivered orders.

**Purpose:** Brand loyalty indicator. D2C businesses with high repeat rates can lower CAC over time as organic word-of-mouth and direct traffic grow. For a business with a limited product range (2 garments per collection, 3 active collections), repeat purchase = a customer returning to try a new collection or size.

**Formula:**
```
Repeat Purchase Rate = COUNT(customers WHERE total_orders >= 2)
                     / COUNT(customers WHERE total_orders >= 1)
                     × 100
```

**SQL Logic (Pseudocode):**
```
SELECT
  COUNT(CASE WHEN c.total_orders >= 2 THEN 1 END) * 100.0
  / NULLIF(COUNT(CASE WHEN c.total_orders >= 1 THEN 1 END), 0)
FROM customers c
```

**Source Tables:** `customers`

**Refresh Frequency:** Monthly

**Dashboard Location:** Marketing Dashboard → Retention Panel

**Alert Thresholds:**
| Level | Condition | Action |
|-------|-----------|--------|
| Watch | < 10% | Most customers are one-time buyers; invest in post-purchase nurture |
| OK | 10–25% | Reasonable for a brand with limited SKU range (3 collections) |
| Good | > 25% | Strong loyalty; customers returning for new collections |

**Drill-down Capability:**
- Repeat purchase rate trend over time (is it growing as more collections launch?)
- Time between first and second order (in days)
- Repeat buyers' preferred collections (do they cross collections or stay within one?)
- Repeat rate by acquisition source

**Reconciliation Notes / Exclusions / Edge Cases:**
- `customers.total_orders` is incremented by the application on each order (any status). For accuracy, compute this from `COUNT(DISTINCT orders.id WHERE shipments.status = 'DELIVERED')` per customer rather than the denormalised field.
- The `First Lovers` cohort referenced in the source Excel tracks early adopters manually. This KPI is the systematic version of that tracking.
- With only 3 launched collections over 32 months, repeat purchase opportunity is structurally limited. Once L4 launches, repeat rate is expected to improve as early L3 buyers upgrade to Flare.

---

## Group G: Finance KPIs

---

### G-01: Cash Inflow

**Business Definition:** Total INR credited to the HDFC business bank account from operational sources in the period. Excludes founder capital injections.

**Purpose:** Measures actual cash generation from the business. The gap between Net Revenue and Cash Inflow (settlement lag) is the most important insight — it shows whether Kirgo has sufficient liquidity to cover operating expenses between revenue events and cash receipt.

**Formula:**
```
Cash Inflow = SUM(bank_transactions.deposit_inr)
  WHERE transaction_type IN ('gateway_settlement', 'cod_remittance')
    AND transaction_date IN [period]
```

**SQL Logic (Pseudocode):**
```
SELECT SUM(bt.deposit_inr)
FROM bank_transactions bt
WHERE bt.transaction_type IN ('gateway_settlement', 'cod_remittance')
  AND bt.transaction_date BETWEEN :start AND :end
```

**Source Tables:** `bank_transactions`, `kpi_daily_snapshot` (cash_deposited_inr), `kpi_monthly_snapshot` (cash_collected_inr)

**Refresh Frequency:** Daily (after bank import)

**Dashboard Location:** Finance Dashboard → Cash Inflow Card

**Alert Thresholds:** No standalone threshold — compare against Net Revenue for settlement lag analysis.

**Drill-down Capability:**
- Cash inflow by source (EaseBuzz YESF vs Infibeam IN vs Shiprocket COD CRF)
- Daily inflow chart
- Cash inflow vs Net Revenue overlay (settlement lag visualisation)
- Cash Collection Rate = Cash Inflow / Gross Revenue × 100 (target: approach 100% over time)

**Reconciliation Notes / Exclusions / Edge Cases:**
- Founder transfers (`transaction_type = 'founder_transfer'`) must be excluded — they are equity movements, not business cash generation.
- Gateway settlements are batch remittances covering multiple orders. The `gateway_settlements` table maps each settlement to a bank entry.
- EaseBuzz settles via YESB escrow (YESF reference in narration). Infibeam settles via ICICI nodal (IN reference). Shiprocket COD settles via CRF ID. See DATA_DICTIONARY.md §10.
- Cash Inflow will lag Net Revenue by T+3 (prepaid) to T+14 (COD). A month with high revenue but low inflow may just reflect timing — check `cod_outstanding` (G-06) before drawing conclusions.

---

### G-02: Cash Outflow

**Business Definition:** Total INR debited from the HDFC account for operational purposes in the period. Excludes founder withdrawals and supplier PO payments (which are capex).

**Purpose:** Tracks the ongoing cash cost of running the business. Key components: courier/Shiprocket charges, ad spend, SaaS subscriptions, bank charges, and customer refunds.

**Formula:**
```
Cash Outflow = SUM(bank_transactions.withdrawal_inr)
  WHERE transaction_type IN (
    'shiprocket_recharge', 'courier_payment',
    'ad_spend_meta', 'ad_spend_google',
    'saas_subscription', 'customer_refund', 'bank_charge'
  )
  AND transaction_date IN [period]
```

**SQL Logic (Pseudocode):**
```
SELECT SUM(bt.withdrawal_inr)
FROM bank_transactions bt
WHERE bt.transaction_type IN (
  'shiprocket_recharge', 'courier_payment',
  'ad_spend_meta', 'ad_spend_google',
  'saas_subscription', 'customer_refund', 'bank_charge'
)
AND bt.transaction_date BETWEEN :start AND :end
```

**Source Tables:** `bank_transactions`, `kpi_daily_snapshot` (cash_withdrawn_inr)

**Refresh Frequency:** Daily

**Dashboard Location:** Finance Dashboard → Cash Outflow Card

**Alert Thresholds:** No standalone threshold — tracked as % of Cash Inflow.

**Drill-down Capability:**
- Outflow breakdown by transaction_type
- Outflow trend over months
- Largest single outflow events (sorted)
- Outflow vs ad spend budget adherence

**Reconciliation Notes / Exclusions / Edge Cases:**
- `supplier_payment` (type) is excluded from operating outflow — it is a capex event tied to a specific launch PO. Track it separately for launch investment monitoring.
- `founder_transfer` (OUT) is excluded — personal withdrawals are not business operating costs.
- Some outflows may be unclassified (`transaction_type = 'unclassified'`) until the narration classifier is tuned. Monitor the unclassified bucket and manually review large unclassified debits.

---

### G-03: Net Cash Flow

**Business Definition:** Cash Inflow minus Cash Outflow for the period. Positive = more cash coming in than going out; negative = cash is being consumed.

**Purpose:** Period-level cash health summary. Negative net cash flow for a single month is not alarming if it corresponds to a launch month (high ad spend, COD settlement lag). Sustained negative net cash flow is a solvency warning.

**Formula:**
```
Net Cash Flow = Cash Inflow (G-01) − Cash Outflow (G-02)
```

**SQL Logic (Pseudocode):**
```
inflow  = [G-01 for period]
outflow = [G-02 for period]
Net Cash Flow = inflow - outflow
```

**Source Tables:** `bank_transactions`, `kpi_monthly_snapshot` (cash_collected_inr, computed outflow)

**Refresh Frequency:** Daily

**Dashboard Location:** Finance Dashboard → Net Cash Flow Card / Waterfall

**Alert Thresholds:**
| Level | Condition | Action |
|-------|-----------|--------|
| Critical | Negative NCF AND Net Cash Position < ₹1,00,000 | Immediate cash preservation; pause discretionary spend |
| Warning | Negative NCF for 2+ consecutive months | Investigate structural causes; review ad spend and COGS |
| OK | Positive NCF | Business generating more cash than it spends in operating costs |

**Drill-down Capability:**
- Monthly NCF waterfall (inflow bars vs outflow bars)
- Cumulative NCF trend
- NCF vs forecast (from cashflow_forecasts)

**Reconciliation Notes / Exclusions / Edge Cases:**
- Net Cash Flow ≠ Net Revenue. Net Revenue is accrual-basis; Net Cash Flow is cash-basis. The two will converge over time but diverge in any given month due to settlement lag.
- For a complete picture: Net Cash Flow + COD Outstanding (G-06) ≈ period revenue cash picture.

---

### G-04: Monthly Burn Rate

**Business Definition:** The average monthly net cash consumed by operational expenses, calculated over the last 3 months. Excludes supplier payments (capex) and founder transfers (equity).

**Purpose:** Sustainability metric. Answers: "At this cost level, how fast is Kirgo consuming cash if revenue were to stop?" Used to set the Runway metric (G-05).

**Formula:**
```
Monthly Burn Rate = AVG(Cash Outflow per month, last 3 complete months)
```

**SQL Logic (Pseudocode):**
```
SELECT AVG(monthly_outflow)
FROM (
  SELECT DATE_TRUNC('month', bt.transaction_date) AS month,
         SUM(bt.withdrawal_inr) AS monthly_outflow
  FROM bank_transactions bt
  WHERE bt.transaction_type IN (
    'shiprocket_recharge', 'courier_payment',
    'ad_spend_meta', 'ad_spend_google',
    'saas_subscription', 'customer_refund', 'bank_charge'
  )
  AND bt.transaction_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '3 months'
  AND bt.transaction_date < DATE_TRUNC('month', CURRENT_DATE)
  GROUP BY 1
)
```

**Source Tables:** `bank_transactions`

**Refresh Frequency:** Monthly

**Dashboard Location:** Finance Dashboard → Burn Rate Panel

**Alert Thresholds:** Contextual — compare against G-05 (Runway).

**Drill-down Capability:**
- Burn rate by category (ad spend vs shipping vs SaaS vs refunds)
- Burn rate trend (is it increasing with ad spend scale-up?)
- Fixed vs variable burn split

**Reconciliation Notes / Exclusions / Edge Cases:**
- Burn rate is meaningful only when ad spend is stable. A launch month with ₹20,000 ad spend followed by two months at ₹0 will produce a misleadingly low 3-month average.
- For a more accurate structural burn rate, compute separately: Fixed Burn (SaaS + bank charges ~₹1,500/month) vs Variable Burn (shipping + ad spend + refunds).

---

### G-05: Cash Runway

**Business Definition:** Number of months the business can continue operating at the current burn rate given the current bank balance, assuming zero revenue.

**Purpose:** Stress test metric. Not a forecast (the cashflow_forecasts table accounts for incoming revenue). Rather, it answers: "In the worst case, if all sales stop today, how long before we run out of cash?"

**Formula:**
```
Cash Runway (months) = Net Cash Position / Monthly Burn Rate
```

**SQL Logic (Pseudocode):**
```
cash    = [A-06: latest closing_balance_inr]
burn    = [G-04: 3-month average monthly burn rate]
Runway  = cash / NULLIF(burn, 0)
```

**Source Tables:** `bank_transactions`

**Refresh Frequency:** Monthly

**Dashboard Location:** Finance Dashboard → Runway Panel

**Alert Thresholds:**
| Level | Condition | Action |
|-------|-----------|--------|
| Critical | < 2 months runway | Immediate capital preservation; no discretionary spend |
| Warning | 2–4 months runway | Reduce burn; accelerate COD collection; contact founder for contingency plan |
| OK | > 4 months runway | Comfortable; L4 deposit can proceed |

**Drill-down Capability:**
- Runway sensitivity: "What if burn rate increases 20% with L4 ad spend?"
- Runway vs cashflow forecast comparison (forecast-based runway is longer due to expected inflows)

**Reconciliation Notes / Exclusions / Edge Cases:**
- This is a zero-revenue stress test — actual runway is much longer because the business is generating revenue.
- A more useful live metric is `Expected Closing Balance` from `cashflow_forecasts.expected_closing_balance_inr` — this is the actual forward-looking view.
- Runway drops sharply when a large supplier payment is made (e.g., L4 deposit ~₹1,50,000). Model this explicitly in the cashflow_forecast before initiating the payment.

---

### G-06: COD Outstanding

**Business Definition:** Total INR value of COD orders that have been delivered to customers but whose cash has not yet been remitted to the HDFC bank account by Shiprocket.

**Purpose:** Settlement lag visibility. COD outstanding is revenue earned but cash not yet received. High COD outstanding with low bank balance is a short-term liquidity gap that resolves automatically as Shiprocket remits CRF batches.

**Formula:**
```
COD Outstanding =
  SUM(shipments.cod_payable_inr)
  WHERE payment_method = 'cod'
    AND status = 'DELIVERED'
    AND (cod_crf_id IS NULL
         OR cod_crf_id NOT IN [CRF IDs matched to bank_transactions])
```

**SQL Logic (Pseudocode):**
```
-- Delivered COD shipments with no matching bank credit
SELECT SUM(s.cod_payable_inr)
FROM shipments s
WHERE s.payment_method = 'cod'
  AND s.status = 'DELIVERED'
  AND s.cod_crf_id IS NULL
    OR s.cod_crf_id NOT IN (
      SELECT extracted_reference
      FROM bank_transactions
      WHERE transaction_type = 'cod_remittance'
    )
```

**Source Tables:** `shipments`, `bank_transactions`

**Refresh Frequency:** Daily

**Dashboard Location:** Finance Dashboard → COD Outstanding Card (alongside Cash Position)

**Alert Thresholds:**
| Level | Condition | Action |
|-------|-----------|--------|
| Watch | COD Outstanding > ₹50,000 AND bank balance low | Verify Shiprocket COD remittance schedule; follow up if CRF > 14 days old |
| OK | COD Outstanding resolves within 14 days | Normal Shiprocket T+7 to T+14 cycle |

**Drill-down Capability:**
- COD outstanding by CRF ID (which batches are pending)
- Age of outstanding COD (days since delivery — those > 14 days may require follow-up)
- COD outstanding vs total COD revenue this month (% collected)

**Reconciliation Notes / Exclusions / Edge Cases:**
- COD orders that are still `IN_TRANSIT` or `OUT_FOR_DELIVERY` are excluded — they have not yet been delivered.
- RTO'd COD orders are excluded — the COD amount is returned to the customer or never collected.
- CRF ID matching logic: `shipments.cod_crf_id = bank_transactions.extracted_reference` where `transaction_type = 'cod_remittance'`. A CRF ID appearing in both confirms remittance.
- COD remittance lag: T+7 to T+14 from delivery date. Outstanding amounts beyond 14 days should trigger a Shiprocket support ticket.

---

## Group H: Forecast KPIs

---

### H-01: Revenue Forecast (LA-WMA)

**Business Definition:** The Launch-Adjusted Weighted Moving Average model's point estimate and confidence interval for revenue in the next 1, 2, and 3 months, per collection and in aggregate.

**Purpose:** Forward planning tool. Drives decisions on ad spend budgeting, staffing (if applicable), cash reserve requirements, and launch timing. Uses the decay curve model calibrated to actual Kirgo revenue patterns (FORECASTING_MODEL.md §2).

**Formula:**
```
Forecast(t) = WMA(monthly_revenue, weights=[3/6, 2/6, 1/6])
            × Launch_Phase_Factor(months_since_launch)
            × Stock_Availability_Factor(current_stock)
            [× 1.20 if forecast_month is February]

Where:
  WMA = weighted moving average of last 3 months of actuals for this collection
  Launch Phase Factors: Month 1: 1.0, Month 2: 0.90, Month 3–4: 0.75,
                        Month 5–6: 0.60, Month 7–9: 0.40, Month 10+: 0.20
  Stock Availability: stock=0 → 0.0; <10 → 0.3; <30 → 0.7; ≥30 → 1.0
```

**SQL Logic (Pseudocode):**
```
-- Read current forecast from pre-computed table
SELECT rf.forecast_month, l.name, rf.forecast_revenue_inr,
       rf.confidence_low_inr, rf.confidence_high_inr,
       rf.launch_phase_factor, rf.stock_availability_factor
FROM revenue_forecasts rf
JOIN launches l ON l.id = rf.launch_id
WHERE rf.is_current = true
  AND rf.forecast_month >= DATE_TRUNC('month', CURRENT_DATE)
ORDER BY rf.forecast_month, rf.launch_id
```

**Source Tables:** `revenue_forecasts`, `kpi_monthly_snapshot` (actuals input), `inventory_forecasts` (stock input), `launches`

**Refresh Frequency:** On demand (triggered by analyst) and nightly automated run

**Dashboard Location:** Forecast Dashboard → Revenue Forecast Panel (3-month horizon)

**Alert Thresholds:**
| Level | Condition | Action |
|-------|-----------|--------|
| Watch | Forecast < ₹30,000 / month | Revenue runway is insufficient to cover monthly burn |
| Watch | Confidence interval width > 100% of point estimate | High uncertainty; investigate data freshness |

**Drill-down Capability:**
- Forecast by collection (Core, Summer, aggregate)
- 80% confidence interval band chart
- Model inputs: launch phase factor, stock availability factor, planned ad spend
- Forecast vs actual (for closed months where actual_revenue_inr has been back-filled)

**Reconciliation Notes / Exclusions / Edge Cases:**
- The model requires at least 3 months of actuals for the same collection to compute WMA. For brand-new launches (L4), the first month forecast = L3 launch-month revenue × seasonal adjustment (no WMA available yet).
- February seasonality multiplier (1.20×) is applied regardless of which collection is active — calibrated from Feb 2024 and Feb 2026 peaks.
- When multiple collections are simultaneously active (Summer + Core), their forecasts are summed — the model assumes no cannibalisation (FORECASTING_MODEL.md §2.4). Validate this assumption once cross-sell data is available.
- The stock availability factor will gate the forecast to zero when a SKU is sold out. This means total forecast automatically accounts for depletion.
- `is_current = false` rows represent historical forecast snapshots — useful for accuracy tracking (H-04).

---

### H-02: Cash Forecast

**Business Definition:** Monthly projected cash position for the next 3 months, accounting for settlement lag on revenue, planned outflows (ad spend, supplier payments, SaaS), and RTO/return provisions.

**Purpose:** Answers the single most critical financial question for a capital-light D2C brand: "Will we have enough cash to make the L4 supplier deposit?" Bridges the gap between revenue recognition (delivery date) and actual cash receipt.

**Formula:**
```
Expected Closing Balance =
  Opening Bank Balance
  + (Prepaid Revenue × (1 − 0.02 gateway fee)) × settlement lag factor
  + (COD Revenue × (1 − COD charge % − RTO rate)) × COD lag factor
  − Expected Shipping Cost
  − Expected Ad Spend
  − Expected Supplier Payments
  − Expected SaaS Cost
  − Expected RTO Cost
  − Expected Refund Cost
  − Other OpEx
```

**SQL Logic (Pseudocode):**
```
-- Read current cashflow forecast
SELECT cf.forecast_month, cf.opening_balance_inr,
       cf.expected_total_inflow_inr, cf.expected_total_outflow_inr,
       cf.expected_net_cashflow_inr, cf.expected_closing_balance_inr,
       cf.actual_closing_balance_inr   -- NULL until month closes
FROM cashflow_forecasts cf
WHERE cf.is_current = true
  AND cf.forecast_month >= DATE_TRUNC('month', CURRENT_DATE)
ORDER BY cf.forecast_month
```

**Source Tables:** `cashflow_forecasts`, `bank_transactions` (opening balance), `revenue_forecasts` (inflow basis)

**Refresh Frequency:** On demand and nightly

**Dashboard Location:** Finance Dashboard → Cash Forecast Panel (3-month horizon with actual vs forecast overlay)

**Alert Thresholds:**
| Level | Condition | Action |
|-------|-----------|--------|
| Critical | Forecast closing balance < ₹0 in any month | Cash crisis projected; immediate action required |
| Warning | Forecast closing balance < ₹50,000 in any month | Very tight; defer non-critical outflows |
| Watch | Forecast closing balance < ₹1,50,000 (L4 deposit threshold) | L4 deposit at risk; delay start or seek bridge capital |

**Drill-down Capability:**
- Month-by-month cash waterfall (opening → inflows → outflows → closing)
- Sensitivity analysis: "What if COD mix is 50% instead of 35%?"
- Actual vs forecast overlay for closed months

**Reconciliation Notes / Exclusions / Edge Cases:**
- Key operator inputs (must be entered before generating forecast): `planned_ad_spend`, `expected_supplier_payment`, `expected_rto_rate`, `expected_return_rate` (per FORECASTING_MODEL.md §5).
- The prepaid settlement lag assumption (T+3) and COD lag assumption (T+10) are stored in `cashflow_forecasts.prepaid_settlement_lag_days` and `cod_settlement_lag_days`. They can be overridden per forecast run.
- `actual_closing_balance_inr` is back-filled from `bank_transactions` after the month closes, enabling forecast vs actual comparison.
- Gateway fees (~2%) are embedded in the inflow calculation as an approximation. Actual gateway fees are not itemised in the current source data (DATA_DICTIONARY.md Appendix E).

---

### H-03: Inventory Depletion Forecast

**Business Definition:** Per-variant projection of stockout date and alert level, based on current stock and 30-day rolling sales velocity.

**Purpose:** Triggers the most time-sensitive operational decision: when to reorder. Supplier lead time for Kirgo's China-based manufacturers is 60–90 days minimum. The forecast must give 90+ days of warning for a smooth reorder cycle.

**Formula:**
```
Projected Stockout Date[variant] =
  snapshot_date + CEIL(current_stock / daily_velocity_30d)

Alert Level:
  current_stock / daily_velocity_30d > 60 days → 'ok'
  30–60 days → 'watch'
  14–30 days → 'warning'
  < 14 days → 'critical'
```

**SQL Logic (Pseudocode):**
```
SELECT pv.sku, pv.size, p.name, l.code,
       inf.current_stock, inf.daily_velocity_30d, inf.daily_velocity_7d,
       inf.days_to_stockout_30d, inf.projected_stockout_date,
       inf.alert_level, inf.reorder_recommended, inf.units_to_reorder
FROM inventory_forecasts inf
JOIN product_variants pv ON pv.id = inf.variant_id
JOIN products p ON p.id = pv.product_id
JOIN launches l ON l.id = p.launch_id
WHERE inf.is_current = true
ORDER BY inf.alert_level DESC,  -- critical first
         inf.days_to_stockout_30d ASC
```

**Source Tables:** `inventory_forecasts`, `product_variants`, `products`, `launches`

**Refresh Frequency:** Daily

**Dashboard Location:** Forecast Dashboard → Inventory Depletion Panel; critical alerts surfaced on Executive Dashboard

**Alert Thresholds:** Same as E-03 (Days of Inventory). `alert_level` column on `inventory_forecasts` is the authoritative trigger.

**Drill-down Capability:**
- Full variant table sorted by urgency (critical → warning → watch → ok)
- 7-day velocity vs 30-day velocity comparison (spike detection)
- Historical stockout accuracy (when a variant went critical, did actual stockout match prediction?)
- Size distribution of critical alerts (is the issue size-specific?)

**Reconciliation Notes / Exclusions / Edge Cases:**
- When `daily_velocity_30d = 0`, `projected_stockout_date = NULL`. The variant is at risk of being classified as dead stock (E-04) — check both forecasts together.
- 7-day velocity (`daily_velocity_7d`) is shown alongside 30-day velocity to detect sudden demand spikes (e.g., post-launch or viral social media). If 7d >> 30d, days_to_stockout is actually shorter than the forecast suggests.
- Accuracy of this forecast degrades as velocity changes. Nightly recomputation ensures the alert level reflects the most recent 30 days.
- `reorder_recommended = true` is set when `days_to_stockout_30d < 30`. `units_to_reorder` = MAX(0, daily_velocity_30d × 90 − current_stock).

---

### H-04: Forecast Accuracy

**Business Definition:** The percentage accuracy of past revenue forecasts compared to actuals, measured as 1 − |actual − forecast| / actual × 100. Computed for all closed months where both `forecast_revenue_inr` and `actual_revenue_inr` are populated.

**Purpose:** Quality control on the LA-WMA model. If accuracy drops below 60%, the model needs recalibration. Tracks whether forecast quality improves over time as more historical data accumulates.

**Formula:**
```
Forecast Accuracy % = 1 − |actual_revenue_inr − forecast_revenue_inr| / actual_revenue_inr × 100

Blended Accuracy = AVG(forecast_accuracy_pct)
  WHERE actual_revenue_inr IS NOT NULL
    AND is_current = false   -- only superseded forecasts have back-filled actuals
```

**SQL Logic (Pseudocode):**
```
SELECT rf.forecast_month, l.name,
       rf.forecast_revenue_inr, rf.actual_revenue_inr,
       rf.forecast_accuracy_pct,
       rf.launch_phase_factor, rf.stock_availability_factor
FROM revenue_forecasts rf
JOIN launches l ON l.id = rf.launch_id
WHERE rf.actual_revenue_inr IS NOT NULL
ORDER BY rf.forecast_month DESC
```

**Source Tables:** `revenue_forecasts`, `kpi_monthly_snapshot` (source of actuals for back-fill)

**Refresh Frequency:** Monthly (updated when `actual_revenue_inr` is back-filled after month close)

**Dashboard Location:** Forecast Dashboard → Model Performance Panel

**Alert Thresholds:**
| Level | Condition | Action |
|-------|-----------|--------|
| Critical | Blended accuracy < 50% | Model needs recalibration; review launch phase factors |
| Warning | Blended accuracy 50–70% | Below target; check if stock availability factor is being applied correctly |
| OK | Blended accuracy ≥ 70% | Target per FORECASTING_MODEL.md §6 |
| Excellent | ≥ 85% | Well-calibrated; useful for supplier and cash planning |

**Drill-down Capability:**
- Accuracy per month (which months were under/over-forecast and by how much)
- Accuracy by collection (does the model perform better for some launches?)
- Systematic bias check: is the model consistently over-forecasting or under-forecasting?
- Model version tracking (compare la-wma-v1 accuracy if a v2 is ever created)

**Reconciliation Notes / Exclusions / Edge Cases:**
- Accuracy is undefined (NULL) for months where `actual_revenue_inr = 0` — this would indicate a month with no deliveries, not a model failure.
- Only the `is_current = false` rows for closed months carry back-filled actuals. The latest active forecast (`is_current = true`) does not have actuals yet.
- When the model is first deployed, there will be no accuracy history. The first meaningful accuracy measurement comes 2 months after the first forecast is generated.
- Accuracy for months during a stock-out event will appear artificially low (model forecasts revenue; stock ran out → actual = 0). These months should be tagged and excluded from model accuracy assessment.

---

## Dashboard Priority Reference

| Priority | KPI | ID | Refresh | Dashboard |
|----------|-----|----|---------|-----------|
| P1 | Monthly Gross Revenue | A-01 | Daily | Executive |
| P1 | Net Cash Position | A-06 | Daily | Executive |
| P1 | Orders Delivered | A-03 | Daily | Executive |
| P1 | AOV | A-04 | Daily | Executive |
| P1 | Net Revenue | A-02 | Daily | Executive |
| P1 | Days of Inventory Remaining | E-03 | Daily | Inventory / Executive |
| P1 | Stock Cover Days (Collection) | E-05 | Daily | Inventory |
| P1 | Inventory Value at Cost | E-01 | Real-time | Inventory |
| P1 | Revenue by Launch | B-04 | Daily | Sales |
| P1 | Blended Gross Margin % | D-01 | Weekly | Profitability |
| P1 | Launch Profitability | D-05 | Per Launch | Profitability |
| P1 | Cash Inflow | G-01 | Daily | Finance |
| P1 | Cash Outflow | G-02 | Daily | Finance |
| P1 | Net Cash Flow | G-03 | Daily | Finance |
| P1 | COD Outstanding | G-06 | Daily | Finance |
| P1 | Revenue Forecast | H-01 | Nightly | Forecast |
| P1 | Cash Forecast | H-02 | Nightly | Finance / Forecast |
| P1 | Inventory Depletion Forecast | H-03 | Daily | Inventory / Forecast |
| P2 | Active Customers (30D) | A-05 | Daily | Executive |
| P2 | Gross Revenue (configurable) | B-01 | Daily | Sales |
| P2 | Units Sold | B-03 | Daily | Sales |
| P2 | RTO Rate % | C-03 | Weekly | Operations |
| P2 | RTO Value | C-04 | Weekly | Operations |
| P2 | Return Rate % | C-01 | Weekly | Operations |
| P2 | Delivery Success Rate % | C-05 | Weekly | Operations |
| P2 | Contribution Margin % | D-02 | Monthly | Profitability |
| P2 | Product Profitability | D-04 | Weekly | Profitability |
| P2 | Dead Stock % | E-04 | Weekly | Inventory |
| P2 | Reorder Quantity | E-06 | Daily | Inventory |
| P2 | ROAS | F-01 | Monthly | Marketing |
| P2 | CAC | F-03 | Monthly | Marketing |
| P2 | Repeat Purchase Rate | F-05 | Monthly | Marketing |
| P2 | Net Margin % | D-03 | Monthly | Profitability |
| P2 | Monthly Burn Rate | G-04 | Monthly | Finance |
| P2 | Cash Runway | G-05 | Monthly | Finance |
| P2 | Return Value | C-02 | Weekly | Operations |
| P2 | Forecast Accuracy | H-04 | Monthly | Forecast |
| P3 | Revenue by Product | B-05 | Weekly | Sales |
| P3 | Revenue by State | B-06 | Weekly | Sales |
| P3 | Average Delivery Days | C-06 | Weekly | Operations |
| P3 | Courier Performance Score | C-07 | Weekly | Operations |
| P3 | Inventory Turnover | E-02 | Monthly | Inventory |
| P3 | MER | F-02 | Monthly | Marketing |
| P3 | LTV | F-04 | Monthly | Marketing |
| P3 | Net Revenue (configurable) | B-02 | Daily | Sales |
