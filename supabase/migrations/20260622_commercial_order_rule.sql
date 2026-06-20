-- =============================================================================
-- BUSINESS RULE: Commercial Order Classification
-- BR-201: Orders classified as influencer_promotion, brand_seeding,
--         internal_use, or replacement are NON-COMMERCIAL.
-- EXCLUDED from: Revenue KPIs, Customer Sales KPIs, Receivables
-- INCLUDED in:  Marketing Spend (promo_spend_inr), Inventory Consumption,
--               Promotion Analysis (get_promo_spend_summary)
-- This rule is enforced via non_commercial_order_classes() — every RPC that
-- touches revenue, orders counts, or customer metrics must reference it.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Canonical rule anchor
-- All RPCs must filter: COALESCE(oc.classification, 'paid_sale') != ALL(non_commercial_order_classes())
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION non_commercial_order_classes()
RETURNS order_class[]
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT ARRAY[
    'influencer_promotion'::order_class,
    'brand_seeding'::order_class,
    'internal_use'::order_class,
    'replacement'::order_class
  ]
$$;

GRANT EXECUTE ON FUNCTION non_commercial_order_classes() TO anon, authenticated;


-- =============================================================================
-- PART 1: Fix existing profitability RPCs
-- =============================================================================

-- get_profitability_kpis
-- Definitive version:
--   - excludes all 4 non-commercial types from revenue/cogs
--   - promo_spend_inr includes all 4 types (not just influencer+brand)
--   - return_cost_inr properly computed (not hardcoded 0)
-- =============================================================================
CREATE OR REPLACE FUNCTION get_profitability_kpis(p_start date, p_end date)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH commercial_delivered AS (
  SELECT DISTINCT ON (o.id)
    o.id                              AS order_id,
    s.delivered_at::date              AS delivered_date,
    COALESCE(s.freight_total_inr, 0)  AS freight,
    COALESCE(s.cod_charges_inr, 0)    AS cod_charge
  FROM orders o
  JOIN shipments s ON s.order_id = o.id
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  WHERE s.status = 'DELIVERED'
    AND s.delivered_at::date BETWEEN p_start AND p_end
    AND COALESCE(oc.classification, 'paid_sale'::order_class) != ALL(non_commercial_order_classes())
  ORDER BY o.id, s.delivered_at DESC
),
lines AS (
  SELECT
    COALESCE(ol.line_total_inr, 0)   AS line_revenue,
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
  JOIN commercial_delivered dord ON dord.order_id = ol.order_id
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
  FROM commercial_delivered
),
ad AS (
  SELECT COALESCE(SUM(spend_inr), 0) AS spend
  FROM ad_spend_daily
  WHERE spend_date BETWEEN p_start AND p_end
),
promo AS (
  SELECT COALESCE(SUM(o.order_total_inr), 0) AS promo_spend
  FROM order_classifications oc
  JOIN orders o ON o.id = oc.order_id
  WHERE oc.classification = ANY(non_commercial_order_classes())
    AND o.ordered_at::date BETWEEN p_start AND p_end
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
    WHERE s.status IN ('RTO','RETURNED','RETURN_DELIVERED')
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
  'promo_spend_inr',         ROUND(p.promo_spend, 2),
  'contribution_margin_inr', ROUND(rc.revenue - rc.cogs - st.total_freight - st.total_cod - a.spend - p.promo_spend, 2),
  'contribution_margin_pct', ROUND(
    (rc.revenue - rc.cogs - st.total_freight - st.total_cod - a.spend - p.promo_spend)
    / NULLIF(rc.revenue, 0) * 100, 1),
  'return_cost_inr',         ROUND(rcogs.ret_cost, 2)
)
FROM rev_cogs rc, ship_totals st, ad a, promo p, return_cogs rcogs;
$$;

GRANT EXECUTE ON FUNCTION get_profitability_kpis(date, date) TO anon, authenticated;

-- get_profitability_trend
CREATE OR REPLACE FUNCTION get_profitability_trend(p_start date, p_end date)
RETURNS TABLE (
  period           text,
  revenue_inr      numeric,
  cogs_inr         numeric,
  gross_profit_inr numeric,
  gross_margin_pct numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH commercial_delivered AS (
  SELECT DISTINCT ON (o.id)
    o.id                    AS order_id,
    s.delivered_at::date    AS delivered_date,
    CASE
      WHEN (p_end - p_start) <= 90 THEN date_trunc('week',  s.delivered_at)::date
      ELSE                               date_trunc('month', s.delivered_at)::date
    END AS period_bucket
  FROM orders o
  JOIN shipments s ON s.order_id = o.id
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  WHERE s.status = 'DELIVERED'
    AND s.delivered_at::date BETWEEN p_start AND p_end
    AND COALESCE(oc.classification, 'paid_sale'::order_class) != ALL(non_commercial_order_classes())
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
  JOIN commercial_delivered dord ON dord.order_id = ol.order_id
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

-- get_product_pl
CREATE OR REPLACE FUNCTION get_product_pl(p_start date, p_end date)
RETURNS TABLE (
  product_name     text,
  launch_code      text,
  product_type     text,
  orders_count     int,
  units_sold       int,
  revenue_inr      numeric,
  cogs_inr         numeric,
  gross_profit_inr numeric,
  gross_margin_pct numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH commercial_delivered AS (
  SELECT DISTINCT ON (o.id)
    o.id AS order_id, o.woocommerce_order_id, s.delivered_at::date AS delivered_date
  FROM orders o
  JOIN shipments s ON s.order_id = o.id
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  WHERE s.status = 'DELIVERED'
    AND s.delivered_at::date BETWEEN p_start AND p_end
    AND COALESCE(oc.classification, 'paid_sale'::order_class) != ALL(non_commercial_order_classes())
  ORDER BY o.id, s.delivered_at DESC
),
base AS (
  SELECT
    p.id AS product_id, p.name AS product_name,
    l.code AS launch_code, p.product_type,
    dord.woocommerce_order_id,
    ol.quantity,
    COALESCE(ol.line_total_inr, 0) AS line_revenue,
    ol.quantity * COALESCE(
      (SELECT pc.landed_cost_inr FROM product_costs pc
       WHERE pc.variant_id = ol.variant_id AND pc.effective_from <= dord.delivered_date
       ORDER BY pc.effective_from DESC LIMIT 1),
      p.cogs_total_inr
    ) AS line_cogs
  FROM order_lines ol
  JOIN commercial_delivered dord ON dord.order_id = ol.order_id
  JOIN product_variants pv ON pv.id = ol.variant_id
  JOIN products p ON p.id = pv.product_id
  JOIN launches l ON l.id = p.launch_id
  WHERE ol.line_total_inr IS NOT NULL AND ol.variant_id IS NOT NULL
)
SELECT
  product_name, launch_code, product_type,
  COUNT(DISTINCT woocommerce_order_id)::int          AS orders_count,
  SUM(quantity)::int                                 AS units_sold,
  ROUND(SUM(line_revenue), 2)                        AS revenue_inr,
  ROUND(SUM(line_cogs), 2)                           AS cogs_inr,
  ROUND(SUM(line_revenue) - SUM(line_cogs), 2)       AS gross_profit_inr,
  ROUND((SUM(line_revenue) - SUM(line_cogs)) / NULLIF(SUM(line_revenue), 0) * 100, 1) AS gross_margin_pct
FROM base
GROUP BY product_id, product_name, launch_code, product_type
ORDER BY SUM(line_revenue) DESC;
$$;

GRANT EXECUTE ON FUNCTION get_product_pl(date, date) TO anon, authenticated;

-- get_sku_pl
CREATE OR REPLACE FUNCTION get_sku_pl(p_start date, p_end date)
RETURNS TABLE (
  sku              text,
  product_name     text,
  launch_code      text,
  size             text,
  orders_count     int,
  units_sold       int,
  revenue_inr      numeric,
  cogs_inr         numeric,
  gross_profit_inr numeric,
  gross_margin_pct numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH commercial_delivered AS (
  SELECT DISTINCT ON (o.id)
    o.id AS order_id, o.woocommerce_order_id, s.delivered_at::date AS delivered_date
  FROM orders o
  JOIN shipments s ON s.order_id = o.id
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  WHERE s.status = 'DELIVERED'
    AND s.delivered_at::date BETWEEN p_start AND p_end
    AND COALESCE(oc.classification, 'paid_sale'::order_class) != ALL(non_commercial_order_classes())
  ORDER BY o.id, s.delivered_at DESC
),
base AS (
  SELECT
    pv.id AS variant_id,
    COALESCE(pv.sku, 'SKU-' || pv.id::text) AS sku,
    p.name AS product_name, l.code AS launch_code, pv.size,
    dord.woocommerce_order_id, ol.quantity,
    COALESCE(ol.line_total_inr, 0) AS line_revenue,
    ol.quantity * COALESCE(
      (SELECT pc.landed_cost_inr FROM product_costs pc
       WHERE pc.variant_id = ol.variant_id AND pc.effective_from <= dord.delivered_date
       ORDER BY pc.effective_from DESC LIMIT 1),
      p.cogs_total_inr
    ) AS line_cogs
  FROM order_lines ol
  JOIN commercial_delivered dord ON dord.order_id = ol.order_id
  JOIN product_variants pv ON pv.id = ol.variant_id
  JOIN products p ON p.id = pv.product_id
  JOIN launches l ON l.id = p.launch_id
  WHERE ol.line_total_inr IS NOT NULL AND ol.variant_id IS NOT NULL
)
SELECT
  sku, product_name, launch_code, size,
  COUNT(DISTINCT woocommerce_order_id)::int          AS orders_count,
  SUM(quantity)::int                                 AS units_sold,
  ROUND(SUM(line_revenue), 2)                        AS revenue_inr,
  ROUND(SUM(line_cogs), 2)                           AS cogs_inr,
  ROUND(SUM(line_revenue) - SUM(line_cogs), 2)       AS gross_profit_inr,
  ROUND((SUM(line_revenue) - SUM(line_cogs)) / NULLIF(SUM(line_revenue), 0) * 100, 1) AS gross_margin_pct
FROM base
GROUP BY variant_id, sku, product_name, launch_code, size
ORDER BY SUM(line_revenue) DESC;
$$;

GRANT EXECUTE ON FUNCTION get_sku_pl(date, date) TO anon, authenticated;

-- get_city_pl
CREATE OR REPLACE FUNCTION get_city_pl(p_start date, p_end date)
RETURNS TABLE (
  city             text,
  orders_count     int,
  units_sold       int,
  revenue_inr      numeric,
  cogs_inr         numeric,
  gross_profit_inr numeric,
  gross_margin_pct numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH commercial_delivered AS (
  SELECT DISTINCT ON (o.id)
    o.id AS order_id, o.woocommerce_order_id,
    s.delivered_at::date AS delivered_date,
    COALESCE(NULLIF(TRIM(o.billing_city), ''), 'Unknown') AS city
  FROM orders o
  JOIN shipments s ON s.order_id = o.id
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  WHERE s.status = 'DELIVERED'
    AND s.delivered_at::date BETWEEN p_start AND p_end
    AND COALESCE(oc.classification, 'paid_sale'::order_class) != ALL(non_commercial_order_classes())
  ORDER BY o.id, s.delivered_at DESC
),
base AS (
  SELECT
    dord.city, dord.woocommerce_order_id, ol.quantity,
    COALESCE(ol.line_total_inr, 0) AS line_revenue,
    ol.quantity * COALESCE(
      CASE WHEN ol.variant_id IS NOT NULL THEN
        (SELECT pc.landed_cost_inr FROM product_costs pc
         WHERE pc.variant_id = ol.variant_id AND pc.effective_from <= dord.delivered_date
         ORDER BY pc.effective_from DESC LIMIT 1)
      END,
      CASE WHEN ol.variant_id IS NOT NULL THEN
        (SELECT p.cogs_total_inr FROM product_variants pv
         JOIN products p ON p.id = pv.product_id WHERE pv.id = ol.variant_id LIMIT 1)
      ELSE 0 END
    ) AS line_cogs
  FROM order_lines ol
  JOIN commercial_delivered dord ON dord.order_id = ol.order_id
  WHERE ol.line_total_inr IS NOT NULL
)
SELECT
  city,
  COUNT(DISTINCT woocommerce_order_id)::int                  AS orders_count,
  SUM(quantity)::int                                         AS units_sold,
  ROUND(SUM(line_revenue), 2)                                AS revenue_inr,
  ROUND(SUM(line_cogs), 2)                                   AS cogs_inr,
  ROUND(SUM(line_revenue) - SUM(line_cogs), 2)               AS gross_profit_inr,
  ROUND((SUM(line_revenue) - SUM(line_cogs)) / NULLIF(SUM(line_revenue), 0) * 100, 1) AS gross_margin_pct
FROM base
GROUP BY city
ORDER BY SUM(line_revenue) DESC
LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION get_city_pl(date, date) TO anon, authenticated;

-- get_launch_pl (all-time, no date filter)
CREATE OR REPLACE FUNCTION get_launch_pl()
RETURNS TABLE (
  launch_code          text,
  launch_name          text,
  launched_at          date,
  total_investment_inr numeric,
  revenue_inr          numeric,
  cogs_inr             numeric,
  gross_profit_inr     numeric,
  gross_margin_pct     numeric,
  orders_count         int,
  units_sold           int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH commercial_delivered AS (
  SELECT DISTINCT ON (o.id)
    o.id AS order_id, o.woocommerce_order_id, s.delivered_at::date AS delivered_date
  FROM orders o
  JOIN shipments s ON s.order_id = o.id
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  WHERE s.status = 'DELIVERED'
    AND COALESCE(oc.classification, 'paid_sale'::order_class) != ALL(non_commercial_order_classes())
  ORDER BY o.id, s.delivered_at DESC
),
base AS (
  SELECT
    l.id AS launch_id, l.code AS launch_code, l.name AS launch_name,
    l.launched_at, l.total_investment_inr,
    dord.woocommerce_order_id, ol.quantity,
    COALESCE(ol.line_total_inr, 0) AS line_revenue,
    ol.quantity * COALESCE(
      (SELECT pc.landed_cost_inr FROM product_costs pc
       WHERE pc.variant_id = ol.variant_id AND pc.effective_from <= dord.delivered_date
       ORDER BY pc.effective_from DESC LIMIT 1),
      p.cogs_total_inr
    ) AS line_cogs
  FROM order_lines ol
  JOIN commercial_delivered dord ON dord.order_id = ol.order_id
  JOIN product_variants pv ON pv.id = ol.variant_id
  JOIN products p ON p.id = pv.product_id
  JOIN launches l ON l.id = p.launch_id
  WHERE ol.line_total_inr IS NOT NULL AND ol.variant_id IS NOT NULL
)
SELECT
  launch_code, launch_name, launched_at, total_investment_inr,
  ROUND(SUM(line_revenue), 2)                        AS revenue_inr,
  ROUND(SUM(line_cogs), 2)                           AS cogs_inr,
  ROUND(SUM(line_revenue) - SUM(line_cogs), 2)       AS gross_profit_inr,
  ROUND((SUM(line_revenue) - SUM(line_cogs)) / NULLIF(SUM(line_revenue), 0) * 100, 1) AS gross_margin_pct,
  COUNT(DISTINCT woocommerce_order_id)::int          AS orders_count,
  SUM(quantity)::int                                 AS units_sold
FROM base
GROUP BY launch_id, launch_code, launch_name, launched_at, total_investment_inr
ORDER BY launched_at ASC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION get_launch_pl() TO anon, authenticated;

-- get_customer_pl (anonymised)
CREATE OR REPLACE FUNCTION get_customer_pl(p_start date, p_end date)
RETURNS TABLE (
  customer_ref     text,
  orders_count     int,
  units_sold       int,
  revenue_inr      numeric,
  cogs_inr         numeric,
  gross_profit_inr numeric,
  gross_margin_pct numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH commercial_delivered AS (
  SELECT DISTINCT ON (o.id)
    o.id AS order_id, o.woocommerce_order_id, o.customer_id, s.delivered_at::date AS delivered_date
  FROM orders o
  JOIN shipments s ON s.order_id = o.id
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  WHERE s.status = 'DELIVERED'
    AND s.delivered_at::date BETWEEN p_start AND p_end
    AND o.customer_id IS NOT NULL
    AND COALESCE(oc.classification, 'paid_sale'::order_class) != ALL(non_commercial_order_classes())
  ORDER BY o.id, s.delivered_at DESC
),
base AS (
  SELECT
    dord.customer_id, dord.woocommerce_order_id, ol.quantity,
    COALESCE(ol.line_total_inr, 0) AS line_revenue,
    ol.quantity * COALESCE(
      CASE WHEN ol.variant_id IS NOT NULL THEN
        (SELECT pc.landed_cost_inr FROM product_costs pc
         WHERE pc.variant_id = ol.variant_id AND pc.effective_from <= dord.delivered_date
         ORDER BY pc.effective_from DESC LIMIT 1)
      END,
      CASE WHEN ol.variant_id IS NOT NULL THEN
        (SELECT p.cogs_total_inr FROM product_variants pv
         JOIN products p ON p.id = pv.product_id WHERE pv.id = ol.variant_id LIMIT 1)
      ELSE 0 END
    ) AS line_cogs
  FROM order_lines ol
  JOIN commercial_delivered dord ON dord.order_id = ol.order_id
  WHERE ol.line_total_inr IS NOT NULL
)
SELECT
  'C-' || customer_id::text                          AS customer_ref,
  COUNT(DISTINCT woocommerce_order_id)::int          AS orders_count,
  SUM(quantity)::int                                 AS units_sold,
  ROUND(SUM(line_revenue), 2)                        AS revenue_inr,
  ROUND(SUM(line_cogs), 2)                           AS cogs_inr,
  ROUND(SUM(line_revenue) - SUM(line_cogs), 2)       AS gross_profit_inr,
  ROUND((SUM(line_revenue) - SUM(line_cogs)) / NULLIF(SUM(line_revenue), 0) * 100, 1) AS gross_margin_pct
FROM base
GROUP BY customer_id
ORDER BY SUM(line_revenue) DESC
LIMIT 100;
$$;

GRANT EXECUTE ON FUNCTION get_customer_pl(date, date) TO anon, authenticated;

-- get_promo_spend_summary: now includes all 4 non-commercial types
CREATE OR REPLACE FUNCTION get_promo_spend_summary(p_start date, p_end date)
RETURNS TABLE (
  classification    text,
  order_count       bigint,
  total_value_inr   numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
SELECT
  oc.classification::text,
  COUNT(*),
  COALESCE(SUM(o.order_total_inr), 0)
FROM order_classifications oc
JOIN orders o ON o.id = oc.order_id
WHERE oc.classification = ANY(non_commercial_order_classes())
  AND o.ordered_at::date BETWEEN p_start AND p_end
GROUP BY oc.classification
ORDER BY SUM(o.order_total_inr) DESC;
$$;

GRANT EXECUTE ON FUNCTION get_promo_spend_summary(date, date) TO anon, authenticated;


-- =============================================================================
-- PART 2: New RPCs — Executive, Revenue, Customer, Director
-- All apply the commercial order rule from the start.
-- Date dimension: ordered_at (real-time order intake view).
-- Profitability suite (above) uses delivered_at (P&L cash recognition).
-- =============================================================================

-- get_executive_kpis
CREATE OR REPLACE FUNCTION get_executive_kpis(p_start date, p_end date)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH commercial AS (
  SELECT
    o.id AS order_id,
    o.order_total_inr,
    o.customer_id,
    o.payment_method
  FROM orders o
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  WHERE o.ordered_at::date BETWEEN p_start AND p_end
    AND o.status NOT IN ('cancelled','refunded','failed','trash')
    AND COALESCE(oc.classification, 'paid_sale'::order_class) != ALL(non_commercial_order_classes())
),
totals AS (
  SELECT
    COUNT(*)                                          AS orders_count,
    COALESCE(SUM(order_total_inr), 0)                AS gross_revenue,
    COUNT(DISTINCT customer_id)                      AS unique_customers,
    COALESCE(ROUND(AVG(order_total_inr), 2), 0)      AS aov,
    COUNT(*) FILTER (WHERE payment_method ILIKE '%cod%') AS cod_count
  FROM commercial
),
new_custs AS (
  SELECT COUNT(*) AS cnt
  FROM (
    SELECT o2.customer_id
    FROM orders o2
    LEFT JOIN order_classifications oc2 ON oc2.order_id = o2.id
    WHERE o2.status NOT IN ('cancelled','refunded','failed','trash')
      AND o2.customer_id IS NOT NULL
      AND COALESCE(oc2.classification, 'paid_sale'::order_class) != ALL(non_commercial_order_classes())
    GROUP BY o2.customer_id
    HAVING MIN(o2.ordered_at::date) BETWEEN p_start AND p_end
  ) first_buyers
),
rto AS (
  SELECT COUNT(DISTINCT s.order_id) AS rto_count
  FROM shipments s
  JOIN commercial c ON c.order_id = s.order_id
  WHERE s.status IN ('RTO','RETURNED','RETURN_DELIVERED')
)
SELECT json_build_object(
  'gross_revenue_inr',  ROUND(t.gross_revenue, 2),
  'orders_count',       t.orders_count,
  'aov_inr',            t.aov,
  'unique_customers',   t.unique_customers,
  'new_customers',      nc.cnt,
  'cod_pct',            ROUND(t.cod_count::numeric / NULLIF(t.orders_count, 0) * 100, 1),
  'return_count',       r.rto_count,
  'return_rate_pct',    ROUND(r.rto_count::numeric / NULLIF(t.orders_count, 0) * 100, 1)
)
FROM totals t, new_custs nc, rto r;
$$;

GRANT EXECUTE ON FUNCTION get_executive_kpis(date, date) TO anon, authenticated;

-- get_revenue_trend
CREATE OR REPLACE FUNCTION get_revenue_trend(p_start date, p_end date, p_grain text DEFAULT 'day')
RETURNS TABLE (
  period        text,
  revenue_inr   numeric,
  orders_count  bigint,
  aov_inr       numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH commercial AS (
  SELECT
    CASE p_grain
      WHEN 'week'  THEN date_trunc('week',  o.ordered_at)::date
      WHEN 'month' THEN date_trunc('month', o.ordered_at)::date
      ELSE              o.ordered_at::date
    END AS period_bucket,
    o.order_total_inr
  FROM orders o
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  WHERE o.ordered_at::date BETWEEN p_start AND p_end
    AND o.status NOT IN ('cancelled','refunded','failed','trash')
    AND COALESCE(oc.classification, 'paid_sale'::order_class) != ALL(non_commercial_order_classes())
)
SELECT
  period_bucket::text                                         AS period,
  ROUND(COALESCE(SUM(order_total_inr), 0), 2)               AS revenue_inr,
  COUNT(*)                                                    AS orders_count,
  ROUND(COALESCE(AVG(order_total_inr), 0), 2)               AS aov_inr
FROM commercial
GROUP BY period_bucket
ORDER BY period_bucket;
$$;

GRANT EXECUTE ON FUNCTION get_revenue_trend(date, date, text) TO anon, authenticated;

-- get_period_comparison
CREATE OR REPLACE FUNCTION get_period_comparison(
  p_current_start date, p_current_end date,
  p_prior_start   date, p_prior_end   date
)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH current_period AS (
  SELECT COALESCE(SUM(o.order_total_inr), 0) AS revenue, COUNT(*) AS orders
  FROM orders o
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  WHERE o.ordered_at::date BETWEEN p_current_start AND p_current_end
    AND o.status NOT IN ('cancelled','refunded','failed','trash')
    AND COALESCE(oc.classification, 'paid_sale'::order_class) != ALL(non_commercial_order_classes())
),
prior_period AS (
  SELECT COALESCE(SUM(o.order_total_inr), 0) AS revenue, COUNT(*) AS orders
  FROM orders o
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  WHERE o.ordered_at::date BETWEEN p_prior_start AND p_prior_end
    AND o.status NOT IN ('cancelled','refunded','failed','trash')
    AND COALESCE(oc.classification, 'paid_sale'::order_class) != ALL(non_commercial_order_classes())
)
SELECT json_build_object(
  'current_revenue',    ROUND(c.revenue, 2),
  'prior_revenue',      ROUND(p.revenue, 2),
  'revenue_change_pct', ROUND((c.revenue - p.revenue) / NULLIF(p.revenue, 0) * 100, 1),
  'current_orders',     c.orders,
  'prior_orders',       p.orders,
  'orders_change_pct',  ROUND((c.orders - p.orders)::numeric / NULLIF(p.orders, 0) * 100, 1)
)
FROM current_period c, prior_period p;
$$;

GRANT EXECUTE ON FUNCTION get_period_comparison(date, date, date, date) TO anon, authenticated;

-- get_launch_performance
CREATE OR REPLACE FUNCTION get_launch_performance()
RETURNS TABLE (
  launch_id     text,
  launch_name   text,
  live_date     text,
  revenue_inr   numeric,
  orders_count  bigint,
  aov_inr       numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH commercial_launch_orders AS (
  SELECT
    l.id AS launch_id,
    o.id AS order_id,
    o.order_total_inr
  FROM orders o
  JOIN order_lines ol ON ol.order_id = o.id
  JOIN product_variants pv ON pv.id = ol.variant_id
  JOIN products p ON p.id = pv.product_id
  JOIN launches l ON l.id = p.launch_id
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  WHERE o.status NOT IN ('cancelled','refunded','failed','trash')
    AND COALESCE(oc.classification, 'paid_sale'::order_class) != ALL(non_commercial_order_classes())
)
SELECT
  l.code                                                                AS launch_id,
  l.name                                                                AS launch_name,
  COALESCE(l.launched_at::text, 'TBD')                                AS live_date,
  ROUND(COALESCE(SUM(clo.order_total_inr), 0), 2)                     AS revenue_inr,
  COUNT(DISTINCT clo.order_id)                                         AS orders_count,
  ROUND(
    COALESCE(SUM(clo.order_total_inr), 0) / NULLIF(COUNT(DISTINCT clo.order_id), 0), 2
  )                                                                     AS aov_inr
FROM launches l
LEFT JOIN commercial_launch_orders clo ON clo.launch_id = l.id
GROUP BY l.id, l.code, l.name, l.launched_at
ORDER BY l.launched_at ASC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION get_launch_performance() TO anon, authenticated;

-- get_customer_kpis
CREATE OR REPLACE FUNCTION get_customer_kpis(p_start date, p_end date)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH period_customers AS (
  SELECT
    o.customer_id,
    COUNT(*) AS period_order_count
  FROM orders o
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  WHERE o.ordered_at::date BETWEEN p_start AND p_end
    AND o.status NOT IN ('cancelled','refunded','failed','trash')
    AND o.customer_id IS NOT NULL
    AND COALESCE(oc.classification, 'paid_sale'::order_class) != ALL(non_commercial_order_classes())
  GROUP BY o.customer_id
),
new_customers AS (
  SELECT pc.customer_id
  FROM period_customers pc
  WHERE NOT EXISTS (
    SELECT 1
    FROM orders o2
    LEFT JOIN order_classifications oc2 ON oc2.order_id = o2.id
    WHERE o2.customer_id = pc.customer_id
      AND o2.ordered_at::date < p_start
      AND o2.status NOT IN ('cancelled','refunded','failed','trash')
      AND COALESCE(oc2.classification, 'paid_sale'::order_class) != ALL(non_commercial_order_classes())
  )
)
SELECT json_build_object(
  'total_customers',          COUNT(*),
  'new_customers',            COUNT(*) FILTER (WHERE pc.customer_id IN (SELECT customer_id FROM new_customers)),
  'repeat_customers',         COUNT(*) FILTER (WHERE pc.customer_id NOT IN (SELECT customer_id FROM new_customers)),
  'repeat_purchase_pct',      ROUND(
    COUNT(*) FILTER (WHERE pc.customer_id NOT IN (SELECT customer_id FROM new_customers))::numeric
    / NULLIF(COUNT(*), 0) * 100, 1
  ),
  'avg_orders_per_customer',  ROUND(AVG(period_order_count), 1)
)
FROM period_customers pc;
$$;

GRANT EXECUTE ON FUNCTION get_customer_kpis(date, date) TO anon, authenticated;

-- get_director_snapshot (MTD vs prior month; no date params)
CREATE OR REPLACE FUNCTION get_director_snapshot()
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mtd_start   date := date_trunc('month', CURRENT_DATE)::date;
  v_prior_start date := (date_trunc('month', CURRENT_DATE) - interval '1 month')::date;
  v_prior_end   date := (date_trunc('month', CURRENT_DATE) - interval '1 day')::date;

  v_rev_mtd     numeric := 0;
  v_rev_prior   numeric := 0;
  v_ord_mtd     bigint  := 0;
  v_ord_prior   bigint  := 0;
  v_cash        numeric := 0;
  v_cod_inr     numeric := 0;
  v_cod_cnt     bigint  := 0;
  v_delivered   bigint  := 0;
  v_rto         bigint  := 0;
  v_ret_mtd     bigint  := 0;
  v_repeat_pct  numeric := 0;
  v_status      text    := 'GREEN';
  v_red         int     := 0;
  v_amber       int     := 0;
BEGIN
  -- MTD commercial revenue + orders
  SELECT COALESCE(SUM(o.order_total_inr), 0), COUNT(*)
  INTO v_rev_mtd, v_ord_mtd
  FROM orders o
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  WHERE o.ordered_at::date BETWEEN v_mtd_start AND CURRENT_DATE
    AND o.status NOT IN ('cancelled','refunded','failed','trash')
    AND COALESCE(oc.classification, 'paid_sale'::order_class) != ALL(non_commercial_order_classes());

  -- Prior month commercial revenue + orders
  SELECT COALESCE(SUM(o.order_total_inr), 0), COUNT(*)
  INTO v_rev_prior, v_ord_prior
  FROM orders o
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  WHERE o.ordered_at::date BETWEEN v_prior_start AND v_prior_end
    AND o.status NOT IN ('cancelled','refunded','failed','trash')
    AND COALESCE(oc.classification, 'paid_sale'::order_class) != ALL(non_commercial_order_classes());

  -- Cash position (latest recorded bank balance)
  SELECT COALESCE(closing_balance_inr, 0)
  INTO v_cash
  FROM bank_transactions
  WHERE closing_balance_inr IS NOT NULL
  ORDER BY transaction_date DESC, id DESC
  LIMIT 1;

  -- COD outstanding (genuine commercial pendng orders)
  SELECT COALESCE(SUM(o.order_total_inr), 0), COUNT(*)
  INTO v_cod_inr, v_cod_cnt
  FROM order_classifications oc
  JOIN orders o ON o.id = oc.order_id
  WHERE oc.classification = 'cod_pending';

  -- MTD delivery success rate
  SELECT
    COUNT(*) FILTER (WHERE s.status = 'DELIVERED'),
    COUNT(*) FILTER (WHERE s.status IN ('RTO','RETURNED','RETURN_DELIVERED'))
  INTO v_delivered, v_rto
  FROM shipments s
  JOIN orders o ON o.id = s.order_id
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  WHERE s.created_at::date >= v_mtd_start
    AND COALESCE(oc.classification, 'paid_sale'::order_class) != ALL(non_commercial_order_classes());

  -- MTD returns (distinct order count)
  SELECT COUNT(DISTINCT s.order_id)
  INTO v_ret_mtd
  FROM shipments s
  JOIN orders o ON o.id = s.order_id
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  WHERE s.status IN ('RTO','RETURNED','RETURN_DELIVERED')
    AND s.created_at::date BETWEEN v_mtd_start AND CURRENT_DATE
    AND COALESCE(oc.classification, 'paid_sale'::order_class) != ALL(non_commercial_order_classes());

  -- All-time repeat customer %
  SELECT ROUND(
    COUNT(*) FILTER (WHERE ord_count > 1)::numeric / NULLIF(COUNT(*), 0) * 100, 1
  )
  INTO v_repeat_pct
  FROM (
    SELECT o.customer_id, COUNT(*) AS ord_count
    FROM orders o
    LEFT JOIN order_classifications oc ON oc.order_id = o.id
    WHERE o.status NOT IN ('cancelled','refunded','failed','trash')
      AND o.customer_id IS NOT NULL
      AND COALESCE(oc.classification, 'paid_sale'::order_class) != ALL(non_commercial_order_classes())
    GROUP BY o.customer_id
  ) t;

  -- System status thresholds
  -- RED: delivery rate < 70% OR revenue down > 25% MoM
  IF v_delivered + v_rto > 0
     AND v_delivered::numeric / (v_delivered + v_rto) < 0.70 THEN
    v_red := v_red + 1;
  END IF;
  IF v_rev_prior > 0
     AND (v_rev_mtd - v_rev_prior) / v_rev_prior < -0.25 THEN
    v_red := v_red + 1;
  END IF;
  -- AMBER: delivery rate < 85% OR COD > ₹2L OR revenue down > 10% MoM
  IF v_delivered + v_rto > 0
     AND v_delivered::numeric / (v_delivered + v_rto) < 0.85 THEN
    v_amber := v_amber + 1;
  END IF;
  IF v_cod_inr > 200000 THEN
    v_amber := v_amber + 1;
  END IF;
  IF v_rev_prior > 0
     AND (v_rev_mtd - v_rev_prior) / v_rev_prior < -0.10 THEN
    v_amber := v_amber + 1;
  END IF;

  IF    v_red   > 0 THEN v_status := 'RED';
  ELSIF v_amber > 0 THEN v_status := 'AMBER';
  END IF;

  RETURN json_build_object(
    'revenue_mtd_inr',          ROUND(v_rev_mtd, 2),
    'revenue_prior_month_inr',  ROUND(v_rev_prior, 2),
    'revenue_mtd_change_pct',   ROUND((v_rev_mtd - v_rev_prior) / NULLIF(v_rev_prior, 0) * 100, 1),
    'orders_mtd',               v_ord_mtd,
    'orders_prior_month',       v_ord_prior,
    'orders_mtd_change_pct',    ROUND((v_ord_mtd - v_ord_prior)::numeric / NULLIF(v_ord_prior, 0) * 100, 1),
    'cash_position_inr',        ROUND(v_cash, 2),
    'cod_outstanding_inr',      ROUND(v_cod_inr, 2),
    'cod_outstanding_count',    v_cod_cnt,
    'delivery_success_pct',     ROUND(v_delivered::numeric / NULLIF(v_delivered + v_rto, 0) * 100, 1),
    'rto_rate_pct',             ROUND(v_rto::numeric / NULLIF(v_delivered + v_rto, 0) * 100, 1),
    'return_rate_pct',          ROUND(v_ret_mtd::numeric / NULLIF(v_ord_mtd, 0) * 100, 1),
    'repeat_customer_pct',      COALESCE(v_repeat_pct, 0),
    'red_alert_count',          v_red,
    'amber_alert_count',        v_amber,
    'system_status',            v_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_director_snapshot() TO anon, authenticated;


-- =============================================================================
-- PART 3: Update get_data_quality_summary COD variance calculation
-- COD delivered should only count commercial orders (no gifted promos with COD)
-- =============================================================================
CREATE OR REPLACE FUNCTION get_data_quality_summary()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_unclassified_bank     bigint;
  v_missing_expenses      bigint;
  v_cod_delivered_inr     numeric;
  v_cod_received_inr      numeric;
  v_unclassified_orders   bigint;
  v_unmapped_lines        bigint;
  v_unresolved_errors     bigint;
  v_sync_failures_7d      bigint;
  v_last_sync_at          timestamptz;
  v_low_stock             bigint;
  v_out_of_stock          bigint;
  v_skus_no_inventory     bigint;
BEGIN
  SELECT COUNT(*) INTO v_unclassified_bank
  FROM bank_transactions
  WHERE transaction_type = 'unclassified'
    AND withdrawal_inr IS NOT NULL AND withdrawal_inr > 0;

  SELECT COUNT(*) INTO v_missing_expenses
  FROM bank_transactions bt
  WHERE bt.withdrawal_inr >= 500
    AND bt.transaction_type NOT IN (
      'gateway_settlement','cod_remittance','shiprocket_recharge',
      'customer_refund','bank_charge','founder_transfer',
      'fx_loss','inventory_write_off','unclassified'
    )
    AND NOT EXISTS (SELECT 1 FROM expenses e WHERE e.bank_transaction_id = bt.id);

  -- COD delivered: commercial orders only (BR-201)
  SELECT COALESCE(SUM(o.order_total_inr), 0) INTO v_cod_delivered_inr
  FROM orders o
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  WHERE o.payment_method ILIKE '%cod%'
    AND o.status = 'completed'
    AND COALESCE(oc.classification, 'paid_sale'::order_class) != ALL(non_commercial_order_classes());

  SELECT COALESCE(SUM(bt.deposit_inr), 0) INTO v_cod_received_inr
  FROM bank_transactions bt
  WHERE bt.transaction_type = 'cod_remittance';

  SELECT COUNT(*) INTO v_unclassified_orders
  FROM orders o
  WHERE NOT EXISTS (SELECT 1 FROM order_classifications oc WHERE oc.order_id = o.id);

  SELECT COUNT(*) INTO v_unmapped_lines
  FROM order_lines WHERE variant_id IS NULL;

  SELECT COUNT(*) INTO v_unresolved_errors
  FROM import_errors
  WHERE severity = 'error' AND resolution_status = 'unresolved';

  SELECT COUNT(*) INTO v_sync_failures_7d
  FROM import_runs
  WHERE status = 'failed' AND run_started_at > now() - interval '7 days';

  SELECT MAX(run_completed_at) INTO v_last_sync_at
  FROM import_runs WHERE status IN ('completed','partial');

  SELECT COUNT(*) INTO v_low_stock
  FROM inventory_items
  WHERE is_active AND current_stock > 0
    AND reorder_point > 0 AND current_stock <= reorder_point;

  SELECT COUNT(*) INTO v_out_of_stock
  FROM inventory_items
  WHERE is_active AND current_stock = 0 AND opening_stock > 0;

  SELECT COUNT(*) INTO v_skus_no_inventory
  FROM product_variants pv
  WHERE NOT EXISTS (SELECT 1 FROM inventory_items ii WHERE ii.variant_id = pv.id);

  RETURN jsonb_build_object(
    'unclassified_bank_count',  v_unclassified_bank,
    'missing_expense_count',    v_missing_expenses,
    'cod_delivered_inr',        ROUND(COALESCE(v_cod_delivered_inr, 0), 2),
    'cod_received_inr',         ROUND(COALESCE(v_cod_received_inr, 0), 2),
    'cod_variance_inr',         ROUND(COALESCE(v_cod_delivered_inr, 0) - COALESCE(v_cod_received_inr, 0), 2),
    'unclassified_order_count', v_unclassified_orders,
    'unmapped_lines_count',     v_unmapped_lines,
    'unresolved_errors_count',  v_unresolved_errors,
    'sync_failures_7d',         v_sync_failures_7d,
    'last_sync_at',             v_last_sync_at,
    'low_stock_count',          v_low_stock,
    'out_of_stock_count',       v_out_of_stock,
    'skus_no_inventory_count',  v_skus_no_inventory
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_data_quality_summary() TO anon, authenticated;
