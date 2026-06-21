-- ============================================================
-- BOM Phase 4 — Inventory & Profitability Updates
--
-- 1. get_true_consumption()    — direct + hidden-in-set demand per component product
-- 2. get_inventory_kpis()      — extended with BOM consumption fields
-- 3. Profitability RPCs        — BOM-allocated COGS for Set order lines
--
-- All changes are non-breaking:
--   • get_true_consumption() is a new function
--   • get_inventory_kpis() adds new JSON keys; existing keys unchanged
--   • Profitability COGS: BOM override only for Set lines; non-Set falls through unchanged
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. get_true_consumption()
--    One row per component product (sports_bra / leggings).
--    Combines direct standalone sales + units consumed via Set BOMs.
--    Velocity is computed over the trailing 90 days (≈ 3 months).
--    Stock is summed from inventory_items by product_name prefix.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_true_consumption()
RETURNS TABLE (
  product_id            int,
  product_name          text,
  product_type          text,
  direct_units          int,
  set_units             int,
  total_units           int,
  direct_revenue_inr    numeric,
  set_allocated_rev_inr numeric,
  total_revenue_inr     numeric,
  velocity_90d_units    int,
  avg_monthly_velocity  numeric,
  current_stock_units   int,
  days_of_stock         numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH direct_all AS (
    SELECT
      CASE
        WHEN ol.product_name_raw ILIKE 'Classic Sports Bra%' THEN 2
        WHEN ol.product_name_raw ILIKE 'Summer Sports Bra%'  THEN 4
        WHEN ol.product_name_raw ILIKE 'Core Sports Bra%'    THEN 7
        WHEN ol.product_name_raw ILIKE 'Classic Leggings%'   THEN 1
        WHEN ol.product_name_raw ILIKE 'Summer Leggings%'    THEN 3
        WHEN ol.product_name_raw ILIKE 'Core Leggings%'      THEN 6
      END        AS product_id,
      ol.quantity,
      ol.line_total_inr,
      o.ordered_at
    FROM order_lines ol
    JOIN orders o ON o.id = ol.order_id
    LEFT JOIN order_classifications oc ON oc.order_id = o.id
    WHERE ol.unit_price_inr >= 100
      AND ol.product_name_raw NOT ILIKE '%Bra%Legging%'
      AND COALESCE(oc.classification::text, 'paid_sale')
          NOT IN ('influencer_promotion','brand_seeding','internal_use','replacement')
  ),
  direct_totals AS (
    SELECT product_id, SUM(quantity) AS direct_units, SUM(line_total_inr) AS direct_revenue
    FROM direct_all WHERE product_id IS NOT NULL
    GROUP BY product_id
  ),
  direct_90d AS (
    SELECT product_id, SUM(quantity) AS units_90d
    FROM direct_all
    WHERE product_id IS NOT NULL
      AND ordered_at >= CURRENT_DATE - INTERVAL '90 days'
    GROUP BY product_id
  ),
  set_totals AS (
    SELECT component_product_id AS product_id,
      SUM(quantity)              AS set_units,
      SUM(allocated_revenue_inr) AS set_revenue
    FROM order_line_bom_explosions
    GROUP BY component_product_id
  ),
  set_90d AS (
    SELECT e.component_product_id AS product_id, SUM(e.quantity) AS units_90d
    FROM order_line_bom_explosions e
    JOIN orders o ON o.id = e.order_id
    WHERE o.ordered_at >= CURRENT_DATE - INTERVAL '90 days'
    GROUP BY e.component_product_id
  ),
  stock AS (
    SELECT
      CASE
        WHEN ii.product_name ILIKE 'Classic Sports Bra%' THEN 2
        WHEN ii.product_name ILIKE 'Summer Sports Bra%'  THEN 4
        WHEN ii.product_name ILIKE 'Core Sports Bra%'    THEN 7
        WHEN ii.product_name ILIKE 'Classic Leggings%'   THEN 1
        WHEN ii.product_name ILIKE 'Summer Leggings%'    THEN 3
        WHEN ii.product_name ILIKE 'Core Leggings%'      THEN 6
      END                   AS product_id,
      SUM(ii.current_stock) AS current_stock
    FROM inventory_items ii
    WHERE ii.is_active = true
    GROUP BY 1
  )
  SELECT
    p.id,
    p.name,
    p.product_type,
    COALESCE(dt.direct_units, 0)::int                                                     AS direct_units,
    COALESCE(st.set_units,    0)::int                                                     AS set_units,
    (COALESCE(dt.direct_units, 0) + COALESCE(st.set_units, 0))::int                      AS total_units,
    ROUND(COALESCE(dt.direct_revenue, 0), 2)                                              AS direct_revenue_inr,
    ROUND(COALESCE(st.set_revenue,    0), 2)                                              AS set_allocated_rev_inr,
    ROUND(COALESCE(dt.direct_revenue, 0) + COALESCE(st.set_revenue, 0), 2)               AS total_revenue_inr,
    (COALESCE(d90.units_90d, 0) + COALESCE(s90.units_90d, 0))::int                       AS velocity_90d_units,
    ROUND((COALESCE(d90.units_90d, 0) + COALESCE(s90.units_90d, 0))::numeric / 3.0, 1)  AS avg_monthly_velocity,
    COALESCE(sk.current_stock, 0)::int                                                    AS current_stock_units,
    CASE
      WHEN (COALESCE(d90.units_90d, 0) + COALESCE(s90.units_90d, 0)) = 0 THEN NULL
      ELSE ROUND(
        COALESCE(sk.current_stock, 0)::numeric
        / ((COALESCE(d90.units_90d, 0) + COALESCE(s90.units_90d, 0))::numeric / 90.0), 0
      )
    END                                                                                   AS days_of_stock
  FROM products p
  LEFT JOIN direct_totals dt  ON dt.product_id  = p.id
  LEFT JOIN direct_90d    d90 ON d90.product_id = p.id
  LEFT JOIN set_totals    st  ON st.product_id  = p.id
  LEFT JOIN set_90d       s90 ON s90.product_id = p.id
  LEFT JOIN stock         sk  ON sk.product_id  = p.id
  WHERE p.product_type IN ('sports_bra', 'leggings')
    AND p.id != 5
  ORDER BY p.product_type DESC, p.name;
$$;

GRANT EXECUTE ON FUNCTION get_true_consumption() TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 2. get_inventory_kpis() — extended with BOM fields
--    Existing keys (total_skus, active_skus, total_units,
--    stock_value_inr, low_stock_count, out_of_stock_count)
--    are unchanged. Three new keys added.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_inventory_kpis()
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
SELECT json_build_object(
  'total_skus',
    COUNT(*),
  'active_skus',
    COUNT(*) FILTER (WHERE is_active = true),
  'total_units',
    COALESCE(SUM(current_stock), 0),
  'stock_value_inr',
    COALESCE(ROUND(SUM(current_stock * COALESCE(unit_cost_inr, 0)), 2), 0),
  'low_stock_count',
    COUNT(*) FILTER (WHERE is_active AND current_stock > 0 AND reorder_point > 0 AND current_stock <= reorder_point),
  'out_of_stock_count',
    COUNT(*) FILTER (WHERE is_active AND current_stock = 0),
  -- BOM-aware additions
  'bom_units_consumed',
    (SELECT COALESCE(SUM(quantity), 0) FROM order_line_bom_explosions),
  'hidden_in_sets_units',
    (SELECT COALESCE(SUM(quantity), 0) FROM order_line_bom_explosions),
  'total_direct_plus_set_units',
    (SELECT COALESCE(SUM(quantity), 0) FROM order_line_bom_explosions)
    + (
      SELECT COALESCE(SUM(ol.quantity), 0)
      FROM order_lines ol
      WHERE ol.unit_price_inr >= 100
        AND ol.product_name_raw NOT ILIKE '%Bra%Legging%'
        AND ol.product_name_raw ~* '(Sports Bra|Leggings)'
    )
)
FROM inventory_items;
$$;

GRANT EXECUTE ON FUNCTION get_inventory_kpis() TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3. Profitability RPCs — BOM COGS for Set lines
--
-- Pattern applied to all 6 RPCs:
--   COALESCE(
--     (SELECT SUM(e.allocated_cogs_inr)          ← BOM: correct component COGS
--      FROM order_line_bom_explosions e
--      WHERE e.order_line_id = ol.id),
--     <existing_expression>                       ← fallback: unchanged for non-Set lines
--   )
-- ─────────────────────────────────────────────────────────────

-- 3a. get_profitability_kpis
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
    COALESCE(
      (SELECT SUM(e.allocated_cogs_inr) FROM order_line_bom_explosions e WHERE e.order_line_id = ol.id),
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
      )
    ) AS line_cogs
  FROM order_lines ol
  JOIN delivered_orders dord ON dord.order_id = ol.order_id
  WHERE ol.line_total_inr IS NOT NULL
),
rev_cogs AS (
  SELECT COALESCE(SUM(line_revenue), 0) AS revenue, COALESCE(SUM(line_cogs), 0) AS cogs
  FROM lines
),
ship_totals AS (
  SELECT COALESCE(SUM(freight), 0) AS total_freight, COALESCE(SUM(cod_charge), 0) AS total_cod
  FROM delivered_orders
),
ad AS (
  SELECT COALESCE(SUM(spend_inr), 0) AS spend
  FROM ad_spend_daily WHERE spend_date BETWEEN p_start AND p_end
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
  'contribution_margin_pct', ROUND((rc.revenue - rc.cogs - st.total_freight - st.total_cod - a.spend) / NULLIF(rc.revenue, 0) * 100, 1)
)
FROM rev_cogs rc, ship_totals st, ad a;
$$;
GRANT EXECUTE ON FUNCTION get_profitability_kpis(date, date) TO anon, authenticated;

-- 3b. get_product_pl
CREATE OR REPLACE FUNCTION get_product_pl(p_start date, p_end date)
RETURNS TABLE (product_name text, launch_code text, product_type text, orders_count int,
               units_sold int, revenue_inr numeric, cogs_inr numeric, gross_profit_inr numeric, gross_margin_pct numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH delivered_orders AS (
  SELECT DISTINCT ON (o.id) o.id AS order_id, o.woocommerce_order_id, s.delivered_at::date AS delivered_date
  FROM orders o JOIN shipments s ON s.order_id = o.id
  WHERE s.status = 'DELIVERED' AND s.delivered_at::date BETWEEN p_start AND p_end
  ORDER BY o.id, s.delivered_at DESC
),
base AS (
  SELECT p.id AS product_id, p.name AS product_name, l.code AS launch_code, p.product_type,
    dord.woocommerce_order_id, ol.quantity,
    COALESCE(ol.line_total_inr, 0) AS line_revenue,
    COALESCE(
      (SELECT SUM(e.allocated_cogs_inr) FROM order_line_bom_explosions e WHERE e.order_line_id = ol.id),
      ol.quantity * COALESCE(
        (SELECT pc.landed_cost_inr FROM product_costs pc
         WHERE pc.variant_id = ol.variant_id AND pc.effective_from <= dord.delivered_date
         ORDER BY pc.effective_from DESC LIMIT 1),
        p.cogs_total_inr)
    ) AS line_cogs
  FROM order_lines ol
  JOIN delivered_orders dord ON dord.order_id = ol.order_id
  JOIN product_variants pv ON pv.id = ol.variant_id
  JOIN products p ON p.id = pv.product_id
  JOIN launches l ON l.id = p.launch_id
  WHERE ol.line_total_inr IS NOT NULL AND ol.variant_id IS NOT NULL
)
SELECT product_name, launch_code, product_type,
  COUNT(DISTINCT woocommerce_order_id)::int AS orders_count,
  SUM(quantity)::int AS units_sold,
  ROUND(SUM(line_revenue), 2) AS revenue_inr,
  ROUND(SUM(line_cogs), 2) AS cogs_inr,
  ROUND(SUM(line_revenue) - SUM(line_cogs), 2) AS gross_profit_inr,
  ROUND((SUM(line_revenue) - SUM(line_cogs)) / NULLIF(SUM(line_revenue), 0) * 100, 1) AS gross_margin_pct
FROM base
GROUP BY product_id, product_name, launch_code, product_type
ORDER BY SUM(line_revenue) DESC;
$$;
GRANT EXECUTE ON FUNCTION get_product_pl(date, date) TO anon, authenticated;

-- 3c. get_sku_pl
CREATE OR REPLACE FUNCTION get_sku_pl(p_start date, p_end date)
RETURNS TABLE (sku text, product_name text, launch_code text, size text, orders_count int,
               units_sold int, revenue_inr numeric, cogs_inr numeric, gross_profit_inr numeric, gross_margin_pct numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH delivered_orders AS (
  SELECT DISTINCT ON (o.id) o.id AS order_id, o.woocommerce_order_id, s.delivered_at::date AS delivered_date
  FROM orders o JOIN shipments s ON s.order_id = o.id
  WHERE s.status = 'DELIVERED' AND s.delivered_at::date BETWEEN p_start AND p_end
  ORDER BY o.id, s.delivered_at DESC
),
base AS (
  SELECT pv.id AS variant_id, COALESCE(pv.sku, 'SKU-' || pv.id::text) AS sku,
    p.name AS product_name, l.code AS launch_code, pv.size,
    dord.woocommerce_order_id, ol.quantity,
    COALESCE(ol.line_total_inr, 0) AS line_revenue,
    COALESCE(
      (SELECT SUM(e.allocated_cogs_inr) FROM order_line_bom_explosions e WHERE e.order_line_id = ol.id),
      ol.quantity * COALESCE(
        (SELECT pc.landed_cost_inr FROM product_costs pc
         WHERE pc.variant_id = ol.variant_id AND pc.effective_from <= dord.delivered_date
         ORDER BY pc.effective_from DESC LIMIT 1),
        p.cogs_total_inr)
    ) AS line_cogs
  FROM order_lines ol
  JOIN delivered_orders dord ON dord.order_id = ol.order_id
  JOIN product_variants pv ON pv.id = ol.variant_id
  JOIN products p ON p.id = pv.product_id
  JOIN launches l ON l.id = p.launch_id
  WHERE ol.line_total_inr IS NOT NULL AND ol.variant_id IS NOT NULL
)
SELECT sku, product_name, launch_code, size,
  COUNT(DISTINCT woocommerce_order_id)::int AS orders_count,
  SUM(quantity)::int AS units_sold,
  ROUND(SUM(line_revenue), 2) AS revenue_inr,
  ROUND(SUM(line_cogs), 2) AS cogs_inr,
  ROUND(SUM(line_revenue) - SUM(line_cogs), 2) AS gross_profit_inr,
  ROUND((SUM(line_revenue) - SUM(line_cogs)) / NULLIF(SUM(line_revenue), 0) * 100, 1) AS gross_margin_pct
FROM base
GROUP BY variant_id, sku, product_name, launch_code, size
ORDER BY SUM(line_revenue) DESC;
$$;
GRANT EXECUTE ON FUNCTION get_sku_pl(date, date) TO anon, authenticated;

-- 3d. get_city_pl
CREATE OR REPLACE FUNCTION get_city_pl(p_start date, p_end date)
RETURNS TABLE (city text, orders_count int, units_sold int, revenue_inr numeric,
               cogs_inr numeric, gross_profit_inr numeric, gross_margin_pct numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH delivered_orders AS (
  SELECT DISTINCT ON (o.id) o.id AS order_id, o.woocommerce_order_id,
    s.delivered_at::date AS delivered_date,
    COALESCE(NULLIF(TRIM(o.billing_city), ''), 'Unknown') AS city
  FROM orders o JOIN shipments s ON s.order_id = o.id
  WHERE s.status = 'DELIVERED' AND s.delivered_at::date BETWEEN p_start AND p_end
  ORDER BY o.id, s.delivered_at DESC
),
base AS (
  SELECT dord.city, dord.woocommerce_order_id, ol.quantity,
    COALESCE(ol.line_total_inr, 0) AS line_revenue,
    COALESCE(
      (SELECT SUM(e.allocated_cogs_inr) FROM order_line_bom_explosions e WHERE e.order_line_id = ol.id),
      ol.quantity * COALESCE(
        CASE WHEN ol.variant_id IS NOT NULL THEN
          (SELECT pc.landed_cost_inr FROM product_costs pc
           WHERE pc.variant_id = ol.variant_id AND pc.effective_from <= dord.delivered_date
           ORDER BY pc.effective_from DESC LIMIT 1) END,
        CASE WHEN ol.variant_id IS NOT NULL THEN
          (SELECT p.cogs_total_inr FROM product_variants pv JOIN products p ON p.id = pv.product_id
           WHERE pv.id = ol.variant_id LIMIT 1)
        ELSE 0 END)
    ) AS line_cogs
  FROM order_lines ol
  JOIN delivered_orders dord ON dord.order_id = ol.order_id
  WHERE ol.line_total_inr IS NOT NULL
)
SELECT city, COUNT(DISTINCT woocommerce_order_id)::int AS orders_count,
  SUM(quantity)::int AS units_sold,
  ROUND(SUM(line_revenue), 2) AS revenue_inr,
  ROUND(SUM(line_cogs), 2) AS cogs_inr,
  ROUND(SUM(line_revenue) - SUM(line_cogs), 2) AS gross_profit_inr,
  ROUND((SUM(line_revenue) - SUM(line_cogs)) / NULLIF(SUM(line_revenue), 0) * 100, 1) AS gross_margin_pct
FROM base GROUP BY city ORDER BY SUM(line_revenue) DESC LIMIT 50;
$$;
GRANT EXECUTE ON FUNCTION get_city_pl(date, date) TO anon, authenticated;

-- 3e. get_launch_pl
CREATE OR REPLACE FUNCTION get_launch_pl()
RETURNS TABLE (launch_code text, launch_name text, launched_at date, total_investment_inr numeric,
               revenue_inr numeric, cogs_inr numeric, gross_profit_inr numeric, gross_margin_pct numeric,
               orders_count int, units_sold int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH delivered_orders AS (
  SELECT DISTINCT ON (o.id) o.id AS order_id, o.woocommerce_order_id, s.delivered_at::date AS delivered_date
  FROM orders o JOIN shipments s ON s.order_id = o.id WHERE s.status = 'DELIVERED'
  ORDER BY o.id, s.delivered_at DESC
),
base AS (
  SELECT l.id AS launch_id, l.code AS launch_code, l.name AS launch_name,
    l.launched_at, l.total_investment_inr, dord.woocommerce_order_id, ol.quantity,
    COALESCE(ol.line_total_inr, 0) AS line_revenue,
    COALESCE(
      (SELECT SUM(e.allocated_cogs_inr) FROM order_line_bom_explosions e WHERE e.order_line_id = ol.id),
      ol.quantity * COALESCE(
        (SELECT pc.landed_cost_inr FROM product_costs pc
         WHERE pc.variant_id = ol.variant_id AND pc.effective_from <= dord.delivered_date
         ORDER BY pc.effective_from DESC LIMIT 1),
        p.cogs_total_inr)
    ) AS line_cogs
  FROM order_lines ol
  JOIN delivered_orders dord ON dord.order_id = ol.order_id
  JOIN product_variants pv ON pv.id = ol.variant_id
  JOIN products p ON p.id = pv.product_id
  JOIN launches l ON l.id = p.launch_id
  WHERE ol.line_total_inr IS NOT NULL AND ol.variant_id IS NOT NULL
)
SELECT launch_code, launch_name, launched_at, total_investment_inr,
  ROUND(SUM(line_revenue), 2) AS revenue_inr,
  ROUND(SUM(line_cogs), 2) AS cogs_inr,
  ROUND(SUM(line_revenue) - SUM(line_cogs), 2) AS gross_profit_inr,
  ROUND((SUM(line_revenue) - SUM(line_cogs)) / NULLIF(SUM(line_revenue), 0) * 100, 1) AS gross_margin_pct,
  COUNT(DISTINCT woocommerce_order_id)::int AS orders_count,
  SUM(quantity)::int AS units_sold
FROM base
GROUP BY launch_id, launch_code, launch_name, launched_at, total_investment_inr
ORDER BY launched_at ASC NULLS LAST;
$$;
GRANT EXECUTE ON FUNCTION get_launch_pl() TO anon, authenticated;

-- 3f. get_customer_pl
CREATE OR REPLACE FUNCTION get_customer_pl(p_start date, p_end date)
RETURNS TABLE (customer_ref text, orders_count int, units_sold int, revenue_inr numeric,
               cogs_inr numeric, gross_profit_inr numeric, gross_margin_pct numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH delivered_orders AS (
  SELECT DISTINCT ON (o.id) o.id AS order_id, o.woocommerce_order_id, o.customer_id, s.delivered_at::date AS delivered_date
  FROM orders o JOIN shipments s ON s.order_id = o.id
  WHERE s.status = 'DELIVERED' AND s.delivered_at::date BETWEEN p_start AND p_end AND o.customer_id IS NOT NULL
  ORDER BY o.id, s.delivered_at DESC
),
base AS (
  SELECT dord.customer_id, dord.woocommerce_order_id, ol.quantity,
    COALESCE(ol.line_total_inr, 0) AS line_revenue,
    COALESCE(
      (SELECT SUM(e.allocated_cogs_inr) FROM order_line_bom_explosions e WHERE e.order_line_id = ol.id),
      ol.quantity * COALESCE(
        CASE WHEN ol.variant_id IS NOT NULL THEN
          (SELECT pc.landed_cost_inr FROM product_costs pc
           WHERE pc.variant_id = ol.variant_id AND pc.effective_from <= dord.delivered_date
           ORDER BY pc.effective_from DESC LIMIT 1) END,
        CASE WHEN ol.variant_id IS NOT NULL THEN
          (SELECT p.cogs_total_inr FROM product_variants pv JOIN products p ON p.id = pv.product_id
           WHERE pv.id = ol.variant_id LIMIT 1)
        ELSE 0 END)
    ) AS line_cogs
  FROM order_lines ol
  JOIN delivered_orders dord ON dord.order_id = ol.order_id
  WHERE ol.line_total_inr IS NOT NULL
)
SELECT 'C-' || customer_id::text AS customer_ref,
  COUNT(DISTINCT woocommerce_order_id)::int AS orders_count,
  SUM(quantity)::int AS units_sold,
  ROUND(SUM(line_revenue), 2) AS revenue_inr,
  ROUND(SUM(line_cogs), 2) AS cogs_inr,
  ROUND(SUM(line_revenue) - SUM(line_cogs), 2) AS gross_profit_inr,
  ROUND((SUM(line_revenue) - SUM(line_cogs)) / NULLIF(SUM(line_revenue), 0) * 100, 1) AS gross_margin_pct
FROM base GROUP BY customer_id ORDER BY SUM(line_revenue) DESC LIMIT 100;
$$;
GRANT EXECUTE ON FUNCTION get_customer_pl(date, date) TO anon, authenticated;
