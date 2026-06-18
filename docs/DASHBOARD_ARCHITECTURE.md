# Kirgo Executive Dashboard — Architecture Specification
**Version:** 1.0  
**Date:** 2026-06-18  
**Stack:** Next.js 14 · TypeScript · Tailwind CSS · shadcn/ui · Recharts  
**Backend:** Supabase (PostgREST + RPC functions)  
**Status:** Approved for implementation

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Data Availability Matrix](#2-data-availability-matrix)
3. [SQL Views Required](#3-sql-views-required)
4. [Materialized Views](#4-materialized-views)
5. [KPI Snapshot Strategy](#5-kpi-snapshot-strategy)
6. [API Routes / Supabase RPCs](#6-api-routes--supabase-rpcs)
7. [Component Library](#7-component-library)
8. [Page Architecture](#8-page-architecture)
9. [Next.js Project Structure](#9-nextjs-project-structure)
10. [Implementation Order](#10-implementation-order)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    KIRGO CONTROL TOWER                          │
│                  Executive Dashboard V1                         │
├──────────────┬──────────────┬──────────────┬──────────────┬─────┤
│   Page 0     │   Page 1     │   Page 2     │   Page 3     │ P4  │
│  Director    │  Executive   │  Customer    │  Operations  │Fin. │
│  Command     │  Overview    │ Intelligence │  Command     │Cash │
│  Center ★   │              │              │  Center      │     │
├──────────────┴──────────────┴──────────────┴────────────────────┤
│                    Next.js 14 App Router                        │
│              TypeScript · Tailwind · shadcn/ui                  │
├─────────────────────────────────────────────────────────────────┤
│              API Layer: Supabase PostgREST + RPC                │
│          8 get_*_kpis() PostgreSQL functions                     │
├─────────────────────────────────────────────────────────────────┤
│                  Query Strategy (Phase 1)                       │
│         Raw tables → SQL views → PostgREST REST calls           │
│   (kpi_daily_snapshot empty — direct table queries until        │
│    Phase 2 compute scripts backfill snapshot tables)            │
├─────────────────────────────────────────────────────────────────┤
│                  Supabase Database                              │
│  orders · shipments · customers · order_lines · bank_txns       │
│  gateway_settlements · returns · product_variants · launches    │
└─────────────────────────────────────────────────────────────────┘
```

### Design Principles

| Principle | Implementation |
|-----------|---------------|
| Owner sees business health instantly | Page 0: 8 KPI cards + traffic-light alert panel above the fold — mission control aesthetic |
| CEO understands in 30 seconds | Page 1 hero row: 5 KPI cards, no scrolling above the fold |
| CFO manages in 5 minutes | Pages 2–4 drill-down with period selectors, export hooks |
| Data honesty | Empty state components for every blocked KPI (inventory, ad spend) |
| Snapshot-first, query-fallback | Read `kpi_daily_snapshot` if populated; fall back to raw SQL view |
| No server — only Supabase | All data via PostgREST REST API + RPC functions, no custom API server |
| Stripe/Shopify quality bar | shadcn/ui Card + Table primitives, Recharts for all charts |

---

## 2. Data Availability Matrix

| Dashboard Section | Data Source | Status | Notes |
|-------------------|-------------|--------|-------|
| Revenue KPIs | orders + shipments + order_lines | ✅ Available | Use DELIVERED rule |
| Orders & AOV | orders | ✅ Available | COUNT DISTINCT woocommerce_order_id |
| Customer metrics | customers + orders | ✅ Available | New vs repeat logic in view |
| Returns & RTOs | returns + shipments | ✅ Available | |
| COD vs Prepaid | orders.payment_method + shipments | ✅ Available | |
| Shipment status funnel | shipments | ✅ Available | |
| Cash inflow | bank_transactions | ✅ Available (2026 only) | Pre-2026 cash flows missing |
| Gateway settlements | gateway_settlements | ✅ Available | |
| COD reconciliation | bank_transactions + shipments | ✅ Available | |
| Inventory status | inventory_batches | ⛔ Blocked | No data — show empty state |
| Ad spend / ROAS | ad_spend_daily | ⛔ Blocked | No data — show empty state |
| Cash outflow / burn | expenses | ⚠️ Partial | No expense data yet |
| Product profitability | order_lines.variant_id | ⚠️ Partial | All NULL — blocked |
| Net margin | expenses | ⚠️ Partial | Requires expenses table data |

---

## 3. SQL Views Required

All views created in the `public` schema. PostgREST exposes them automatically.

### 3.1 `v_daily_revenue` — Page 1 trend chart

```sql
CREATE OR REPLACE VIEW v_daily_revenue AS
SELECT
  DATE_TRUNC('day', s.delivered_at)::date        AS revenue_date,
  COUNT(DISTINCT o.woocommerce_order_id)          AS orders_count,
  SUM(ol.line_total_inr)                          AS gross_revenue_inr,
  SUM(CASE WHEN o.payment_method != 'cod' 
       THEN ol.line_total_inr ELSE 0 END)         AS prepaid_revenue_inr,
  SUM(CASE WHEN o.payment_method = 'cod'
       THEN ol.line_total_inr ELSE 0 END)         AS cod_revenue_inr,
  COUNT(DISTINCT s.id)                            AS shipments_delivered,
  ROUND(SUM(ol.line_total_inr) /
    NULLIF(COUNT(DISTINCT o.woocommerce_order_id), 0), 2) AS aov_inr
FROM shipments s
JOIN orders o       ON o.id = s.order_id
JOIN order_lines ol ON ol.order_id = o.id
WHERE s.status = 'DELIVERED'
  AND s.delivered_at IS NOT NULL
GROUP BY 1
ORDER BY 1;
```

### 3.2 `v_monthly_revenue` — Page 1 period comparison

```sql
CREATE OR REPLACE VIEW v_monthly_revenue AS
SELECT
  DATE_TRUNC('month', s.delivered_at)::date       AS month,
  COUNT(DISTINCT o.woocommerce_order_id)           AS orders_count,
  SUM(ol.line_total_inr)                           AS gross_revenue_inr,
  ROUND(SUM(ol.line_total_inr) /
    NULLIF(COUNT(DISTINCT o.woocommerce_order_id), 0), 2) AS aov_inr,
  COUNT(DISTINCT o.customer_id)                    AS unique_customers,
  SUM(CASE WHEN o.payment_method = 'cod'  THEN 1 ELSE 0 END) AS cod_orders,
  SUM(CASE WHEN o.payment_method != 'cod' THEN 1 ELSE 0 END) AS prepaid_orders,
  ROUND(
    SUM(CASE WHEN o.payment_method = 'cod' THEN 1.0 ELSE 0 END) /
    NULLIF(COUNT(DISTINCT o.woocommerce_order_id), 0) * 100, 1
  )                                                AS cod_pct
FROM shipments s
JOIN orders o       ON o.id = s.order_id
JOIN order_lines ol ON ol.order_id = o.id
WHERE s.status = 'DELIVERED'
  AND s.delivered_at IS NOT NULL
GROUP BY 1
ORDER BY 1;
```

### 3.3 `v_customer_summary` — Page 2 customer intelligence

```sql
CREATE OR REPLACE VIEW v_customer_summary AS
WITH order_counts AS (
  SELECT
    o.customer_id,
    COUNT(DISTINCT o.woocommerce_order_id) AS total_orders,
    MIN(o.order_date)                      AS first_order_date,
    MAX(o.order_date)                      AS last_order_date,
    SUM(ol.line_total_inr)                 AS lifetime_revenue_inr
  FROM orders o
  JOIN order_lines ol ON ol.order_id = o.id
  GROUP BY o.customer_id
)
SELECT
  c.id,
  c.email,
  c.city,
  c.state,
  c.first_order_date,
  c.last_order_date,
  oc.total_orders,
  oc.lifetime_revenue_inr,
  CASE WHEN oc.total_orders > 1 THEN true ELSE false END AS is_repeat_customer,
  EXTRACT(DAY FROM NOW() - c.last_order_date)            AS days_since_last_order
FROM customers c
JOIN order_counts oc ON oc.customer_id = c.id;
```

### 3.4 `v_customer_growth_monthly` — Page 2 acquisition trend

```sql
CREATE OR REPLACE VIEW v_customer_growth_monthly AS
WITH first_orders AS (
  SELECT
    customer_id,
    MIN(order_date) AS first_order_date
  FROM orders
  GROUP BY customer_id
)
SELECT
  DATE_TRUNC('month', fo.first_order_date)::date  AS cohort_month,
  COUNT(*)                                         AS new_customers,
  SUM(COUNT(*)) OVER (
    ORDER BY DATE_TRUNC('month', fo.first_order_date)
  )                                                AS cumulative_customers
FROM first_orders fo
GROUP BY 1
ORDER BY 1;
```

### 3.5 `v_top_cities` — Page 2 geographic distribution

```sql
CREATE OR REPLACE VIEW v_top_cities AS
SELECT
  COALESCE(NULLIF(TRIM(c.city), ''), 'Unknown')    AS city,
  c.state,
  COUNT(DISTINCT c.id)                             AS customer_count,
  COUNT(DISTINCT o.woocommerce_order_id)           AS order_count,
  SUM(ol.line_total_inr)                           AS revenue_inr
FROM customers c
JOIN orders o       ON o.customer_id = c.id
JOIN order_lines ol ON ol.order_id = o.id
GROUP BY 1, 2
ORDER BY 3 DESC;
```

### 3.6 `v_shipment_funnel` — Page 3 operations

```sql
CREATE OR REPLACE VIEW v_shipment_funnel AS
SELECT
  DATE_TRUNC('month', o.order_date)::date  AS month,
  COUNT(DISTINCT o.woocommerce_order_id)   AS total_orders,
  SUM(CASE WHEN s.status = 'DELIVERED'     THEN 1 ELSE 0 END) AS delivered,
  SUM(CASE WHEN s.status = 'IN_TRANSIT'    THEN 1 ELSE 0 END) AS in_transit,
  SUM(CASE WHEN s.status = 'PENDING'       THEN 1 ELSE 0 END) AS pending,
  SUM(CASE WHEN s.status = 'RTO'           THEN 1 ELSE 0 END) AS rto,
  SUM(CASE WHEN s.status = 'LOST'          THEN 1 ELSE 0 END) AS lost,
  SUM(CASE WHEN s.status = 'CANCELLED'     THEN 1 ELSE 0 END) AS cancelled,
  ROUND(
    SUM(CASE WHEN s.status = 'DELIVERED' THEN 1.0 ELSE 0 END) /
    NULLIF(COUNT(DISTINCT o.woocommerce_order_id), 0) * 100, 1
  )                                        AS delivery_success_pct,
  ROUND(
    SUM(CASE WHEN s.status = 'RTO' THEN 1.0 ELSE 0 END) /
    NULLIF(COUNT(DISTINCT o.woocommerce_order_id), 0) * 100, 1
  )                                        AS rto_rate_pct
FROM orders o
LEFT JOIN shipments s ON s.order_id = o.id
GROUP BY 1
ORDER BY 1;
```

### 3.7 `v_returns_analysis` — Page 3 returns deep-dive

```sql
CREATE OR REPLACE VIEW v_returns_analysis AS
SELECT
  DATE_TRUNC('month', r.return_date)::date  AS month,
  r.return_reason,
  COUNT(*)                                   AS return_count,
  SUM(r.refund_amount_inr)                   AS refund_amount_inr,
  COUNT(DISTINCT r.order_id)                 AS orders_affected
FROM returns r
GROUP BY 1, 2
ORDER BY 1, 3 DESC;
```

### 3.8 `v_cod_outstanding` — Page 3 + Page 4

```sql
CREATE OR REPLACE VIEW v_cod_outstanding AS
SELECT
  s.id                AS shipment_id,
  s.awb_number,
  s.cod_payable_inr,
  s.delivered_at,
  s.cod_crf_id,
  EXTRACT(DAY FROM NOW() - s.delivered_at) AS days_outstanding
FROM shipments s
WHERE s.payment_method = 'cod'
  AND s.status = 'DELIVERED'
  AND s.cod_payable_inr > 0
  AND (
    s.cod_crf_id IS NULL
    OR s.cod_crf_id NOT IN (
      SELECT extracted_reference
      FROM bank_transactions
      WHERE transaction_type = 'cod_remittance'
        AND extracted_reference IS NOT NULL
    )
  );
```

### 3.9 `v_cash_flow_daily` — Page 4 finance

```sql
CREATE OR REPLACE VIEW v_cash_flow_daily AS
SELECT
  bt.transaction_date,
  SUM(CASE WHEN bt.amount_inr > 0  THEN bt.amount_inr ELSE 0 END)  AS inflow_inr,
  SUM(CASE WHEN bt.amount_inr < 0  THEN ABS(bt.amount_inr) ELSE 0 END) AS outflow_inr,
  SUM(bt.amount_inr)                                                AS net_inr,
  bt.transaction_type,
  COUNT(*)                                                          AS transaction_count
FROM bank_transactions bt
GROUP BY 1, 5
ORDER BY 1;
```

### 3.11 `v_system_alerts` — Page 0 Director Command Center

Derives traffic-light alerts from live data. Each row is one active alert.

```sql
CREATE OR REPLACE VIEW v_system_alerts AS

-- RED: Import errors in last 7 days
SELECT
  'RED'                                              AS severity,
  'import_error'                                     AS alert_type,
  'Import Error: ' || ir.source_file                 AS title,
  ir.error_message                                   AS detail,
  ir.run_at                                          AS raised_at
FROM import_errors ie
JOIN import_runs ir ON ir.id = ie.import_run_id
WHERE ir.run_at >= NOW() - INTERVAL '7 days'

UNION ALL

-- RED: Negative net cashflow last 30 days
SELECT
  'RED', 'negative_cashflow',
  'Negative Net Cashflow (30d)',
  'Net cash: ₹' || ROUND(SUM(bt.amount_inr))::text,
  NOW()
FROM bank_transactions bt
WHERE bt.transaction_date >= CURRENT_DATE - 30
HAVING SUM(bt.amount_inr) < 0

UNION ALL

-- RED: COD outstanding > 30 days
SELECT
  'RED', 'cod_overdue',
  'COD Overdue > 30 days',
  COUNT(*) || ' shipments, ₹' || ROUND(SUM(cod_payable_inr))::text || ' pending',
  NOW()
FROM v_cod_outstanding
WHERE days_outstanding > 30
HAVING COUNT(*) > 0

UNION ALL

-- AMBER: Return rate > 15% in last 30 days
SELECT
  'AMBER', 'high_return_rate',
  'High Return Rate',
  ROUND(
    COUNT(DISTINCT r.id)::numeric /
    NULLIF(COUNT(DISTINCT o.woocommerce_order_id), 0) * 100, 1
  )::text || '% return rate (threshold: 15%)',
  NOW()
FROM orders o
LEFT JOIN returns r ON r.order_id = o.id
JOIN shipments s ON s.order_id = o.id
WHERE s.delivered_at >= CURRENT_DATE - 30
  AND s.status = 'DELIVERED'
HAVING ROUND(
  COUNT(DISTINCT r.id)::numeric /
  NULLIF(COUNT(DISTINCT o.woocommerce_order_id), 0) * 100, 1
) > 15

UNION ALL

-- AMBER: Orders without linked shipments (shipment linkage gap)
SELECT
  'AMBER', 'shipment_linkage',
  'Unlinked Orders',
  COUNT(*)::text || ' orders placed > 3 days ago have no shipment record',
  NOW()
FROM orders o
LEFT JOIN shipments s ON s.order_id = o.id
WHERE s.id IS NULL
  AND o.order_date < CURRENT_DATE - 3
  AND o.order_status NOT IN ('cancelled', 'refunded')
HAVING COUNT(*) > 0

UNION ALL

-- AMBER: Gateway settlement gap (delivered prepaid orders, no settlement > 10 days)
SELECT
  'AMBER', 'settlement_gap',
  'Unsettled Gateway Payments',
  COUNT(*)::text || ' prepaid orders delivered > 10 days ago with no gateway settlement',
  NOW()
FROM shipments s
JOIN orders o ON o.id = s.order_id
LEFT JOIN gateway_settlements gs ON gs.order_id = s.order_id
WHERE s.status = 'DELIVERED'
  AND o.payment_method != 'cod'
  AND s.delivered_at < NOW() - INTERVAL '10 days'
  AND gs.id IS NULL
HAVING COUNT(*) > 0

UNION ALL

-- GREEN: System healthy (shown only when no RED or AMBER rows exist)
SELECT
  'GREEN', 'system_healthy',
  'All Systems Healthy',
  'No active alerts',
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM import_errors ie
  JOIN import_runs ir ON ir.id = ie.import_run_id
  WHERE ir.run_at >= NOW() - INTERVAL '7 days'
)
AND NOT EXISTS (
  SELECT 1 FROM bank_transactions bt
  WHERE bt.transaction_date >= CURRENT_DATE - 30
  HAVING SUM(bt.amount_inr) < 0
)
AND NOT EXISTS (
  SELECT 1 FROM v_cod_outstanding WHERE days_outstanding > 30
)
AND NOT EXISTS (
  SELECT 1 FROM orders o
  LEFT JOIN returns r ON r.order_id = o.id
  JOIN shipments s ON s.order_id = o.id
  WHERE s.delivered_at >= CURRENT_DATE - 30 AND s.status = 'DELIVERED'
  HAVING ROUND(COUNT(DISTINCT r.id)::numeric / NULLIF(COUNT(DISTINCT o.woocommerce_order_id),0)*100,1) > 15
);
```

```sql
CREATE OR REPLACE VIEW v_gateway_settlements_summary AS
SELECT
  gs.gateway,
  DATE_TRUNC('month', gs.settlement_date)::date    AS month,
  COUNT(*)                                          AS settlement_count,
  SUM(gs.gross_amount_inr)                          AS gross_amount_inr,
  SUM(gs.net_amount_inr)                            AS net_amount_inr,
  SUM(gs.fee_amount_inr)                            AS fee_amount_inr,
  ROUND(
    SUM(gs.fee_amount_inr) /
    NULLIF(SUM(gs.gross_amount_inr), 0) * 100, 2
  )                                                 AS fee_pct
FROM gateway_settlements gs
GROUP BY 1, 2
ORDER BY 2 DESC, 1;
```

---

## 4. Materialized Views

Materialized views are reserved for Phase 2 (after kpi_daily_snapshot is populated by compute scripts). In Phase 1, all data is read from the regular SQL views above, which query raw tables directly.

### Phase 2 Materialized Views (planned, not yet created)

| View | Refresh | Purpose |
|------|---------|---------|
| `mv_cohort_retention` | Weekly | Customer retention by acquisition cohort |
| `mv_product_performance` | Daily | Revenue/units/GM per SKU (blocked until variant_id populated) |
| `mv_launch_profitability` | Daily | Cumulative revenue vs investment per launch |
| `mv_inventory_velocity` | Daily | Sell-through rate per SKU (blocked until inventory_batches seeded) |

---

## 5. KPI Snapshot Strategy

### Phase 1 (Current — kpi_daily_snapshot = 0 rows)

All dashboard queries read from raw tables via SQL views. The API layer checks snapshot availability and routes accordingly:

```typescript
// lib/data/queryStrategy.ts
export type QueryMode = 'snapshot' | 'raw';

export async function getQueryMode(): Promise<QueryMode> {
  const { count } = await supabase
    .from('kpi_daily_snapshot')
    .select('*', { count: 'exact', head: true });
  return (count ?? 0) > 0 ? 'snapshot' : 'raw';
}
```

### Phase 1 Data Path

```
Dashboard Component
       ↓
  useDashboard hook  (React Query)
       ↓
  Supabase RPC / REST call
       ↓
  SQL View (v_daily_revenue, v_monthly_revenue, etc.)
       ↓
  Raw tables (orders, shipments, customers, bank_transactions)
```

### Phase 2 Data Path (after compute scripts run)

```
Dashboard Component
       ↓
  useDashboard hook  (React Query, same interface)
       ↓
  Supabase RPC / REST call
       ↓
  kpi_daily_snapshot / kpi_monthly_snapshot   ← pre-computed
       ↓
  Raw tables only for drill-downs
```

### Transition Rule

When `kpi_daily_snapshot.snapshot_date` contains data for the requested period, the API switches to snapshot queries. The frontend sees no change — same hook, same component.

### Empty State Strategy

For blocked KPIs (inventory, ad spend, net margin), render a dedicated `<DataUnavailableCard>` with:
- What data is missing
- What action to take (e.g., "Seed inventory_batches to enable this view")
- An estimated unlock date if known

---

## 6. API Routes / Supabase RPCs

### Pattern
All data fetching via Supabase PostgREST. No custom API server. Eight PostgreSQL functions callable via `supabase.rpc('function_name', params)`.

### RPC Functions to Create (Phase 1)

```sql
-- 0. Director Command Center — full above-the-fold snapshot
CREATE OR REPLACE FUNCTION get_director_snapshot() RETURNS json AS $$
DECLARE
  v_mtd_start date := DATE_TRUNC('month', CURRENT_DATE)::date;
  v_prior_start date := DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')::date;
  v_prior_end   date := (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 day')::date;
BEGIN
  RETURN (
    WITH mtd_revenue AS (
      SELECT
        SUM(ol.line_total_inr)                              AS gross_revenue_inr,
        COUNT(DISTINCT o.woocommerce_order_id)              AS orders_count,
        COUNT(DISTINCT o.customer_id)                       AS customers
      FROM shipments s
      JOIN orders o       ON o.id = s.order_id
      JOIN order_lines ol ON ol.order_id = o.id
      WHERE s.status = 'DELIVERED'
        AND s.delivered_at >= v_mtd_start
    ),
    prior_revenue AS (
      SELECT
        SUM(ol.line_total_inr) AS gross_revenue_inr,
        COUNT(DISTINCT o.woocommerce_order_id) AS orders_count
      FROM shipments s
      JOIN orders o       ON o.id = s.order_id
      JOIN order_lines ol ON ol.order_id = o.id
      WHERE s.status = 'DELIVERED'
        AND s.delivered_at BETWEEN v_prior_start AND v_prior_end
    ),
    cash AS (
      SELECT closing_balance_inr
      FROM bank_transactions
      WHERE closing_balance_inr IS NOT NULL
      ORDER BY transaction_date DESC, id DESC LIMIT 1
    ),
    cod_pending AS (
      SELECT COALESCE(SUM(cod_payable_inr), 0) AS total,
             COUNT(*) AS count
      FROM v_cod_outstanding
    ),
    ops_30d AS (
      SELECT
        COUNT(*)                                                   AS total,
        COUNT(CASE WHEN s.status = 'DELIVERED' THEN 1 END)        AS delivered,
        COUNT(CASE WHEN s.status = 'RTO'       THEN 1 END)        AS rto
      FROM shipments s
      WHERE s.created_at >= CURRENT_DATE - 30
    ),
    returns_30d AS (
      SELECT COUNT(*) AS return_count
      FROM returns r WHERE r.return_date >= CURRENT_DATE - 30
    ),
    repeat_custs AS (
      SELECT
        COUNT(CASE WHEN order_count > 1 THEN 1 END)  AS repeat_customers,
        COUNT(*)                                       AS total_customers
      FROM (
        SELECT customer_id, COUNT(DISTINCT woocommerce_order_id) AS order_count
        FROM orders GROUP BY 1
      ) sub
    ),
    alert_counts AS (
      SELECT
        COUNT(CASE WHEN severity = 'RED'   THEN 1 END) AS red_count,
        COUNT(CASE WHEN severity = 'AMBER' THEN 1 END) AS amber_count,
        COUNT(CASE WHEN severity = 'GREEN' THEN 1 END) AS green_count
      FROM v_system_alerts
    )
    SELECT json_build_object(
      -- Revenue
      'revenue_mtd_inr',          m.gross_revenue_inr,
      'revenue_prior_month_inr',  p.gross_revenue_inr,
      'revenue_mtd_change_pct',   ROUND((m.gross_revenue_inr - p.gross_revenue_inr) / NULLIF(p.gross_revenue_inr,0)*100,1),
      -- Orders
      'orders_mtd',               m.orders_count,
      'orders_prior_month',       p.orders_count,
      'orders_mtd_change_pct',    ROUND((m.orders_count - p.orders_count)::numeric / NULLIF(p.orders_count,0)*100,1),
      -- Cash
      'cash_position_inr',        c.closing_balance_inr,
      'cod_outstanding_inr',      cod.total,
      'cod_outstanding_count',    cod.count,
      -- Operations
      'delivery_success_pct',     ROUND(o.delivered::numeric / NULLIF(o.total,0)*100,1),
      'rto_rate_pct',             ROUND(o.rto::numeric        / NULLIF(o.total,0)*100,1),
      'return_rate_pct',          ROUND(r.return_count::numeric / NULLIF(m.orders_count,0)*100,1),
      -- Customers
      'repeat_customer_pct',      ROUND(rc.repeat_customers::numeric / NULLIF(rc.total_customers,0)*100,1),
      -- Alerts
      'red_alert_count',          ac.red_count,
      'amber_alert_count',        ac.amber_count,
      'system_status',            CASE
                                    WHEN ac.red_count   > 0 THEN 'RED'
                                    WHEN ac.amber_count > 0 THEN 'AMBER'
                                    ELSE 'GREEN'
                                  END
    )
    FROM mtd_revenue m, prior_revenue p, cash c, cod_pending cod,
         ops_30d o, returns_30d r, repeat_custs rc, alert_counts ac
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- 1. Executive Overview KPIs
CREATE OR REPLACE FUNCTION get_executive_kpis(
  p_start date,
  p_end   date
) RETURNS json AS $$
  SELECT json_build_object(
    'gross_revenue_inr',    SUM(ol.line_total_inr),
    'orders_count',         COUNT(DISTINCT o.woocommerce_order_id),
    'aov_inr',              ROUND(SUM(ol.line_total_inr) / NULLIF(COUNT(DISTINCT o.woocommerce_order_id), 0), 2),
    'unique_customers',     COUNT(DISTINCT o.customer_id),
    'new_customers',        COUNT(DISTINCT CASE WHEN c.first_order_date BETWEEN p_start AND p_end THEN c.id END),
    'cod_pct',              ROUND(SUM(CASE WHEN o.payment_method='cod' THEN 1.0 ELSE 0 END) / NULLIF(COUNT(DISTINCT o.woocommerce_order_id),0) * 100, 1),
    'return_count',         (SELECT COUNT(*) FROM returns r WHERE r.return_date BETWEEN p_start AND p_end),
    'return_rate_pct',      ROUND((SELECT COUNT(*)::numeric FROM returns r WHERE r.return_date BETWEEN p_start AND p_end) / NULLIF(COUNT(DISTINCT o.woocommerce_order_id), 0) * 100, 1)
  )
  FROM shipments s
  JOIN orders o ON o.id = s.order_id
  JOIN order_lines ol ON ol.order_id = o.id
  JOIN customers c ON c.id = o.customer_id
  WHERE s.status = 'DELIVERED'
    AND s.delivered_at BETWEEN p_start AND p_end;
$$ LANGUAGE sql STABLE;

-- 2. Revenue trend series (daily granularity)
CREATE OR REPLACE FUNCTION get_revenue_trend(
  p_start date,
  p_end   date,
  p_grain text DEFAULT 'day'   -- 'day' | 'week' | 'month'
) RETURNS TABLE (
  period        date,
  revenue_inr   numeric,
  orders_count  bigint,
  aov_inr       numeric
) AS $$
  SELECT
    DATE_TRUNC(p_grain, s.delivered_at)::date,
    SUM(ol.line_total_inr),
    COUNT(DISTINCT o.woocommerce_order_id),
    ROUND(SUM(ol.line_total_inr) / NULLIF(COUNT(DISTINCT o.woocommerce_order_id), 0), 2)
  FROM shipments s
  JOIN orders o       ON o.id = s.order_id
  JOIN order_lines ol ON ol.order_id = o.id
  WHERE s.status = 'DELIVERED'
    AND s.delivered_at BETWEEN p_start AND p_end
  GROUP BY 1 ORDER BY 1;
$$ LANGUAGE sql STABLE;

-- 3. Customer intelligence
CREATE OR REPLACE FUNCTION get_customer_kpis(
  p_start date,
  p_end   date
) RETURNS json AS $$
  WITH period_orders AS (
    SELECT o.customer_id, COUNT(DISTINCT o.woocommerce_order_id) AS orders
    FROM orders o
    JOIN shipments s ON s.order_id = o.id
    WHERE s.status = 'DELIVERED' AND s.delivered_at BETWEEN p_start AND p_end
    GROUP BY 1
  ),
  new_custs AS (
    SELECT COUNT(*) AS cnt
    FROM customers
    WHERE first_order_date BETWEEN p_start AND p_end
  )
  SELECT json_build_object(
    'total_customers',       (SELECT COUNT(*) FROM customers),
    'new_customers',         nc.cnt,
    'repeat_customers',      COUNT(CASE WHEN po.orders > 1 THEN 1 END),
    'repeat_purchase_pct',   ROUND(COUNT(CASE WHEN po.orders > 1 THEN 1 END)::numeric / NULLIF(COUNT(po.customer_id), 0) * 100, 1),
    'avg_orders_per_customer', ROUND(AVG(po.orders), 2)
  )
  FROM period_orders po, new_custs nc
  GROUP BY nc.cnt;
$$ LANGUAGE sql STABLE;

-- 4. Operations KPIs
CREATE OR REPLACE FUNCTION get_operations_kpis(
  p_start date,
  p_end   date
) RETURNS json AS $$
  SELECT json_build_object(
    'total_shipments',       COUNT(DISTINCT s.id),
    'delivered',             COUNT(CASE WHEN s.status = 'DELIVERED' THEN 1 END),
    'in_transit',            COUNT(CASE WHEN s.status = 'IN_TRANSIT' THEN 1 END),
    'rto',                   COUNT(CASE WHEN s.status = 'RTO'        THEN 1 END),
    'pending',               COUNT(CASE WHEN s.status = 'PENDING'    THEN 1 END),
    'delivery_success_pct',  ROUND(COUNT(CASE WHEN s.status='DELIVERED' THEN 1 END)::numeric / NULLIF(COUNT(DISTINCT s.id),0) * 100, 1),
    'rto_rate_pct',          ROUND(COUNT(CASE WHEN s.status='RTO' THEN 1 END)::numeric / NULLIF(COUNT(DISTINCT s.id),0) * 100, 1),
    'cod_outstanding_inr',   (SELECT COALESCE(SUM(cod_payable_inr),0) FROM v_cod_outstanding),
    'cod_outstanding_count', (SELECT COUNT(*) FROM v_cod_outstanding)
  )
  FROM shipments s
  WHERE s.created_at::date BETWEEN p_start AND p_end;
$$ LANGUAGE sql STABLE;

-- 5. Finance KPIs
CREATE OR REPLACE FUNCTION get_finance_kpis(
  p_start date,
  p_end   date
) RETURNS json AS $$
  SELECT json_build_object(
    'cash_inflow_inr',       SUM(CASE WHEN bt.amount_inr > 0  THEN bt.amount_inr ELSE 0 END),
    'cash_outflow_inr',      SUM(CASE WHEN bt.amount_inr < 0  THEN ABS(bt.amount_inr) ELSE 0 END),
    'net_cash_inr',          SUM(bt.amount_inr),
    'transaction_count',     COUNT(*),
    'latest_balance_inr',    (
      SELECT closing_balance_inr
      FROM bank_transactions
      WHERE transaction_date <= p_end
        AND closing_balance_inr IS NOT NULL
      ORDER BY transaction_date DESC, id DESC
      LIMIT 1
    )
  )
  FROM bank_transactions bt
  WHERE bt.transaction_date BETWEEN p_start AND p_end;
$$ LANGUAGE sql STABLE;

-- 6. Period-comparison helper (MoM, WoW)
CREATE OR REPLACE FUNCTION get_period_comparison(
  p_current_start date,
  p_current_end   date,
  p_prior_start   date,
  p_prior_end     date
) RETURNS json AS $$
  WITH current_period AS (
    SELECT SUM(ol.line_total_inr) AS revenue, COUNT(DISTINCT o.woocommerce_order_id) AS orders
    FROM shipments s JOIN orders o ON o.id=s.order_id JOIN order_lines ol ON ol.order_id=o.id
    WHERE s.status='DELIVERED' AND s.delivered_at BETWEEN p_current_start AND p_current_end
  ),
  prior_period AS (
    SELECT SUM(ol.line_total_inr) AS revenue, COUNT(DISTINCT o.woocommerce_order_id) AS orders
    FROM shipments s JOIN orders o ON o.id=s.order_id JOIN order_lines ol ON ol.order_id=o.id
    WHERE s.status='DELIVERED' AND s.delivered_at BETWEEN p_prior_start AND p_prior_end
  )
  SELECT json_build_object(
    'current_revenue',  c.revenue,
    'prior_revenue',    p.revenue,
    'revenue_change_pct', ROUND((c.revenue - p.revenue) / NULLIF(p.revenue, 0) * 100, 1),
    'current_orders',   c.orders,
    'prior_orders',     p.orders,
    'orders_change_pct', ROUND((c.orders - p.orders)::numeric / NULLIF(p.orders, 0) * 100, 1)
  )
  FROM current_period c, prior_period p;
$$ LANGUAGE sql STABLE;

-- 7. Launch performance
CREATE OR REPLACE FUNCTION get_launch_performance() RETURNS TABLE (
  launch_id     uuid,
  launch_name   text,
  live_date     date,
  revenue_inr   numeric,
  orders_count  bigint,
  aov_inr       numeric
) AS $$
  SELECT
    l.id,
    l.name,
    l.live_date,
    SUM(ol.line_total_inr),
    COUNT(DISTINCT o.woocommerce_order_id),
    ROUND(SUM(ol.line_total_inr) / NULLIF(COUNT(DISTINCT o.woocommerce_order_id),0), 2)
  FROM launches l
  JOIN orders o ON o.launch_id = l.id
  JOIN order_lines ol ON ol.order_id = o.id
  JOIN shipments s ON s.order_id = o.id
  WHERE s.status = 'DELIVERED' AND s.delivered_at IS NOT NULL
  GROUP BY l.id, l.name, l.live_date
  ORDER BY l.live_date;
$$ LANGUAGE sql STABLE;

-- 8. COD reconciliation detail
CREATE OR REPLACE FUNCTION get_cod_reconciliation(
  p_start date DEFAULT '2026-01-01',
  p_end   date DEFAULT CURRENT_DATE
) RETURNS TABLE (
  awb_number          text,
  cod_payable_inr     numeric,
  delivered_at        timestamptz,
  days_outstanding    numeric,
  cod_crf_id          text,
  is_reconciled       boolean
) AS $$
  SELECT
    s.awb_number,
    s.cod_payable_inr,
    s.delivered_at,
    EXTRACT(DAY FROM NOW() - s.delivered_at),
    s.cod_crf_id,
    (s.cod_crf_id IS NOT NULL AND s.cod_crf_id IN (
      SELECT extracted_reference FROM bank_transactions
      WHERE transaction_type='cod_remittance' AND extracted_reference IS NOT NULL
    ))
  FROM shipments s
  WHERE s.payment_method = 'cod'
    AND s.status = 'DELIVERED'
    AND s.delivered_at::date BETWEEN p_start AND p_end
  ORDER BY s.delivered_at DESC;
$$ LANGUAGE sql STABLE;
```

### REST Endpoints (via PostgREST — no custom server)

| Endpoint | Method | Parameters | Used By |
|----------|--------|------------|---------|
| `/rest/v1/rpc/get_director_snapshot` | POST | none | Page 0 KPI row |
| `/rest/v1/v_system_alerts` | GET | — | Page 0 alert panel |
| `/rest/v1/rpc/get_executive_kpis` | POST | `{p_start, p_end}` | Page 1 KPI cards |
| `/rest/v1/rpc/get_revenue_trend` | POST | `{p_start, p_end, p_grain}` | Page 1 charts |
| `/rest/v1/rpc/get_period_comparison` | POST | `{p_current_start, p_current_end, p_prior_start, p_prior_end}` | Page 1 deltas |
| `/rest/v1/rpc/get_customer_kpis` | POST | `{p_start, p_end}` | Page 2 KPI cards |
| `/rest/v1/rpc/get_launch_performance` | POST | none | Page 1 launch table |
| `/rest/v1/rpc/get_operations_kpis` | POST | `{p_start, p_end}` | Page 3 KPI cards |
| `/rest/v1/rpc/get_cod_reconciliation` | POST | `{p_start, p_end}` | Pages 3 + 4 |
| `/rest/v1/rpc/get_finance_kpis` | POST | `{p_start, p_end}` | Page 4 KPI cards |
| `/rest/v1/v_daily_revenue` | GET | `?revenue_date=gte.{date}` | Page 1 trend |
| `/rest/v1/v_customer_growth_monthly` | GET | — | Page 2 growth chart |
| `/rest/v1/v_top_cities` | GET | `?limit=10` | Page 2 city table |
| `/rest/v1/v_shipment_funnel` | GET | — | Page 3 funnel chart |
| `/rest/v1/v_returns_analysis` | GET | — | Page 3 returns table |
| `/rest/v1/v_gateway_settlements_summary` | GET | — | Page 4 settlements |
| `/rest/v1/v_cash_flow_daily` | GET | `?transaction_date=gte.{date}` | Page 4 cash chart |

---

## 7. Component Library

### 7.1 Primitive Wrappers (shadcn/ui extensions)

| Component | File | Base | Description |
|-----------|------|------|-------------|
| `KpiCard` | `components/ui/kpi-card.tsx` | Card | Metric + delta + trend indicator + sparkline slot |
| `KpiCardSkeleton` | `components/ui/kpi-card.tsx` | Skeleton | Loading placeholder matching KpiCard dimensions |
| `DataUnavailableCard` | `components/ui/data-unavailable-card.tsx` | Card | Empty state for blocked KPIs (icon + reason + CTA) |
| `PeriodSelector` | `components/ui/period-selector.tsx` | Select | 7d / 30d / 90d / 6m / 1y / All + custom range |
| `TrendBadge` | `components/ui/trend-badge.tsx` | Badge | +12.3% ↑ / -4.1% ↓ with colour semantics |
| `SectionHeader` | `components/ui/section-header.tsx` | — | Page section title + subtitle + optional action slot |
| `PageHeader` | `components/ui/page-header.tsx` | — | Page title + breadcrumb + period selector |
| `DataTable` | `components/ui/data-table.tsx` | Table | Sortable + paginated table (TanStack Table v8) |
| `StatusPill` | `components/ui/status-pill.tsx` | Badge | DELIVERED / RTO / PENDING etc. with colour |

### 7.2 Chart Components (Recharts)

| Component | File | Chart Type | Used On |
|-----------|------|------------|---------|
| `RevenueAreaChart` | `components/charts/revenue-area-chart.tsx` | Area | Page 1 revenue trend |
| `OrdersBarChart` | `components/charts/orders-bar-chart.tsx` | Bar | Page 1 orders trend |
| `PaymentSplitDonut` | `components/charts/payment-split-donut.tsx` | Pie/Donut | Page 1 COD vs prepaid |
| `CustomerGrowthLine` | `components/charts/customer-growth-line.tsx` | Line | Page 2 growth |
| `CityHeatmapBar` | `components/charts/city-heatmap-bar.tsx` | Horizontal Bar | Page 2 top cities |
| `ShipmentFunnelBar` | `components/charts/shipment-funnel-bar.tsx` | Stacked Bar | Page 3 funnel |
| `DeliveryPieChart` | `components/charts/delivery-pie-chart.tsx` | Pie | Page 3 status split |
| `CashFlowAreaChart` | `components/charts/cashflow-area-chart.tsx` | Area (pos/neg) | Page 4 cash position |
| `SettlementBarChart` | `components/charts/settlement-bar-chart.tsx` | Grouped Bar | Page 4 gateway fees |
| `SparkLine` | `components/charts/sparkline.tsx` | Line (mini) | KpiCard inline trend |

### 7.3 Feature Components

| Component | File | Page |
|-----------|------|------|
| `DirectorKpiRow` | `features/director/kpi-row.tsx` | Page 0 |
| `AlertPanel` | `features/director/alert-panel.tsx` | Page 0 |
| `AlertCard` | `features/director/alert-card.tsx` | Page 0 |
| `SystemStatusBanner` | `features/director/system-status-banner.tsx` | Page 0 |
| `DirectorTrendRow` | `features/director/trend-row.tsx` | Page 0 |
| `ExecutiveKpiRow` | `features/executive/kpi-row.tsx` | Page 1 |
| `RevenueTrendPanel` | `features/executive/revenue-trend-panel.tsx` | Page 1 |
| `LaunchPerformanceTable` | `features/executive/launch-performance-table.tsx` | Page 1 |
| `CustomerKpiRow` | `features/customer/kpi-row.tsx` | Page 2 |
| `CustomerGrowthPanel` | `features/customer/growth-panel.tsx` | Page 2 |
| `TopCitiesPanel` | `features/customer/top-cities-panel.tsx` | Page 2 |
| `RepeatCustomerPanel` | `features/customer/repeat-customer-panel.tsx` | Page 2 |
| `ShipmentKpiRow` | `features/operations/kpi-row.tsx` | Page 3 |
| `ShipmentFunnelPanel` | `features/operations/funnel-panel.tsx` | Page 3 |
| `CodPendingPanel` | `features/operations/cod-pending-panel.tsx` | Pages 3+4 |
| `ReturnsPanel` | `features/operations/returns-panel.tsx` | Page 3 |
| `FinanceKpiRow` | `features/finance/kpi-row.tsx` | Page 4 |
| `CashPositionPanel` | `features/finance/cash-position-panel.tsx` | Page 4 |
| `GatewaySettlementsPanel` | `features/finance/gateway-settlements-panel.tsx` | Page 4 |
| `CodReconciliationTable` | `features/finance/cod-reconciliation-table.tsx` | Page 4 |

### 7.4 Layout Components

| Component | File | Description |
|-----------|------|-------------|
| `DashboardShell` | `components/layout/dashboard-shell.tsx` | Full-page wrapper with sidebar nav |
| `Sidebar` | `components/layout/sidebar.tsx` | Navigation with active state |
| `TopBar` | `components/layout/top-bar.tsx` | Logo + global period selector + dark mode toggle |
| `PageContainer` | `components/layout/page-container.tsx` | Max-width + padding wrapper |

---

## 8. Page Architecture

### Page 0 — Director Command Center (`/dashboard`)

**Intent:** Mission control. The owner opens this page and knows the business health in under 30 seconds. Full-screen, dark aesthetic, data-dense but scannable. Traffic-light alerts immediately surface anything requiring action.

**Design target:** Linear issue board × Stripe radar dashboard × Shopify analytics header.

```
┌─────────────────────────────────────────────────────────────────┐
│  ● KIRGO CONTROL TOWER          [●GREEN / ●AMBER / ●RED]  [MTD]│
│  Last updated: 2 min ago                             [↻ Refresh]│
├────────────┬────────────┬────────────┬────────────┬─────────────┤
│ Revenue    │ Orders     │ Cash       │ COD        │             │
│ MTD        │ MTD        │ Position   │ Outstanding│             │
│ ₹4.2L      │ 916        │ ₹8.2L      │ ₹38,200    │   SYSTEM    │
│ ↑12% MoM   │ ↑8% MoM    │            │ 47 open    │   STATUS    │
├────────────┼────────────┼────────────┼────────────┤             │
│ Return     │ Delivery   │ Repeat     │ Alerts     │  ● GREEN    │
│ Rate       │ Success %  │ Customer % │ Active     │  All clear  │
│ 9.1%       │ 89.4%      │ 31%        │ 2 amber    │             │
├────────────┴────────────┴────────────┴────────────┴─────────────┤
│  Revenue Trend (30d)          │  Orders Trend (30d)             │
│  ▁▂▃▅▆▇█▇▆▅▄▃▂▁▂▃▄▅▆▇▇▆▅▄   │  ▂▃▄▅▆▇▆▅▄▃▂▃▄▅▆▇▇▆▅▄▃▂▃▄▅   │
├───────────────────────────────┴────────────────────────────────┤
│  ALERTS                                                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ ● RED    Import Error: sr_shipments_2026.csv              │  │
│  │          Run failed at 2026-06-17 14:32 — null AWB        │  │
│  │ ● AMBER  Unlinked Orders: 8 orders > 3 days, no shipment  │  │
│  │ ● AMBER  COD Overdue: 12 shipments > 30 days (₹14,400)    │  │
│  └──────────────────────────────────────────────────────────┘  │
│  Cash Trend (30d)                                               │
│  ████████████░░░░░░░░░░░░  Inflow / Outflow area               │
└────────────────────────────────────────────────────────────────┘
```

**KPI Row 1 (4 cards, top priority):**
- Revenue MTD — `gross_revenue_inr` with MoM delta + sparkline
- Orders MTD — order count with MoM delta
- Cash Position — latest `closing_balance_inr` from bank_transactions
- COD Outstanding — `v_cod_outstanding` total + count badge

**KPI Row 2 (4 cards):**
- Return Rate — returns / delivered orders (last 30d), RED if >15%
- Delivery Success % — delivered / total shipments (last 30d)
- Repeat Customer % — customers with >1 order / total customers
- Active Alerts — count badge split by RED / AMBER, links to alert panel

**System Status panel (right column):**
- Single large traffic-light indicator (GREEN / AMBER / RED)
- Derived from `v_system_alerts`: any RED row → RED; any AMBER → AMBER; else GREEN
- Timestamp of last data refresh

**Trend Row:**
- Revenue area chart (30d, no axes — read as trend shape)
- Orders bar chart (30d)

**Alert Panel:**
- Full-width below trend charts
- Each alert: severity dot + type tag + title + detail text + timestamp
- RED alerts sorted first, then AMBER, then GREEN
- Click-through links: import error → future import logs page; COD → Finance page; returns → Operations page

**Visual treatment:**
- Dark base: `zinc-950` background, `zinc-900` card surfaces
- Alert colours: RED = `red-500`, AMBER = `amber-400`, GREEN = `emerald-500`
- KPI card borders: 1px `zinc-800`, glow on hover
- Charts: muted colour palette with brand accent (`violet-500`) for primary series
- Typography: `tabular-nums` for all metric values

**Data Sources:** `get_director_snapshot()`, `v_system_alerts`, `get_revenue_trend()` (30d, day grain), `v_cash_flow_daily` (30d)

---

### Page 1 — Executive Overview (`/dashboard/executive`)

**Intent:** CEO understands the business in 30 seconds. Above the fold: 5 KPI cards + primary revenue chart. No scroll required for the headline metrics.

```
┌─────────────────────────────────────────────────────────┐
│  PageHeader: "Executive Overview"  [7d ▾] [30d ▾] [MTD]│
├─────────────────────────────────────────────────────────┤
│  KpiCard        KpiCard        KpiCard    KpiCard  KpiCard │
│  Revenue        Orders         AOV        Customers Returns%│
│  ₹4.2L ↑12%    916 ↑8%        ₹1,847     620       9.1%   │
├───────────────────────┬─────────────────────────────────┤
│  Revenue Trend        │  Orders Trend                   │
│  (Area chart, 30d)    │  (Bar chart, 30d)               │
│                       │                                 │
├───────────────────────┴─────────────────────────────────┤
│  COD vs Prepaid Split │  Launch Performance             │
│  (Donut chart)        │  (Table: L1/L2/L3 revenue, AOV) │
└───────────────────────┴─────────────────────────────────┘
```

**KPI Cards (Row 1):**
- Gross Revenue (period total + MoM delta + sparkline)
- Orders Count (period total + MoM delta)
- Average Order Value (+ MoM delta)
- New Customers (+ MoM delta)
- Return Rate % (+ MoM delta, red if >10%)

**Charts Row:**
- Revenue trend area chart (daily grain for ≤90d, weekly for >90d)
- Orders trend bar chart (same grain)

**Bottom Row:**
- COD/Prepaid donut with ₹ values and %
- Launch performance table: L1 Classic / L2 Summer / L3 Core + revenue/orders/AOV

**Data Sources:** `get_executive_kpis()`, `get_revenue_trend()`, `get_period_comparison()`, `get_launch_performance()`

---

### Page 2 — Customer Intelligence (`/dashboard/customers`)

**Intent:** Who is buying, where, and how often. Repeat purchase health.

```
┌─────────────────────────────────────────────────────────┐
│  PageHeader: "Customer Intelligence"  [period selector] │
├─────────────────────────────────────────────────────────┤
│  KpiCard           KpiCard          KpiCard    KpiCard  │
│  Total Customers   New Customers    Repeat%    Avg LTV  │
│  620               48               31%        ₹2,100   │
├────────────────────────┬────────────────────────────────┤
│  Customer Growth       │  Repeat vs New (monthly stack) │
│  (Cumulative line)     │  (Stacked bar)                 │
├────────────────────────┴────────────────────────────────┤
│  Top Cities by Customer Count                           │
│  (Horizontal bar: Mumbai / Delhi / Bengaluru / …)       │
├─────────────────────────────────────────────────────────┤
│  Customer List                                          │
│  (DataTable: email | city | orders | LTV | last order)  │
└─────────────────────────────────────────────────────────┘
```

**Data Sources:** `get_customer_kpis()`, `v_customer_growth_monthly`, `v_top_cities`, `v_customer_summary`

---

### Page 3 — Operations Command Center (`/dashboard/operations`)

**Intent:** What is happening to orders after placement. Delivery health, returns, COD liability.

```
┌─────────────────────────────────────────────────────────┐
│  PageHeader: "Operations Command Center" [period]       │
├─────────────────────────────────────────────────────────┤
│  KpiCard         KpiCard       KpiCard    KpiCard       │
│  Delivery %      RTO Rate      Returns    COD Pending   │
│  89.4%           6.1%          130        ₹38,200       │
├────────────────────────┬────────────────────────────────┤
│  Shipment Status Funnel│  Delivery Success Trend        │
│  (Stacked bar monthly) │  (Line chart monthly)          │
├────────────────────────┴────────────────────────────────┤
│  Returns by Reason                                      │
│  (Bar chart + table)                                    │
├─────────────────────────────────────────────────────────┤
│  COD Pending Table                                      │
│  (DataTable: AWB | amount | delivered | days pending)   │
└─────────────────────────────────────────────────────────┘
```

**Data Sources:** `get_operations_kpis()`, `v_shipment_funnel`, `v_returns_analysis`, `v_cod_outstanding`, `get_cod_reconciliation()`

---

### Page 4 — Finance & Cash (`/dashboard/finance`)

**Intent:** CFO view. Cash position, settlement status, COD reconciliation.

```
┌─────────────────────────────────────────────────────────┐
│  PageHeader: "Finance & Cash"  [period selector]        │
├─────────────────────────────────────────────────────────┤
│  KpiCard         KpiCard       KpiCard    KpiCard       │
│  Cash Inflow     Cash Outflow  Net Cash   Bank Balance  │
│  ₹4.1L           ₹2.8L         ₹1.3L      ₹8.2L         │
│                  ⚠️ Partial — expenses data missing     │
├─────────────────────────────────────────────────────────┤
│  Cash Position (Area chart, daily, inflow vs outflow)   │
├────────────────────────┬────────────────────────────────┤
│  Gateway Settlements   │  COD Reconciliation            │
│  (Grouped bar:         │  (Status: reconciled /         │
│   gross/net/fees by    │   pending / overdue            │
│   gateway per month)   │   + DataTable)                 │
└────────────────────────┴────────────────────────────────┘
```

**Blocked panels (show DataUnavailableCard):**
- Net Margin — requires `expenses` data
- Burn Rate — requires `expenses` data
- Ad Spend ROI — requires `ad_spend_daily` data

**Data Sources:** `get_finance_kpis()`, `v_cash_flow_daily`, `v_gateway_settlements_summary`, `get_cod_reconciliation()`

---

## 9. Next.js Project Structure

```
frontend/
├── package.json                    ← Next.js 14, React 18, Tailwind, shadcn, Recharts
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── .env.local                      ← NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
│
├── src/
│   ├── app/
│   │   ├── layout.tsx              ← Root layout (DashboardShell, ThemeProvider)
│   │   ├── page.tsx                ← Redirect → /dashboard
│   │   └── dashboard/
│   │       ├── page.tsx            ← Page 0: Director Command Center (default)
│   │       ├── executive/
│   │       │   └── page.tsx        ← Page 1: Executive Overview
│   │       ├── customers/
│   │       │   └── page.tsx        ← Page 2: Customer Intelligence
│   │       ├── operations/
│   │       │   └── page.tsx        ← Page 3: Operations Command Center
│   │       └── finance/
│   │           └── page.tsx        ← Page 4: Finance & Cash
│   │
│   ├── components/
│   │   ├── ui/                     ← shadcn/ui components (generated + extended)
│   │   │   ├── kpi-card.tsx
│   │   │   ├── data-unavailable-card.tsx
│   │   │   ├── period-selector.tsx
│   │   │   ├── trend-badge.tsx
│   │   │   ├── section-header.tsx
│   │   │   ├── page-header.tsx
│   │   │   ├── data-table.tsx
│   │   │   └── status-pill.tsx
│   │   ├── charts/                 ← Recharts wrappers
│   │   │   ├── revenue-area-chart.tsx
│   │   │   ├── orders-bar-chart.tsx
│   │   │   ├── payment-split-donut.tsx
│   │   │   ├── customer-growth-line.tsx
│   │   │   ├── city-heatmap-bar.tsx
│   │   │   ├── shipment-funnel-bar.tsx
│   │   │   ├── delivery-pie-chart.tsx
│   │   │   ├── cashflow-area-chart.tsx
│   │   │   ├── settlement-bar-chart.tsx
│   │   │   └── sparkline.tsx
│   │   └── layout/
│   │       ├── dashboard-shell.tsx
│   │       ├── sidebar.tsx
│   │       ├── top-bar.tsx
│   │       └── page-container.tsx
│   │
│   ├── features/
│   │   ├── executive/
│   │   │   ├── kpi-row.tsx
│   │   │   ├── revenue-trend-panel.tsx
│   │   │   └── launch-performance-table.tsx
│   │   ├── customer/
│   │   │   ├── kpi-row.tsx
│   │   │   ├── growth-panel.tsx
│   │   │   ├── top-cities-panel.tsx
│   │   │   └── repeat-customer-panel.tsx
│   │   ├── operations/
│   │   │   ├── kpi-row.tsx
│   │   │   ├── funnel-panel.tsx
│   │   │   ├── cod-pending-panel.tsx
│   │   │   └── returns-panel.tsx
│   │   └── finance/
│   │       ├── kpi-row.tsx
│   │       ├── cash-position-panel.tsx
│   │       ├── gateway-settlements-panel.tsx
│   │       └── cod-reconciliation-table.tsx
│   │
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts           ← createBrowserClient()
│   │   │   └── server.ts           ← createServerClient() for Server Components
│   │   ├── data/
│   │   │   ├── director.ts         ← get_director_snapshot, v_system_alerts
│   │   │   ├── executive.ts        ← get_executive_kpis, get_revenue_trend, etc.
│   │   │   ├── customer.ts         ← get_customer_kpis, v_customer_growth_monthly
│   │   │   ├── operations.ts       ← get_operations_kpis, v_shipment_funnel
│   │   │   └── finance.ts          ← get_finance_kpis, v_cash_flow_daily
│   │   ├── hooks/
│   │   │   ├── use-director-snapshot.ts
│   │   │   ├── use-system-alerts.ts
│   │   │   ├── use-executive-kpis.ts
│   │   │   ├── use-customer-kpis.ts
│   │   │   ├── use-operations-kpis.ts
│   │   │   └── use-finance-kpis.ts
│   │   └── utils/
│   │       ├── format.ts           ← formatINR, formatPct, formatCount
│   │       └── date-ranges.ts      ← getPeriodDates(preset: '7d'|'30d'|'90d'|'ytd')
│   │
│   └── types/
│       ├── kpi.ts                  ← DirectorSnapshot, ExecutiveKpis, CustomerKpis, OperationsKpis, FinanceKpis
│       ├── supabase.ts             ← Generated DB types (supabase gen types typescript)
│       └── chart.ts                ← ChartDataPoint, TrendSeries, etc.
```

---

## 10. Implementation Order

### Sprint 1 — Foundation (Days 1–3)

1. **Next.js project scaffold**
   - `npx create-next-app@latest frontend --typescript --tailwind --app`
   - Install: `@supabase/supabase-js`, `recharts`, `@tanstack/react-query`, `@tanstack/react-table`
   - Install shadcn/ui: `npx shadcn@latest init`
   - Add shadcn components: Card, Button, Badge, Table, Select, Skeleton, Separator

2. **Supabase client setup**
   - `lib/supabase/client.ts` — browser client
   - `lib/supabase/server.ts` — server component client
   - `.env.local` with Supabase URL + anon key

3. **Database views + RPCs**
   - Apply all 10 SQL views (Section 3) via Supabase SQL editor
   - Create all 8 RPC functions (Section 6)
   - Test via PostgREST REST calls

4. **Layout shell**
   - `DashboardShell`, `Sidebar` (5 nav items: Command Center / Executive / Customers / Operations / Finance), `TopBar`, `PageContainer`
   - Dark mode via `next-themes`

### Sprint 2 — Page 0: Director Command Center (Days 4–6)

5. **Primitive UI components**
   - `KpiCard` (with skeleton + trend badge)
   - `TrendBadge`, `PeriodSelector`, `DataUnavailableCard`
   - `AlertCard` — severity dot + type tag + title + detail + timestamp
   - `SystemStatusBanner` — large RED/AMBER/GREEN indicator

6. **Director feature components**
   - `DirectorKpiRow` — 8 cards (2 rows × 4), React Query powered, auto-refresh 2 min
   - `AlertPanel` — sorted alert list, RED first, click-through links
   - `DirectorTrendRow` — revenue area + orders bar (30d, compact, no axis labels)
   - `SystemStatusBanner` — full-width banner when system_status = RED

7. **Page 0 assembly** `/dashboard/page.tsx`
   - Dark background (`bg-zinc-950`)
   - Wire all director feature components
   - Auto-refresh every 2 minutes via React Query `refetchInterval`
   - "Last updated" timestamp

### Sprint 3 — Page 1: Executive Overview (Days 7–9)

8. **Shared chart components**
   - `RevenueAreaChart` (Recharts AreaChart, responsive)
   - `OrdersBarChart`, `PaymentSplitDonut`, `SparkLine`

9. **Executive feature components**
   - `ExecutiveKpiRow` — 5 KPI cards, React Query powered
   - `RevenueTrendPanel` — area + bar chart with grain selector
   - `LaunchPerformanceTable` — L1/L2/L3 rows

10. **Page 1 assembly** `/dashboard/executive/page.tsx`
    - Wire all feature components
    - Verify loading skeletons and empty states

### Sprint 4 — Page 2: Customer Intelligence (Days 10–11)

11. `CustomerKpiRow`, `CustomerGrowthPanel`, `TopCitiesPanel`, `RepeatCustomerPanel`
12. Wire `/dashboard/customers/page.tsx`

### Sprint 5 — Page 3: Operations (Days 12–13)

13. `ShipmentFunnelPanel`, `ReturnsPanel`, `CodPendingPanel`
14. `StatusPill` for shipment statuses
15. Wire `/dashboard/operations/page.tsx`

### Sprint 6 — Page 4: Finance (Days 14–15)

16. `CashPositionPanel`, `GatewaySettlementsPanel`, `CodReconciliationTable`
17. Wire `/dashboard/finance/page.tsx`
18. `DataUnavailableCard` for expenses/ad spend panels

### Sprint 7 — Polish (Days 16–17)

19. Mobile responsiveness (all pages, test 375px, 768px, 1440px)
20. Dark mode verification across all pages
21. Performance: React Query cache tuning, skeleton timing
22. Accessibility: ARIA labels on charts, keyboard navigation

---

## Appendix A: Period Selector Presets

| Preset | Label | Start | End |
|--------|-------|-------|-----|
| `7d` | Last 7 days | today − 7 | today |
| `30d` | Last 30 days | today − 30 | today |
| `90d` | Last 90 days | today − 90 | today |
| `6m` | Last 6 months | today − 180 | today |
| `1y` | Last 12 months | today − 365 | today |
| `ytd` | Year to date | Jan 1 current year | today |
| `all` | All time | 2023-01-01 | today |

---

## Appendix B: Data Blockers & Empty State Messaging

| KPI | Blocked By | Empty State Message |
|-----|-----------|---------------------|
| Inventory status | `inventory_batches` empty | "Inventory data not yet seeded. Seed 2,800 units to enable this view." |
| Days to stockout | `inventory_batches` empty | Same as above |
| Ad Spend / ROAS | `ad_spend_daily` empty | "Connect ad spend data to enable marketing ROI tracking." |
| Net Margin | `expenses` empty | "Add operating expenses to calculate net margin." |
| Burn Rate | `expenses` empty | "Expense data required for burn rate calculation." |
| Product profitability | `order_lines.variant_id` NULL | "Product-level analysis requires variant mapping. Run the variant resolution script." |
| Cash outflow (2023–25) | Bank statements not imported | "Cash outflow data available from Jan 2026 only." |

---

## Appendix C: Technology Versions

| Package | Version |
|---------|---------|
| Next.js | 14.2.x |
| React | 18.3.x |
| TypeScript | 5.4.x |
| Tailwind CSS | 3.4.x |
| shadcn/ui | latest |
| Recharts | 2.12.x |
| @supabase/supabase-js | 2.x |
| @tanstack/react-query | 5.x |
| @tanstack/react-table | 8.x |
| next-themes | 0.3.x |
