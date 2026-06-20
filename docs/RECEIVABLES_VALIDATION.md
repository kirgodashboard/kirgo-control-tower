# Receivables Dashboard — Validation Reference

## SQL Source

| Migration | Description |
|-----------|-------------|
| `supabase/migrations/20260621_order_classification.sql` | Base receivables RPCs (V1) |
| `supabase/migrations/20260622_receivables_extended.sql` | Extended RPCs for full dashboard |

## Business Rules Applied

| Rule | Description |
|------|-------------|
| BR-201 | Exclude `influencer_promotion`, `brand_seeding`, `internal_use`, `replacement` from receivables |
| REC-001 | Also exclude `warranty` orders (receivables-specific addition to BR-201) |
| REC-002 | Settlement Pending = `gateway_settlements.bank_transaction_id IS NULL` |
| REC-003 | Expected Settlement Date = `shipments.cod_remittance_date` OR `delivered_at + 7 days` |

The canonical function `receivables_excluded_classes()` encodes all 5 excluded types.

## KPI Formulas

### 1. Total Receivables
```
total_receivables_inr = cod_pending_inr + settlement_pending_inr
```

### 2. COD Pending
```sql
SELECT SUM(o.order_total_inr), COUNT(*)
FROM order_classifications oc
JOIN orders o ON o.id = oc.order_id
WHERE oc.classification = 'cod_pending'
```
Note: cod_pending is by definition a genuine sale — warranty/promotion can't be cod_pending if classified correctly.

### 3. Settlement Pending
```sql
SELECT SUM(amount_inr), COUNT(*)
FROM gateway_settlements
WHERE bank_transaction_id IS NULL
```

### 4. Average Collection Days
```sql
SELECT AVG(CURRENT_DATE - o.ordered_at::date)
FROM order_classifications oc
JOIN orders o ON o.id = oc.order_id
WHERE oc.classification = 'cod_pending'
```

### 5. Overdue Amount (>30 days)
```sql
SELECT SUM(o.order_total_inr), COUNT(*)
FROM order_classifications oc
JOIN orders o ON o.id = oc.order_id
WHERE oc.classification = 'cod_pending'
  AND (CURRENT_DATE - o.ordered_at::date) > 30
```

### 6. Collection Efficiency %
```sql
SELECT
  ROUND(100.0 * SUM(CASE WHEN bank_transaction_id IS NOT NULL THEN amount_inr ELSE 0 END)
    / NULLIF(SUM(amount_inr), 0), 1)
FROM gateway_settlements
```
Measures the fraction of total gateway settlement value that has been matched to a bank credit.

## Ageing Buckets

| Bucket Key  | Days Outstanding | Color   |
|-------------|-----------------|---------|
| `current`   | 0–7 days        | Green   |
| `0_30`      | 8–30 days       | Sky     |
| `31_60`     | 31–60 days      | Amber   |
| `61_90`     | 61–90 days      | Orange  |
| `90_plus`   | 90+ days        | Red     |

## Validation Queries

Run these in the Supabase SQL Editor to validate dashboard values.

### Validate KPIs
```sql
SELECT get_receivables_kpis();
```

### Validate COD pending count matches customer table
```sql
SELECT COUNT(*) FROM order_classifications WHERE classification = 'cod_pending';
-- Should match cod_pending_count from get_receivables_kpis()
```

### Validate settlement pending
```sql
SELECT gateway, COUNT(*), SUM(amount_inr)
FROM gateway_settlements
WHERE bank_transaction_id IS NULL
GROUP BY gateway;
```

### Validate ageing
```sql
SELECT get_receivables_ageing();
-- Sum of all order_count values should equal cod_pending_count
-- Sum of all amount_inr values should equal cod_pending_inr
```

### Spot-check exclusions (should return 0 rows in customer receivables)
```sql
SELECT o.id, oc.classification
FROM order_classifications oc
JOIN orders o ON o.id = oc.order_id
WHERE oc.classification IN ('influencer_promotion','brand_seeding','internal_use','replacement','warranty')
  AND oc.classification = 'cod_pending';
-- Should return 0 rows (logically impossible but confirms no double-classification)
```

### Collection efficiency cross-check
```sql
SELECT
  COUNT(*) FILTER (WHERE bank_transaction_id IS NOT NULL) AS settled_count,
  COUNT(*) FILTER (WHERE bank_transaction_id IS NULL)     AS pending_count,
  SUM(amount_inr) FILTER (WHERE bank_transaction_id IS NOT NULL) AS settled_inr,
  SUM(amount_inr) FILTER (WHERE bank_transaction_id IS NULL)     AS pending_inr,
  ROUND(100.0 * SUM(amount_inr) FILTER (WHERE bank_transaction_id IS NOT NULL)
    / NULLIF(SUM(amount_inr), 0), 1)                             AS efficiency_pct
FROM gateway_settlements;
```

## Frontend Data Flow

```
get_receivables_kpis()          → useReceivablesKpis()          → KPI cards
get_customer_receivables(200)   → useCustomerReceivables()       → Customer Receivables table
get_cod_receivables(200)        → useCodReceivables()            → COD Receivables table
get_settlement_pending()        → useSettlementPending()         → Settlement Pending table
get_receivables_trend(90)       → useReceivablesTrend(90)        → Receivables Trend chart
get_receivables_ageing()        → useReceivablesAgeing()         → Ageing buckets + bar chart
get_collection_performance()    → useCollectionPerformance()     → Collection Performance chart
```

All hooks use `staleTime: 60_000` (1 minute).
