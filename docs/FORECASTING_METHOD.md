# Forecasting Methodology

## Overview

All projections in the Kirgo Control Tower are derived exclusively from real historical order, shipment, and financial data. No numbers are fabricated or estimated from industry benchmarks.

---

## Revenue Forecast

### Data Source
- Table: `orders` joined to `shipments` and `order_classifications`
- BR-201 exclusions applied: non-commercial orders (influencer_promotion, brand_seeding, internal_use, replacement) excluded from all revenue calculations
- Date dimension: `orders.ordered_at` (intake date, not delivery date)

### Baseline Calculation
The **baseline monthly revenue** = average of the trailing 3 complete calendar months of commercial orders. At generation time this was approximately ₹55,636/month (Jun 2026).

### Growth Rate
- Method: `REGR_SLOPE(revenue, month_index)` over 6 complete calendar months
- Result: MoM growth rate as a percentage of baseline
- Cap: floored at −5% and capped at +20% to prevent unrealistic extrapolation from sparse data
- At generation: 10.6% MoM observed growth

### Projection Formula
For each horizon (30D / 90D / 180D):

```
Conservative = baseline × months          (0% growth)
Expected     = baseline × Σ (1 + rate)^m  (compound at observed rate)
Optimistic   = baseline × Σ (1 + min(rate×1.5, 0.25))^m
```

Where `m` is month index 1..N and months = 1, 3, or 6.

### Chart Data
`get_forecast_chart_data()` returns:
- 13 trailing months of actuals (from `v_revenue_trend` or equivalent monthly group-by)
- 6 forward months of Conservative / Expected / Optimistic projections
- The last actual data point is bridged to the first projection point for visual continuity

---

## Cash Flow Forecast

### Assumption Derivation (all from historical data)

| Parameter | Source | Value |
|-----------|--------|-------|
| COGS % | `product_costs.landed_cost_inr` ÷ `AVG(order_total_inr)` | 53.5% |
| Shipping % | `shipments.freight_total_inr` ÷ `AOV` | 4.0% |
| Return rate % | `returns.refund_amount_inr` ÷ revenue | 14.8% |
| Total outflow % | COGS + Shipping + Returns | 72.3% |

### Outflow Limitation
Marketing spend, SaaS subscriptions, and other operating expenses are **excluded** from cash flow outflows. Expense data was not available at forecast generation time. Actual operating cash flow will be lower than modelled.

### Projection
- **Inflows** = Revenue forecast per scenario
- **Outflows** = Inflows × total_outflow_pct
- **Net** = Inflows − Outflows

---

## Customer Growth Forecast

### Data Source
- `customers` table for base count
- `orders` table for monthly new customer acquisition (first order per customer)
- Repeat customer detection: `COUNT(DISTINCT customer_id) WHERE order_count > 1`

### Note on `customers.created_at`
All records show `2026-06-17` — the batch seed date, not the actual acquisition date. The RPC therefore uses `MIN(ordered_at)` per customer from the orders table to determine acquisition month.

### Baseline
- Trailing 3-month average of new customers acquired per month ≈ 18/month
- Historical repeat rate = 14.8% (customers with more than 1 order ÷ total commercial customers)
- Existing customer base ≈ 620 (commercial orders with distinct customer_ids)

### Projection
For 6 forward months:

```
Conservative new/month = baseline × 0.90
Expected new/month     = baseline × (1 + revenue_growth_rate)   (mirrors revenue trend)
Optimistic new/month   = baseline × (1 + revenue_growth_rate × 1.5)
Active customers       = existing_base + cumulative_new
```

---

## Inventory Forecast

**Not implemented.** Inventory demand forecasting requires stock movement history with meaningful timestamps. Current inventory data was seeded in a single batch (2026-06-17) and does not contain historical inflow/outflow patterns needed to extrapolate forward velocity.

This will be implemented once inventory sync is live and at least 4–6 weeks of movement data are available.

---

## Scenario Definitions

| Scenario | Revenue Growth | Customer Growth | Use Case |
|----------|---------------|-----------------|----------|
| Conservative | 0% MoM (flat baseline) | −10% of baseline | Downside planning, minimum cash reserve |
| Expected | Observed trend (REGR_SLOPE) | Mirrors revenue trend | Base case operating plan |
| Optimistic | 1.5× observed trend (max 25% MoM) | 1.5× revenue trend | Upside / fundraise narrative |

---

## Limitations

1. **Sparse history**: Data available from ~Dec 2025. 6 months of commercial revenue is sufficient for a linear trend but not enough to detect seasonality.
2. **No seasonality model**: Projections use a single compound growth rate. Festival / launch peaks are not captured.
3. **Cash flow partial**: Operating expenses (marketing, SaaS, office) excluded. Actual net cash is lower.
4. **Customer base uncertainty**: `customers.created_at` is unreliable (batch seed). Acquisition timeline inferred from order dates.
5. **Growth rate cap**: Observed growth (10.6% MoM) may overstate sustainable trend. Conservative scenario is the more conservative planning anchor.
6. **No Monte Carlo / confidence intervals**: Scenarios are deterministic point estimates, not probability distributions.

---

## Key SQL Functions

| Function | Returns | Notes |
|----------|---------|-------|
| `get_revenue_forecast()` | JSON | 30D/90D/180D × 3 scenarios |
| `get_cash_flow_forecast()` | JSON | Inflows/outflows/net per scenario |
| `get_customer_forecast()` | TABLE | 6 monthly rows |
| `get_forecast_chart_data()` | TABLE | 13 actuals + 6 projections |

All RPCs: `SECURITY DEFINER SET search_path = public`, granted to `anon` and `authenticated`.

Migration: `supabase/migrations/20260623_forecasting_rpcs.sql`
