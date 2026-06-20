-- =============================================================================
-- Dashboard Views
-- v_cash_flow_daily, v_customer_growth_monthly, v_top_cities, v_system_alerts
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. v_cash_flow_daily
-- Daily cash-flow summary from bank_transactions.
-- closing_balance_inr is the last recorded balance for each day (by id).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_cash_flow_daily AS
SELECT
  bt.transaction_date,
  COALESCE(SUM(bt.deposit_inr), 0)                               AS deposit_inr,
  COALESCE(SUM(bt.withdrawal_inr), 0)                            AS withdrawal_inr,
  COALESCE(SUM(bt.deposit_inr), 0)
    - COALESCE(SUM(bt.withdrawal_inr), 0)                        AS net_inr,
  (
    SELECT bt2.closing_balance_inr
    FROM   bank_transactions bt2
    WHERE  bt2.transaction_date = bt.transaction_date
      AND  bt2.closing_balance_inr IS NOT NULL
    ORDER  BY bt2.id DESC
    LIMIT  1
  )                                                               AS closing_balance_inr
FROM bank_transactions bt
GROUP BY bt.transaction_date
ORDER BY bt.transaction_date;

ALTER VIEW v_cash_flow_daily OWNER TO postgres;
GRANT SELECT ON v_cash_flow_daily TO anon, authenticated;


-- ---------------------------------------------------------------------------
-- 2. v_customer_growth_monthly
-- Monthly cohort breakdown: new vs returning customers, total orders, revenue.
-- BR-201: non-commercial orders excluded via non_commercial_order_classes().
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_customer_growth_monthly AS
WITH commercial_orders AS (
  SELECT
    o.id                                        AS order_id,
    o.customer_id,
    o.order_total_inr,
    date_trunc('month', o.ordered_at)::date     AS cohort_month
  FROM orders o
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  WHERE o.status NOT IN ('cancelled','refunded','failed','trash')
    AND COALESCE(oc.classification, 'paid_sale'::order_class)
        != ALL(non_commercial_order_classes())
    AND o.customer_id IS NOT NULL
),
first_month_per_customer AS (
  SELECT customer_id, MIN(cohort_month) AS first_month
  FROM   commercial_orders
  GROUP  BY customer_id
)
SELECT
  co.cohort_month,
  COUNT(DISTINCT CASE WHEN co.cohort_month = fm.first_month THEN co.customer_id END) AS new_customers,
  COUNT(DISTINCT CASE WHEN co.cohort_month > fm.first_month THEN co.customer_id END) AS returning_customers,
  COUNT(co.order_id)                                                                   AS total_orders,
  ROUND(COALESCE(SUM(co.order_total_inr), 0), 2)                                     AS revenue_inr
FROM commercial_orders co
JOIN first_month_per_customer fm ON fm.customer_id = co.customer_id
GROUP BY co.cohort_month
ORDER BY co.cohort_month;

ALTER VIEW v_customer_growth_monthly OWNER TO postgres;
GRANT SELECT ON v_customer_growth_monthly TO anon, authenticated;


-- ---------------------------------------------------------------------------
-- 3. v_top_cities
-- All-time city rollup: orders, revenue, unique customers.
-- BR-201: non-commercial orders excluded via non_commercial_order_classes().
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_top_cities AS
SELECT
  COALESCE(NULLIF(TRIM(o.billing_city), ''), 'Unknown') AS city,
  COUNT(o.id)                                            AS orders_count,
  ROUND(COALESCE(SUM(o.order_total_inr), 0), 2)         AS revenue_inr,
  COUNT(DISTINCT o.customer_id)                          AS customer_count
FROM orders o
LEFT JOIN order_classifications oc ON oc.order_id = o.id
WHERE o.status NOT IN ('cancelled','refunded','failed','trash')
  AND COALESCE(oc.classification, 'paid_sale'::order_class)
      != ALL(non_commercial_order_classes())
GROUP BY COALESCE(NULLIF(TRIM(o.billing_city), ''), 'Unknown')
ORDER BY revenue_inr DESC;

ALTER VIEW v_top_cities OWNER TO postgres;
GRANT SELECT ON v_top_cities TO anon, authenticated;


-- ---------------------------------------------------------------------------
-- 4. v_system_alerts
-- Live rule-based alerts computed from current DB state.
-- severity: 'RED' | 'AMBER' | 'GREEN'
-- GREEN emits a single "all clear" row only when no RED/AMBER conditions fire.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_system_alerts AS
WITH metrics AS (
  -- Single cross-join of scalar subqueries → one row with all current metrics
  SELECT
    ub.unclassified_bank_cnt,
    co.cod_outstanding_inr,
    co.cod_outstanding_cnt,
    ie.unresolved_errors_cnt,
    ir.sync_failures_7d,
    uo.unclassified_orders_cnt,
    inv.out_of_stock_cnt,
    inv.low_stock_cnt
  FROM
    (SELECT COUNT(*) AS unclassified_bank_cnt
     FROM bank_transactions
     WHERE transaction_type = 'unclassified')                                         ub,

    (SELECT
       COALESCE(SUM(o.order_total_inr), 0) AS cod_outstanding_inr,
       COUNT(*)                             AS cod_outstanding_cnt
     FROM order_classifications oc
     JOIN orders o ON o.id = oc.order_id
     WHERE oc.classification = 'cod_pending')                                         co,

    (SELECT COUNT(*) AS unresolved_errors_cnt
     FROM import_errors
     WHERE severity = 'error' AND resolution_status = 'unresolved')                  ie,

    (SELECT COUNT(*) AS sync_failures_7d
     FROM import_runs
     WHERE status = 'failed'
       AND run_started_at > now() - interval '7 days')                               ir,

    (SELECT COUNT(*) AS unclassified_orders_cnt
     FROM orders o2
     WHERE NOT EXISTS (
       SELECT 1 FROM order_classifications oc2 WHERE oc2.order_id = o2.id
     ))                                                                               uo,

    (SELECT
       COUNT(*) FILTER (WHERE is_active AND current_stock = 0 AND opening_stock > 0)
                                                                    AS out_of_stock_cnt,
       COUNT(*) FILTER (WHERE is_active AND current_stock > 0
                          AND reorder_point > 0 AND current_stock <= reorder_point)
                                                                    AS low_stock_cnt
     FROM inventory_items)                                                            inv
)
SELECT severity, alert_type, title, detail, now() AS raised_at
FROM (

  -- RED: unclassified bank transactions > 10
  SELECT 'RED'   AS severity,
         'unclassified_bank' AS alert_type,
         'Unclassified Bank Transactions' AS title,
         m.unclassified_bank_cnt::text
           || ' bank transactions are unclassified — review required' AS detail
  FROM metrics m WHERE m.unclassified_bank_cnt > 10

  UNION ALL

  -- AMBER: unclassified bank transactions 1–10
  SELECT 'AMBER', 'unclassified_bank',
         'Unclassified Bank Transactions',
         m.unclassified_bank_cnt::text || ' bank transactions need classification'
  FROM metrics m WHERE m.unclassified_bank_cnt BETWEEN 1 AND 10

  UNION ALL

  -- RED: unresolved import errors
  SELECT 'RED', 'import_errors',
         'Unresolved Import Errors',
         m.unresolved_errors_cnt::text || ' import errors require attention'
  FROM metrics m WHERE m.unresolved_errors_cnt > 0

  UNION ALL

  -- AMBER: COD outstanding > ₹2L
  SELECT 'AMBER', 'cod_outstanding',
         'High COD Outstanding',
         '₹' || ROUND(m.cod_outstanding_inr / 100000.0, 1)::text
           || 'L outstanding across ' || m.cod_outstanding_cnt::text || ' orders'
  FROM metrics m WHERE m.cod_outstanding_inr > 200000

  UNION ALL

  -- AMBER: sync failures in last 7 days
  SELECT 'AMBER', 'sync_failures',
         'Recent Sync Failures',
         m.sync_failures_7d::text || ' data sync runs failed in the last 7 days'
  FROM metrics m WHERE m.sync_failures_7d > 0

  UNION ALL

  -- AMBER: orders with no classification record
  SELECT 'AMBER', 'unclassified_orders',
         'Orders Without Classification',
         m.unclassified_orders_cnt::text || ' orders have no classification record'
  FROM metrics m WHERE m.unclassified_orders_cnt > 0

  UNION ALL

  -- AMBER: out-of-stock items
  SELECT 'AMBER', 'inventory_out_of_stock',
         'Items Out of Stock',
         m.out_of_stock_cnt::text || ' SKUs are out of stock'
  FROM metrics m WHERE m.out_of_stock_cnt > 0

  UNION ALL

  -- AMBER: low-stock items
  SELECT 'AMBER', 'inventory_low_stock',
         'Low Stock Warning',
         m.low_stock_cnt::text || ' SKUs are at or below their reorder point'
  FROM metrics m WHERE m.low_stock_cnt > 0

  UNION ALL

  -- GREEN: all clear (only emitted when every condition above is false)
  SELECT 'GREEN', 'system_ok',
         'All Systems Healthy',
         'No alerts — data quality and operations look good'
  FROM metrics m
  WHERE m.unclassified_bank_cnt = 0
    AND m.unresolved_errors_cnt = 0
    AND m.cod_outstanding_inr <= 200000
    AND m.sync_failures_7d = 0
    AND m.unclassified_orders_cnt = 0
    AND m.out_of_stock_cnt = 0
    AND m.low_stock_cnt = 0

) alerts;

ALTER VIEW v_system_alerts OWNER TO postgres;
GRANT SELECT ON v_system_alerts TO anon, authenticated;
