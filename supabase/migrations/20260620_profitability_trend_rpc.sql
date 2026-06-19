-- =============================================================================
-- MIGRATION: Profitability trend RPC + return_cost_inr in KPI function
-- Phase 2 / Profitability Engine — Sprint continuation
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Update get_profitability_kpis — add return_cost_inr field
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_profitability_kpis(p_start date, p_end date)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH delivered_orders AS (
  SELECT DISTINCT ON (o.id)
    o.id                              AS order_id,
    s.delivered_at::date              AS delivered_date,
    COALESCE(s.freight_total_inr, 0)  AS freight,
    COALESCE(s.cod_charges_inr, 0)    AS cod_charge
  FROM orders o
  JOIN shipments s ON s.order_id = o.id
  WHERE s.status = 'DELIVERED'
    AND s.delivered_at::date BETWEEN p_start AND p_end
  ORDER BY o.id, s.delivered_at DESC
),
lines AS (
  SELECT
    COALESCE(ol.line_total_inr, 0) AS line_revenue,
    ol.quantity * COALESCE(
      (SELECT pc.landed_cost_inr FROM product_costs pc
       WHERE pc.variant_id = ol.variant_id
         AND pc.effective_from <= dord.delivered_date
       ORDER BY pc.effective_from DESC LIMIT 1),
      CASE WHEN ol.variant_id IS NOT NULL THEN
        (SELECT p.cogs_total_inr FROM product_variants pv
         JOIN products p ON p.id = pv.product_id
         WHERE pv.id = ol.variant_id LIMIT 1)
      ELSE 0 END
    ) AS line_cogs
  FROM order_lines ol
  JOIN delivered_orders dord ON dord.order_id = ol.order_id
  WHERE ol.line_total_inr IS NOT NULL
),
rev_cogs AS (
  SELECT
    COALESCE(SUM(line_revenue), 0) AS revenue,
    COALESCE(SUM(line_cogs), 0)    AS cogs
  FROM lines
),
ship_totals AS (
  SELECT
    COALESCE(SUM(freight), 0)    AS total_freight,
    COALESCE(SUM(cod_charge), 0) AS total_cod
  FROM delivered_orders
),
ad AS (
  SELECT COALESCE(SUM(spend_inr), 0) AS spend
  FROM ad_spend_daily
  WHERE spend_date BETWEEN p_start AND p_end
),
return_cogs AS (
  SELECT COALESCE(SUM(
    ol.quantity * COALESCE(
      (SELECT pc.landed_cost_inr FROM product_costs pc
       WHERE pc.variant_id = ol.variant_id
         AND pc.effective_from <= rorders.rto_date
       ORDER BY pc.effective_from DESC LIMIT 1),
      CASE WHEN ol.variant_id IS NOT NULL THEN
        (SELECT p.cogs_total_inr FROM product_variants pv
         JOIN products p ON p.id = pv.product_id
         WHERE pv.id = ol.variant_id LIMIT 1)
      ELSE 0 END
    )
  ), 0) AS ret_cost
  FROM (
    SELECT DISTINCT ON (o.id)
      o.id AS order_id,
      s.created_at::date AS rto_date
    FROM orders o
    JOIN shipments s ON s.order_id = o.id
    WHERE s.status IN ('RTO', 'RETURNED', 'RETURN_DELIVERED')
      AND s.created_at::date BETWEEN p_start AND p_end
    ORDER BY o.id, s.created_at DESC
  ) rorders
  JOIN order_lines ol ON ol.order_id = rorders.order_id
  WHERE ol.variant_id IS NOT NULL
)
SELECT json_build_object(
  'revenue_inr',             ROUND(rc.revenue, 2),
  'cogs_inr',                ROUND(rc.cogs, 2),
  'gross_profit_inr',        ROUND(rc.revenue - rc.cogs, 2),
  'gross_margin_pct',        ROUND((rc.revenue - rc.cogs) / NULLIF(rc.revenue, 0) * 100, 1),
  'shipping_cost_inr',       ROUND(st.total_freight, 2),
  'cod_charges_inr',         ROUND(st.total_cod, 2),
  'ad_spend_inr',            ROUND(a.spend, 2),
  'contribution_margin_inr', ROUND(rc.revenue - rc.cogs - st.total_freight - st.total_cod - a.spend, 2),
  'contribution_margin_pct', ROUND(
    (rc.revenue - rc.cogs - st.total_freight - st.total_cod - a.spend)
    / NULLIF(rc.revenue, 0) * 100, 1),
  'return_cost_inr',         ROUND(rcogs.ret_cost, 2)
)
FROM rev_cogs rc, ship_totals st, ad a, return_cogs rcogs;
$$;

GRANT EXECUTE ON FUNCTION get_profitability_kpis(date, date) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_profitability_trend(p_start, p_end)
-- Weekly buckets for ≤90 days, monthly otherwise
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_profitability_trend(p_start date, p_end date)
RETURNS TABLE (
  period           text,
  revenue_inr      numeric,
  cogs_inr         numeric,
  gross_profit_inr numeric,
  gross_margin_pct numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH delivered_orders AS (
  SELECT DISTINCT ON (o.id)
    o.id                    AS order_id,
    s.delivered_at::date    AS delivered_date,
    CASE
      WHEN (p_end - p_start) <= 90 THEN date_trunc('week',  s.delivered_at)::date
      ELSE                               date_trunc('month', s.delivered_at)::date
    END AS period_bucket
  FROM orders o
  JOIN shipments s ON s.order_id = o.id
  WHERE s.status = 'DELIVERED'
    AND s.delivered_at::date BETWEEN p_start AND p_end
  ORDER BY o.id, s.delivered_at DESC
),
lines AS (
  SELECT
    dord.period_bucket,
    COALESCE(ol.line_total_inr, 0) AS line_revenue,
    ol.quantity * COALESCE(
      (SELECT pc.landed_cost_inr FROM product_costs pc
       WHERE pc.variant_id = ol.variant_id
         AND pc.effective_from <= dord.delivered_date
       ORDER BY pc.effective_from DESC LIMIT 1),
      CASE WHEN ol.variant_id IS NOT NULL THEN
        (SELECT p.cogs_total_inr FROM product_variants pv
         JOIN products p ON p.id = pv.product_id
         WHERE pv.id = ol.variant_id LIMIT 1)
      ELSE 0 END
    ) AS line_cogs
  FROM order_lines ol
  JOIN delivered_orders dord ON dord.order_id = ol.order_id
  WHERE ol.line_total_inr IS NOT NULL
)
SELECT
  period_bucket::text                                                                   AS period,
  ROUND(SUM(line_revenue), 2)                                                           AS revenue_inr,
  ROUND(SUM(line_cogs), 2)                                                              AS cogs_inr,
  ROUND(SUM(line_revenue) - SUM(line_cogs), 2)                                          AS gross_profit_inr,
  ROUND((SUM(line_revenue) - SUM(line_cogs)) / NULLIF(SUM(line_revenue), 0) * 100, 1)  AS gross_margin_pct
FROM lines
GROUP BY period_bucket
ORDER BY period_bucket;
$$;

GRANT EXECUTE ON FUNCTION get_profitability_trend(date, date) TO anon, authenticated;
