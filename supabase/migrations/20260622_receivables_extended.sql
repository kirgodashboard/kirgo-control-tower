-- =============================================================================
-- Migration: Extended Receivables RPCs
-- Adds 7 new functions for the full Receivables Dashboard.
-- BR-201 + warranty (5 types) are excluded from receivables context.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- receivables_excluded_classes: canonical 5-type exclusion for receivables
-- (BR-201 4 types + warranty)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION receivables_excluded_classes()
RETURNS order_class[]
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path = public AS $$
SELECT ARRAY[
  'influencer_promotion'::order_class,
  'brand_seeding'::order_class,
  'internal_use'::order_class,
  'replacement'::order_class,
  'warranty'::order_class
]$$;

GRANT EXECUTE ON FUNCTION receivables_excluded_classes() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_receivables_kpis: 6 KPIs for the receivables dashboard header
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_receivables_kpis()
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cod_inr             numeric := 0;
  v_cod_count           int     := 0;
  v_avg_days            numeric := 0;
  v_overdue_inr         numeric := 0;
  v_overdue_count       int     := 0;
  v_settle_pending_inr  numeric := 0;
  v_settle_pending_cnt  int     := 0;
  v_total_gateway_inr   numeric := 0;
  v_settled_inr         numeric := 0;
  v_efficiency          numeric := 0;
BEGIN
  -- COD pending (genuinely commercial orders)
  SELECT
    COALESCE(SUM(o.order_total_inr), 0),
    COUNT(*)::int,
    ROUND(COALESCE(AVG(CURRENT_DATE - o.ordered_at::date), 0), 1),
    COALESCE(SUM(CASE WHEN (CURRENT_DATE - o.ordered_at::date) > 30 THEN o.order_total_inr ELSE 0 END), 0),
    COUNT(CASE WHEN (CURRENT_DATE - o.ordered_at::date) > 30 THEN 1 END)::int
  INTO v_cod_inr, v_cod_count, v_avg_days, v_overdue_inr, v_overdue_count
  FROM order_classifications oc
  JOIN orders o ON o.id = oc.order_id
  WHERE oc.classification = 'cod_pending';

  -- Gateway settlement pending (not yet reconciled to bank)
  SELECT
    COALESCE(SUM(amount_inr), 0),
    COUNT(*)::int
  INTO v_settle_pending_inr, v_settle_pending_cnt
  FROM gateway_settlements
  WHERE bank_transaction_id IS NULL;

  -- Collection efficiency: fraction of gateway settlement value bank-reconciled
  SELECT
    COALESCE(SUM(amount_inr), 0),
    COALESCE(SUM(CASE WHEN bank_transaction_id IS NOT NULL THEN amount_inr ELSE 0 END), 0)
  INTO v_total_gateway_inr, v_settled_inr
  FROM gateway_settlements;

  IF v_total_gateway_inr > 0 THEN
    v_efficiency := ROUND(100.0 * v_settled_inr / v_total_gateway_inr, 1);
  END IF;

  RETURN json_build_object(
    'total_receivables_inr',      ROUND(v_cod_inr + v_settle_pending_inr, 2),
    'cod_pending_inr',             ROUND(v_cod_inr, 2),
    'cod_pending_count',           v_cod_count,
    'settlement_pending_inr',      ROUND(v_settle_pending_inr, 2),
    'settlement_pending_count',    v_settle_pending_cnt,
    'avg_collection_days',         v_avg_days,
    'overdue_inr',                 ROUND(v_overdue_inr, 2),
    'overdue_count',               v_overdue_count,
    'collection_efficiency_pct',   v_efficiency
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_receivables_kpis() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_customer_receivables: COD-pending orders for the Customer table
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_customer_receivables(p_limit int DEFAULT 100)
RETURNS TABLE (
  order_id              int,
  woocommerce_order_id  int,
  customer_name         text,
  ordered_at            date,
  amount_inr            numeric,
  status                text,
  days_outstanding      int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
SELECT
  o.id,
  o.woocommerce_order_id,
  COALESCE(
    NULLIF(TRIM(c.first_name || ' ' || c.last_name), ''),
    c.email,
    'Unknown'
  )                                        AS customer_name,
  o.ordered_at::date,
  o.order_total_inr,
  o.status,
  (CURRENT_DATE - o.ordered_at::date)::int AS days_outstanding
FROM order_classifications oc
JOIN orders o  ON o.id = oc.order_id
LEFT JOIN customers c ON c.id = o.customer_id
WHERE oc.classification = 'cod_pending'
ORDER BY days_outstanding DESC
LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION get_customer_receivables(int) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_cod_receivables: COD orders with shipment tracking for COD table
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_cod_receivables(p_limit int DEFAULT 100)
RETURNS TABLE (
  order_id                  int,
  woocommerce_order_id      int,
  customer_name             text,
  cod_amount_inr            numeric,
  shipment_status           text,
  expected_settlement_date  date
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
SELECT
  o.id,
  o.woocommerce_order_id,
  COALESCE(
    NULLIF(TRIM(c.first_name || ' ' || c.last_name), ''),
    c.email,
    'Unknown'
  )                                                    AS customer_name,
  o.order_total_inr                                    AS cod_amount_inr,
  COALESCE(s.status, 'no_shipment')                   AS shipment_status,
  CASE
    WHEN s.cod_remittance_date IS NOT NULL THEN s.cod_remittance_date
    WHEN s.delivered_at IS NOT NULL        THEN (s.delivered_at::date + INTERVAL '7 days')::date
    ELSE NULL
  END                                                  AS expected_settlement_date
FROM order_classifications oc
JOIN orders o  ON o.id = oc.order_id
LEFT JOIN customers c ON c.id = o.customer_id
LEFT JOIN LATERAL (
  SELECT status, delivered_at, cod_remittance_date
  FROM shipments sh
  WHERE sh.order_id = o.id
  ORDER BY sh.created_at DESC
  LIMIT 1
) s ON TRUE
WHERE oc.classification = 'cod_pending'
ORDER BY o.ordered_at DESC
LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION get_cod_receivables(int) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_settlement_pending: gateway settlements awaiting bank reconciliation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_settlement_pending()
RETURNS TABLE (
  gateway               text,
  settlement_reference  text,
  amount_inr            numeric,
  order_count           int,
  settled_at            date,
  age_days              int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
SELECT
  gs.gateway,
  gs.settlement_reference,
  gs.amount_inr,
  gs.order_count,
  gs.settled_at,
  (CURRENT_DATE - gs.created_at::date)::int AS age_days
FROM gateway_settlements gs
WHERE gs.bank_transaction_id IS NULL
ORDER BY age_days DESC;
$$;

GRANT EXECUTE ON FUNCTION get_settlement_pending() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_receivables_trend: weekly COD receivables intake for trend chart
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_receivables_trend(p_days int DEFAULT 90)
RETURNS TABLE (
  period               text,
  new_receivables_inr  numeric,
  order_count          int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
SELECT
  TO_CHAR(DATE_TRUNC('week', o.ordered_at), 'YYYY-MM-DD') AS period,
  COALESCE(SUM(o.order_total_inr), 0)                     AS new_receivables_inr,
  COUNT(*)::int                                            AS order_count
FROM order_classifications oc
JOIN orders o ON o.id = oc.order_id
WHERE oc.classification = 'cod_pending'
  AND o.ordered_at >= (CURRENT_DATE - p_days)
GROUP BY DATE_TRUNC('week', o.ordered_at)
ORDER BY DATE_TRUNC('week', o.ordered_at);
$$;

GRANT EXECUTE ON FUNCTION get_receivables_trend(int) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_receivables_ageing: 5 buckets for the ageing chart + summary
-- Buckets: current (0–7d), 8–30d, 31–60d, 61–90d, 90+d
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_receivables_ageing()
RETURNS TABLE (
  bucket        text,
  bucket_label  text,
  order_count   int,
  amount_inr    numeric,
  sort_order    int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
SELECT
  CASE
    WHEN (CURRENT_DATE - o.ordered_at::date) <= 7  THEN 'current'
    WHEN (CURRENT_DATE - o.ordered_at::date) <= 30 THEN '0_30'
    WHEN (CURRENT_DATE - o.ordered_at::date) <= 60 THEN '31_60'
    WHEN (CURRENT_DATE - o.ordered_at::date) <= 90 THEN '61_90'
    ELSE '90_plus'
  END                                              AS bucket,
  CASE
    WHEN (CURRENT_DATE - o.ordered_at::date) <= 7  THEN 'Current (0–7d)'
    WHEN (CURRENT_DATE - o.ordered_at::date) <= 30 THEN '8–30 Days'
    WHEN (CURRENT_DATE - o.ordered_at::date) <= 60 THEN '31–60 Days'
    WHEN (CURRENT_DATE - o.ordered_at::date) <= 90 THEN '61–90 Days'
    ELSE '90+ Days'
  END                                              AS bucket_label,
  COUNT(*)::int                                    AS order_count,
  COALESCE(SUM(o.order_total_inr), 0)             AS amount_inr,
  CASE
    WHEN (CURRENT_DATE - o.ordered_at::date) <= 7  THEN 1
    WHEN (CURRENT_DATE - o.ordered_at::date) <= 30 THEN 2
    WHEN (CURRENT_DATE - o.ordered_at::date) <= 60 THEN 3
    WHEN (CURRENT_DATE - o.ordered_at::date) <= 90 THEN 4
    ELSE 5
  END                                              AS sort_order
FROM order_classifications oc
JOIN orders o ON o.id = oc.order_id
WHERE oc.classification = 'cod_pending'
GROUP BY bucket, bucket_label, sort_order
ORDER BY sort_order;
$$;

GRANT EXECUTE ON FUNCTION get_receivables_ageing() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_collection_performance: monthly gateway settlement efficiency trend
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_collection_performance()
RETURNS TABLE (
  period              text,
  amount_settled_inr  numeric,
  amount_pending_inr  numeric,
  efficiency_pct      numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
SELECT
  TO_CHAR(DATE_TRUNC('month', gs.created_at), 'Mon YYYY') AS period,
  COALESCE(SUM(CASE WHEN gs.bank_transaction_id IS NOT NULL THEN gs.amount_inr ELSE 0 END), 0) AS amount_settled_inr,
  COALESCE(SUM(CASE WHEN gs.bank_transaction_id IS NULL     THEN gs.amount_inr ELSE 0 END), 0) AS amount_pending_inr,
  ROUND(
    100.0 * SUM(CASE WHEN gs.bank_transaction_id IS NOT NULL THEN gs.amount_inr ELSE 0 END) /
    NULLIF(SUM(gs.amount_inr), 0),
    1
  )                                                         AS efficiency_pct
FROM gateway_settlements gs
GROUP BY DATE_TRUNC('month', gs.created_at)
ORDER BY DATE_TRUNC('month', gs.created_at);
$$;

GRANT EXECUTE ON FUNCTION get_collection_performance() TO anon, authenticated;
