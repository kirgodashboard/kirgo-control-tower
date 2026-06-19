-- =============================================================================
-- MIGRATION: Profitability RPC functions
-- Phase 2 / Priority 1 — Profitability Engine
-- Depends on: 20260619_product_costs_table.sql
--
-- Join strategy: shipments joined to orders on order_id only (not variant_id),
-- using DISTINCT ON (order_id) to avoid duplicate rows for multi-item orders.
-- order_lines joined to delivered_orders on order_id only.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- get_profitability_kpis(p_start, p_end)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_profitability_kpis(p_start date, p_end date)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH delivered_orders AS (
  -- One row per delivered order; DISTINCT ON avoids duplicate shipment rows
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
    COALESCE(ol.line_total_inr, 0)   AS line_revenue,
    ol.quantity * COALESCE(
      -- landed cost from product_costs (as-of delivery date)
      (SELECT pc.landed_cost_inr FROM product_costs pc
       WHERE pc.variant_id = ol.variant_id
         AND pc.effective_from <= dord.delivered_date
       ORDER BY pc.effective_from DESC LIMIT 1),
      -- fallback: product-level COGS when variant is resolved
      CASE WHEN ol.variant_id IS NOT NULL THEN
        (SELECT p.cogs_total_inr FROM product_variants pv
         JOIN products p ON p.id = pv.product_id
         WHERE pv.id = ol.variant_id LIMIT 1)
      ELSE 0 END
    )                                AS line_cogs
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
    / NULLIF(rc.revenue, 0) * 100, 1)
)
FROM rev_cogs rc, ship_totals st, ad a;
$$;

GRANT EXECUTE ON FUNCTION get_profitability_kpis(date, date) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_product_pl(p_start, p_end)
-- ---------------------------------------------------------------------------
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
WITH delivered_orders AS (
  SELECT DISTINCT ON (o.id)
    o.id                    AS order_id,
    o.woocommerce_order_id,
    s.delivered_at::date    AS delivered_date
  FROM orders o
  JOIN shipments s ON s.order_id = o.id
  WHERE s.status = 'DELIVERED'
    AND s.delivered_at::date BETWEEN p_start AND p_end
  ORDER BY o.id, s.delivered_at DESC
),
base AS (
  SELECT
    p.id                                             AS product_id,
    p.name                                           AS product_name,
    l.code                                           AS launch_code,
    p.product_type,
    dord.woocommerce_order_id,
    ol.quantity,
    COALESCE(ol.line_total_inr, 0)                   AS line_revenue,
    ol.quantity * COALESCE(
      (SELECT pc.landed_cost_inr FROM product_costs pc
       WHERE pc.variant_id = ol.variant_id
         AND pc.effective_from <= dord.delivered_date
       ORDER BY pc.effective_from DESC LIMIT 1),
      p.cogs_total_inr
    )                                                AS line_cogs
  FROM order_lines ol
  JOIN delivered_orders dord ON dord.order_id = ol.order_id
  JOIN product_variants pv  ON pv.id = ol.variant_id
  JOIN products         p   ON p.id  = pv.product_id
  JOIN launches         l   ON l.id  = p.launch_id
  WHERE ol.line_total_inr IS NOT NULL
    AND ol.variant_id IS NOT NULL
)
SELECT
  product_name,
  launch_code,
  product_type,
  COUNT(DISTINCT woocommerce_order_id)::int          AS orders_count,
  SUM(quantity)::int                                 AS units_sold,
  ROUND(SUM(line_revenue), 2)                        AS revenue_inr,
  ROUND(SUM(line_cogs), 2)                           AS cogs_inr,
  ROUND(SUM(line_revenue) - SUM(line_cogs), 2)       AS gross_profit_inr,
  ROUND(
    (SUM(line_revenue) - SUM(line_cogs)) / NULLIF(SUM(line_revenue), 0) * 100, 1
  )                                                  AS gross_margin_pct
FROM base
GROUP BY product_id, product_name, launch_code, product_type
ORDER BY SUM(line_revenue) DESC;
$$;

GRANT EXECUTE ON FUNCTION get_product_pl(date, date) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_sku_pl(p_start, p_end)
-- ---------------------------------------------------------------------------
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
WITH delivered_orders AS (
  SELECT DISTINCT ON (o.id)
    o.id                    AS order_id,
    o.woocommerce_order_id,
    s.delivered_at::date    AS delivered_date
  FROM orders o
  JOIN shipments s ON s.order_id = o.id
  WHERE s.status = 'DELIVERED'
    AND s.delivered_at::date BETWEEN p_start AND p_end
  ORDER BY o.id, s.delivered_at DESC
),
base AS (
  SELECT
    pv.id                                            AS variant_id,
    COALESCE(pv.sku, 'SKU-' || pv.id::text)         AS sku,
    p.name                                           AS product_name,
    l.code                                           AS launch_code,
    pv.size,
    dord.woocommerce_order_id,
    ol.quantity,
    COALESCE(ol.line_total_inr, 0)                   AS line_revenue,
    ol.quantity * COALESCE(
      (SELECT pc.landed_cost_inr FROM product_costs pc
       WHERE pc.variant_id = ol.variant_id
         AND pc.effective_from <= dord.delivered_date
       ORDER BY pc.effective_from DESC LIMIT 1),
      p.cogs_total_inr
    )                                                AS line_cogs
  FROM order_lines ol
  JOIN delivered_orders dord ON dord.order_id = ol.order_id
  JOIN product_variants pv  ON pv.id = ol.variant_id
  JOIN products         p   ON p.id  = pv.product_id
  JOIN launches         l   ON l.id  = p.launch_id
  WHERE ol.line_total_inr IS NOT NULL
    AND ol.variant_id IS NOT NULL
)
SELECT
  sku,
  product_name,
  launch_code,
  size,
  COUNT(DISTINCT woocommerce_order_id)::int          AS orders_count,
  SUM(quantity)::int                                 AS units_sold,
  ROUND(SUM(line_revenue), 2)                        AS revenue_inr,
  ROUND(SUM(line_cogs), 2)                           AS cogs_inr,
  ROUND(SUM(line_revenue) - SUM(line_cogs), 2)       AS gross_profit_inr,
  ROUND(
    (SUM(line_revenue) - SUM(line_cogs)) / NULLIF(SUM(line_revenue), 0) * 100, 1
  )                                                  AS gross_margin_pct
FROM base
GROUP BY variant_id, sku, product_name, launch_code, size
ORDER BY SUM(line_revenue) DESC;
$$;

GRANT EXECUTE ON FUNCTION get_sku_pl(date, date) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_city_pl(p_start, p_end)
-- ---------------------------------------------------------------------------
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
WITH delivered_orders AS (
  SELECT DISTINCT ON (o.id)
    o.id                                                       AS order_id,
    o.woocommerce_order_id,
    s.delivered_at::date                                       AS delivered_date,
    COALESCE(NULLIF(TRIM(o.billing_city), ''), 'Unknown')      AS city
  FROM orders o
  JOIN shipments s ON s.order_id = o.id
  WHERE s.status = 'DELIVERED'
    AND s.delivered_at::date BETWEEN p_start AND p_end
  ORDER BY o.id, s.delivered_at DESC
),
base AS (
  SELECT
    dord.city,
    dord.woocommerce_order_id,
    ol.quantity,
    COALESCE(ol.line_total_inr, 0)                             AS line_revenue,
    ol.quantity * COALESCE(
      CASE WHEN ol.variant_id IS NOT NULL THEN
        (SELECT pc.landed_cost_inr FROM product_costs pc
         WHERE pc.variant_id = ol.variant_id
           AND pc.effective_from <= dord.delivered_date
         ORDER BY pc.effective_from DESC LIMIT 1)
      END,
      CASE WHEN ol.variant_id IS NOT NULL THEN
        (SELECT p.cogs_total_inr FROM product_variants pv
         JOIN products p ON p.id = pv.product_id
         WHERE pv.id = ol.variant_id LIMIT 1)
      ELSE 0 END
    )                                                          AS line_cogs
  FROM order_lines ol
  JOIN delivered_orders dord ON dord.order_id = ol.order_id
  WHERE ol.line_total_inr IS NOT NULL
)
SELECT
  city,
  COUNT(DISTINCT woocommerce_order_id)::int                   AS orders_count,
  SUM(quantity)::int                                          AS units_sold,
  ROUND(SUM(line_revenue), 2)                                 AS revenue_inr,
  ROUND(SUM(line_cogs), 2)                                    AS cogs_inr,
  ROUND(SUM(line_revenue) - SUM(line_cogs), 2)                AS gross_profit_inr,
  ROUND(
    (SUM(line_revenue) - SUM(line_cogs)) / NULLIF(SUM(line_revenue), 0) * 100, 1
  )                                                           AS gross_margin_pct
FROM base
GROUP BY city
ORDER BY SUM(line_revenue) DESC
LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION get_city_pl(date, date) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_launch_pl()  — all-time, no date filter
-- ---------------------------------------------------------------------------
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
WITH delivered_orders AS (
  SELECT DISTINCT ON (o.id)
    o.id                    AS order_id,
    o.woocommerce_order_id,
    s.delivered_at::date    AS delivered_date
  FROM orders o
  JOIN shipments s ON s.order_id = o.id
  WHERE s.status = 'DELIVERED'
  ORDER BY o.id, s.delivered_at DESC
),
base AS (
  SELECT
    l.id                                             AS launch_id,
    l.code                                           AS launch_code,
    l.name                                           AS launch_name,
    l.launched_at,
    l.total_investment_inr,
    dord.woocommerce_order_id,
    ol.quantity,
    COALESCE(ol.line_total_inr, 0)                   AS line_revenue,
    ol.quantity * COALESCE(
      (SELECT pc.landed_cost_inr FROM product_costs pc
       WHERE pc.variant_id = ol.variant_id
         AND pc.effective_from <= dord.delivered_date
       ORDER BY pc.effective_from DESC LIMIT 1),
      p.cogs_total_inr
    )                                                AS line_cogs
  FROM order_lines ol
  JOIN delivered_orders dord ON dord.order_id = ol.order_id
  JOIN product_variants pv  ON pv.id = ol.variant_id
  JOIN products         p   ON p.id  = pv.product_id
  JOIN launches         l   ON l.id  = p.launch_id
  WHERE ol.line_total_inr IS NOT NULL
    AND ol.variant_id IS NOT NULL
)
SELECT
  launch_code,
  launch_name,
  launched_at,
  total_investment_inr,
  ROUND(SUM(line_revenue), 2)                        AS revenue_inr,
  ROUND(SUM(line_cogs), 2)                           AS cogs_inr,
  ROUND(SUM(line_revenue) - SUM(line_cogs), 2)       AS gross_profit_inr,
  ROUND(
    (SUM(line_revenue) - SUM(line_cogs)) / NULLIF(SUM(line_revenue), 0) * 100, 1
  )                                                  AS gross_margin_pct,
  COUNT(DISTINCT woocommerce_order_id)::int          AS orders_count,
  SUM(quantity)::int                                 AS units_sold
FROM base
GROUP BY launch_id, launch_code, launch_name, launched_at, total_investment_inr
ORDER BY launched_at ASC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION get_launch_pl() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_customer_pl(p_start, p_end)  — anonymised (customer_id only, no PII)
-- ---------------------------------------------------------------------------
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
WITH delivered_orders AS (
  SELECT DISTINCT ON (o.id)
    o.id                    AS order_id,
    o.woocommerce_order_id,
    o.customer_id,
    s.delivered_at::date    AS delivered_date
  FROM orders o
  JOIN shipments s ON s.order_id = o.id
  WHERE s.status = 'DELIVERED'
    AND s.delivered_at::date BETWEEN p_start AND p_end
    AND o.customer_id IS NOT NULL
  ORDER BY o.id, s.delivered_at DESC
),
base AS (
  SELECT
    dord.customer_id,
    dord.woocommerce_order_id,
    ol.quantity,
    COALESCE(ol.line_total_inr, 0)                   AS line_revenue,
    ol.quantity * COALESCE(
      CASE WHEN ol.variant_id IS NOT NULL THEN
        (SELECT pc.landed_cost_inr FROM product_costs pc
         WHERE pc.variant_id = ol.variant_id
           AND pc.effective_from <= dord.delivered_date
         ORDER BY pc.effective_from DESC LIMIT 1)
      END,
      CASE WHEN ol.variant_id IS NOT NULL THEN
        (SELECT p.cogs_total_inr FROM product_variants pv
         JOIN products p ON p.id = pv.product_id
         WHERE pv.id = ol.variant_id LIMIT 1)
      ELSE 0 END
    )                                                AS line_cogs
  FROM order_lines ol
  JOIN delivered_orders dord ON dord.order_id = ol.order_id
  WHERE ol.line_total_inr IS NOT NULL
)
SELECT
  'C-' || customer_id::text                          AS customer_ref,
  COUNT(DISTINCT woocommerce_order_id)::int          AS orders_count,
  SUM(quantity)::int                                 AS units_sold,
  ROUND(SUM(line_revenue), 2)                        AS revenue_inr,
  ROUND(SUM(line_cogs), 2)                           AS cogs_inr,
  ROUND(SUM(line_revenue) - SUM(line_cogs), 2)       AS gross_profit_inr,
  ROUND(
    (SUM(line_revenue) - SUM(line_cogs)) / NULLIF(SUM(line_revenue), 0) * 100, 1
  )                                                  AS gross_margin_pct
FROM base
GROUP BY customer_id
ORDER BY SUM(line_revenue) DESC
LIMIT 100;
$$;

GRANT EXECUTE ON FUNCTION get_customer_pl(date, date) TO anon, authenticated;
