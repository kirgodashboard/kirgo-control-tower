# Kirgo Control Tower — Forecasting Model
**Phase:** Blueprint  
**Scope:** Revenue, inventory depletion, and cashflow forecasting over a 90-day rolling horizon

---

## 1. Why Not ARIMA or ML

At Kirgo's current scale (7–34 orders/month, 3 launches, 32 months of history), statistical time-series models (ARIMA, Prophet, LSTM) are inappropriate because:

1. **Too few observations:** 32 months total, with multiple structural breaks (launch events reset the demand pattern).
2. **Non-stationary by design:** Each launch creates a new product line; past demand for Classic is not informative for Core demand.
3. **Launch-gated inventory:** Demand is bounded by physical stock. The model must stop forecasting revenue when stock hits zero.

The appropriate model is a **Launch-Adjusted Weighted Moving Average (LA-WMA)** combined with a **Stock Depletion Gate**.

---

## 2. Revenue Forecast Model

### 2.1 Core Logic

For each active collection at time `t`:

```
Forecast(t) = WMA(monthly_revenue, weights) × Launch_Phase_Factor(t) × Stock_Availability_Factor(t)
```

**WMA weights:** Last 3 months — weight 3/6, 2/6, 1/6 (most recent weighted highest).  
Apply to months that share the same launch phase (e.g., only months where Core was active).

### 2.2 Launch Phase Factor

Each collection follows a decay curve post-launch:

| Month Since Launch | Phase | Factor |
|-------------------|-------|--------|
| 1 | Launch spike | 1.0 (baseline, no adjustment) |
| 2 | Momentum | 0.90 |
| 3–4 | Steady state | 0.75 |
| 5–6 | Decay | 0.60 |
| 7–9 | Long tail | 0.40 |
| 10+ | Depletion | 0.20 |

**Calibrated from actual data:**
- Classic L1: Oct 2023 ₹29k → Feb 2024 ₹87k (peak, month 4) → steady decline to ₹8k by Dec 2024
- Summer L2: May 2025 ₹57k (launch) → Aug 2025 ₹63k (peak, month 4) → ₹8k Dec 2025
- Core L3: Jan 2026 ₹69k → Feb 2026 ₹98k (peak, month 2) — higher AOV compresses the curve

**Note:** The Feb 2024 and Feb 2026 peaks suggest strong February performance (possibly Valentine's/gifting). A February seasonality multiplier of 1.2× should be applied when forecasting Feb months.

### 2.3 Stock Availability Factor

```python
def stock_availability_factor(sku_id, forecast_units):
    stock = current_stock_on_hand(sku_id)
    if stock <= 0:
        return 0.0          # SKU sold out
    elif stock < 10:
        return 0.3          # Near sold-out, reduced demand signal
    elif stock < 30:
        return 0.7          # Low stock dampening
    else:
        return 1.0          # Fully available
```

Applied per variant. Collection-level forecast aggregates variant factors weighted by historical sales mix.

### 2.4 Multi-Collection Blending

When multiple collections are active simultaneously (e.g., Summer + Core both in stock), total revenue forecast is:

```
Total Forecast = Σ (Collection_i Forecast)
```

Collections do not cannibalise each other in this model — they are treated as complementary (different styles/price points). Validate this assumption once cross-sell data is available.

---

## 3. Inventory Depletion Forecast

### 3.1 Velocity Calculation

For each variant:

```
Daily Velocity = Units sold in last 30 days / 30
```

Smoothed with a 7-day trailing average to handle lumpy daily orders.

### 3.2 Days to Stockout

```
Days to Stockout = Stock on Hand / Daily Velocity
```

If `Daily Velocity = 0` (no recent sales): use collection-level decay model to estimate reactivation.

### 3.3 Stockout Alert Rules

| Days to Stockout | Alert Level | Action |
|-----------------|------------|--------|
| < 14 | Critical | Trigger reorder, alert dashboard red |
| 14–30 | Warning | Initiate supplier contact, dashboard yellow |
| 30–60 | Watch | Forecast review |
| > 60 | OK | Dashboard green |

### 3.4 Size Distribution Insight (from current data)
Based on Core collection (most recent, detailed size data):
- M is the highest-volume size (60/200 = 30% of opening stock)
- S is close second (60/200 = 30%)
- L third (60/200 = 30%)
- XS and XL are minor (10/200 = 5% each)

This size distribution should inform future purchase order quantities.

---

## 4. Cashflow Forecast Model

### 4.1 Cash Inflow Forecast

For a given future month:

```
Expected Cash Inflow = 
  (Prepaid Revenue × (1 − gateway_fee_pct)) × settlement_lag_factor
  + (COD Revenue × (1 − cod_charge_pct − rto_rate)) × cod_settlement_lag_factor
```

**Estimated rates (pending actual measurement):**
- Gateway fee (EaseBuzz/Infibeam): ~2% of transaction value
- Shiprocket COD charge: ₹49–₹110 per order (varies by zone — from shipments data)
- RTO Rate: Measure from shipments table (currently blank — needs historical analysis)
- Prepaid settlement lag: T+3 applied to monthly total (approximation)
- COD settlement lag: T+10 applied to monthly total (approximation)

### 4.2 Fixed Monthly Outflows

| Item | Amount (₹) | Frequency |
|------|-----------|-----------|
| Google Workspace | 1,227.20 | Monthly (3rd of month) |
| Shiprocket wallet top-ups | ~1,500–2,000 | Weekly (based on order volume) |
| (Ad spend) | Variable | Per campaign run |

### 4.3 Variable Monthly Outflows

```
Shipping Cost = Units shipped × avg freight rate by zone mix
COD charges = COD units × avg COD rate
Refunds = Delivered units × return_rate × avg order value
```

### 4.4 Supplier Payment Schedule

Supplier payments are large, infrequent, and must be modelled explicitly:

```
Next payment event = Purchase order signed → 30% deposit (Day 0)
                    → 70% balance before shipment (Day ~30)
```

For L4 (Flare, planned): Estimate ₹5,00,000 total investment.  
Deposit (~₹1,50,000) likely due June/July 2026.  
Balance (~₹3,50,000) likely due August/September 2026.

---

## 5. Forecast Inputs (Operator-Provided)

The following must be entered manually in the Control Tower UI before generating a forecast:

| Input | Description | Default |
|-------|-------------|---------|
| `planned_ad_spend` | Monthly ad budget (₹) | 0 |
| `next_launch_date` | Date of L4 launch | 2026-07-01 |
| `l4_opening_stock` | Units per variant | TBD |
| `l4_avg_selling_price` | Expected ASP | TBD |
| `expected_rto_rate` | Estimated RTO % | 10% |
| `expected_return_rate` | Expected return % | 3% |

---

## 6. Model Accuracy Tracking

Once the platform is live, track **forecast vs actual** monthly:

```
Forecast Accuracy = 1 − |Actual Revenue − Forecast Revenue| / Actual Revenue
```

Target accuracy: ≥ 70% within 90-day window.  
If accuracy drops below 60%, recalibrate Launch Phase Factors using the last 6 months of actuals.

---

## 7. Forecast Data Model

The forecasting module outputs to a dedicated table:

### `forecast_snapshots`

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| snapshot_date | date | When forecast was generated |
| forecast_month | date | First day of forecast month |
| scope | text | `revenue` / `inventory` / `cashflow` |
| variant_id | int FK | For inventory forecasts |
| collection_id | int FK | For revenue forecasts |
| forecast_value | numeric(12,2) | Forecasted amount or units |
| confidence_low | numeric(12,2) | Lower bound (80% CI) |
| confidence_high | numeric(12,2) | Upper bound (80% CI) |
| actual_value | numeric(12,2) | Filled in retrospectively |
| model_version | text | e.g. `la-wma-v1` |
| input_params | jsonb | Operator inputs used |
| created_at | timestamptz DEFAULT now() | |
