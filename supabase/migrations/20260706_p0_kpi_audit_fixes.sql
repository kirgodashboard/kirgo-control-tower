-- =============================================================================
-- P0 KPI AUDIT FIXES  (2026-07-06)
-- Fixes five critical defects found in the 2026-07-01 KPI audit.
--
-- DEFECT-01  COD Outstanding in Operations and Director Snapshot reports
--            Shiprocket service fee (cod_payable_inr, ₹46-110) instead of
--            actual customer cash (order_total_inr).
--            Fix: replace v_cod_outstanding references with delivered-COD
--            shipments whose CRF ID is not matched to a bank cod_remittance.
--
-- DEFECT-02  Operations RTO only counts status='RTO', missing
--            RTO_DELIVERED, RTO_ACKNOWLEDGED, RTO_INITIATED (regression
--            introduced by 20260702 migration).
--
-- DEFECT-03  Operations In-Transit only counts status='IN_TRANSIT', missing
--            'IN TRANSIT', 'OUT_FOR_DELIVERY', 'PICKED_UP' (same regression).
--
-- DEFECT-04  Profitability P&L suite violates BR-201: non-commercial orders
--            (influencer_promotion, brand_seeding, internal_use, replacement)
--            included in delivered revenue and COGS.
--            Fix: add LEFT JOIN order_classifications + non_commercial_order_classes()
--            filter to delivered_orders CTE in all 5 profitability functions.
--
-- DEFECT-05  get_director_snapshot return_rate_pct mixes 30-day returns with
--            MTD orders as denominator — wildly inflated early in the month.
--            Fix: align returns window to MTD (same as denominator).
--
-- HIGH-03    customer_returns removed from Operations KPIs by 20260702
--            migration (regression). Restored with period scope.
-- =============================================================================


-- ─── 1. get_operations_kpis ──────────────────────────────────────────────────
-- Fixes: DEFECT-01 (COD), DEFECT-02 (RTO statuses), DEFECT-03 (in-transit
--        statuses), HIGH-03 (restore customer_returns with period scope).
-- COD outstanding is a balance-sheet total (all-time unremitted), not period.

CREATE OR REPLACE FUNCTION get_operations_kpis(p_start date, p_end date)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT json_build_object(
    'total_shipments',       COUNT(DISTINCT s.id),
    'delivered',             COUNT(CASE WHEN s.status = 'DELIVERED' THEN 1 END),
    'in_transit',            COUNT(CASE WHEN s.status IN ('IN_TRANSIT','IN TRANSIT','OUT_FOR_DELIVERY','PICKED_UP') THEN 1 END),
    'rto',                   COUNT(CASE WHEN s.status IN ('RTO_DELIVERED','RTO_ACKNOWLEDGED','RTO_INITIATED','RTO') THEN 1 END),
    'pending',               COUNT(CASE WHEN s.status IN ('NEW_ORDER','PENDING','PICKUP_SCHEDULED') THEN 1 END),
    'customer_returns',      (
      SELECT COUNT(*) FROM returns r
      WHERE r.returned_at::date BETWEEN p_start AND p_end
    ),
    'delivery_success_pct',  ROUND(
      COUNT(CASE WHEN s.status = 'DELIVERED' THEN 1 END)::numeric
      / NULLIF(COUNT(DISTINCT s.id), 0) * 100, 1),
    'rto_rate_pct',          ROUND(
      COUNT(CASE WHEN s.status IN ('RTO_DELIVERED','RTO_ACKNOWLEDGED','RTO_INITIATED','RTO') THEN 1 END)::numeric
      / NULLIF(COUNT(DISTINCT s.id), 0) * 100, 1),
    -- DEFECT-01 fix: order_total_inr (actual customer cash) from unremitted
    -- delivered COD shipments, identical to get_receivables_kpis logic.
    'cod_outstanding_inr',   (
      SELECT COALESCE(SUM(o.order_total_inr), 0)
      FROM shipments s2
      LEFT JOIN orders o ON o.id = s2.order_id
      WHERE s2.payment_method = 'cod'
        AND s2.status = 'DELIVERED'
        AND (
          s2.cod_crf_id IS NULL
          OR s2.cod_crf_id NOT IN (
            SELECT extracted_reference FROM bank_transactions
            WHERE transaction_type = 'cod_remittance'
              AND extracted_reference IS NOT NULL
          )
        )
    ),
    'cod_outstanding_count', (
      SELECT COUNT(*) FROM shipments s2
      WHERE s2.payment_method = 'cod'
        AND s2.status = 'DELIVERED'
        AND (
          s2.cod_crf_id IS NULL
          OR s2.cod_crf_id NOT IN (
            SELECT extracted_reference FROM bank_transactions
            WHERE transaction_type = 'cod_remittance'
              AND extracted_reference IS NOT NULL
          )
        )
    )
  )
  FROM shipments s
  WHERE s.channel_created_at::date BETWEEN p_start AND p_end;
$$;

GRANT EXECUTE ON FUNCTION get_operations_kpis(date, date) TO anon, authenticated;


-- ─── 2. get_director_snapshot ────────────────────────────────────────────────
-- Fixes: DEFECT-01 (COD), DEFECT-05 (return_rate_pct window alignment).
-- Also uses channel_created_at in ops_30d (same date-dimension correctness
-- fix that was applied to get_operations_kpis in the 20260702 migration).

CREATE OR REPLACE FUNCTION public.get_director_snapshot()
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_mtd_start   date := DATE_TRUNC('month', CURRENT_DATE)::date;
  v_prior_start date := DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')::date;
  v_prior_end   date := (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 day')::date;
BEGIN
  RETURN (
    WITH mtd_revenue AS (
      SELECT COALESCE(SUM(revenue_inr),0) AS gross_revenue_inr,
             COUNT(*) AS orders_count, COUNT(DISTINCT customer_id) AS customers
      FROM v_revenue_events WHERE event_at::date >= v_mtd_start
    ),
    prior_revenue AS (
      SELECT COALESCE(SUM(revenue_inr),0) AS gross_revenue_inr, COUNT(*) AS orders_count
      FROM v_revenue_events WHERE event_at::date BETWEEN v_prior_start AND v_prior_end
    ),
    cash AS (
      SELECT closing_balance_inr FROM bank_transactions
      WHERE closing_balance_inr IS NOT NULL ORDER BY transaction_date DESC, id DESC LIMIT 1
    ),
    -- DEFECT-01 fix: use order_total_inr (real customer cash) not cod_payable_inr
    -- (Shiprocket's service fee). Same logic as get_receivables_kpis.
    cod_pending AS (
      SELECT
        COALESCE(SUM(o.order_total_inr), 0) AS total,
        COUNT(*)::int                        AS count
      FROM shipments s
      LEFT JOIN orders o ON o.id = s.order_id
      WHERE s.payment_method = 'cod'
        AND s.status = 'DELIVERED'
        AND (
          s.cod_crf_id IS NULL
          OR s.cod_crf_id NOT IN (
            SELECT extracted_reference FROM bank_transactions
            WHERE transaction_type = 'cod_remittance'
              AND extracted_reference IS NOT NULL
          )
        )
    ),
    -- Use channel_created_at (actual order/shipment date) not created_at
    -- (bulk-sync insertion timestamp that makes all shipments appear as one day).
    ops_30d AS (
      SELECT COUNT(*) AS total,
             COUNT(CASE WHEN s.status = 'DELIVERED' THEN 1 END) AS delivered,
             COUNT(CASE WHEN s.status IN ('RTO_DELIVERED','RTO_ACKNOWLEDGED','RTO_INITIATED','RTO') THEN 1 END) AS rto
      FROM shipments s WHERE s.channel_created_at::date >= (CURRENT_DATE - 30)
    ),
    -- DEFECT-05 fix: use MTD start (same window as orders_count denominator).
    -- Previously used CURRENT_DATE - 30, mixing a 30-day numerator with an
    -- MTD denominator, producing inflated rates early in the month.
    returns_mtd AS (
      SELECT COUNT(*) AS return_count FROM returns r
      WHERE r.returned_at::date >= v_mtd_start
    ),
    repeat_custs AS (
      SELECT COUNT(*) FILTER (WHERE lifetime_orders >= 2) AS repeat_customers, COUNT(*) AS total_customers
      FROM (
        SELECT o.customer_id, COUNT(DISTINCT o.id) AS lifetime_orders
        FROM orders o
        LEFT JOIN order_classifications oc ON oc.order_id = o.id
        WHERE o.status NOT IN ('cancelled','refunded','failed','trash')
          AND o.customer_id IS NOT NULL
          AND COALESCE(oc.classification, 'paid_sale'::order_class) != ALL(non_commercial_order_classes())
        GROUP BY o.customer_id
      ) sub
    ),
    alert_counts AS (
      SELECT COUNT(CASE WHEN severity = 'RED' THEN 1 END) AS red_count,
             COUNT(CASE WHEN severity = 'AMBER' THEN 1 END) AS amber_count
      FROM v_system_alerts
    )
    SELECT json_build_object(
      'revenue_mtd_inr',         m.gross_revenue_inr,
      'revenue_prior_month_inr', p.gross_revenue_inr,
      'revenue_mtd_change_pct',  ROUND((m.gross_revenue_inr - p.gross_revenue_inr) / NULLIF(p.gross_revenue_inr,0)*100,1),
      'orders_mtd',              m.orders_count,
      'orders_prior_month',      p.orders_count,
      'orders_mtd_change_pct',   ROUND((m.orders_count - p.orders_count)::numeric / NULLIF(p.orders_count,0)*100,1),
      'cash_position_inr',       c.closing_balance_inr,
      'cod_outstanding_inr',     cod.total,
      'cod_outstanding_count',   cod.count,
      'delivery_success_pct',    ROUND(o.delivered::numeric / NULLIF(o.total,0)*100,1),
      'rto_rate_pct',            ROUND(o.rto::numeric        / NULLIF(o.total,0)*100,1),
      'return_rate_pct',         ROUND(r.return_count::numeric / NULLIF(m.orders_count,0)*100,1),
      'repeat_customer_pct',     ROUND(rc.repeat_customers::numeric / NULLIF(rc.total_customers,0)*100,1),
      'red_alert_count',         ac.red_count,
      'amber_alert_count',       ac.amber_count,
      'system_status',           CASE WHEN ac.red_count > 0 THEN 'RED' WHEN ac.amber_count > 0 THEN 'AMBER' ELSE 'GREEN' END
    )
    FROM mtd_revenue m, prior_revenue p, cash c, cod_pending cod,
         ops_30d o, returns_mtd r, repeat_custs rc, alert_counts ac
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION get_director_snapshot() TO anon, authenticated;


-- ─── 3. get_profitability_kpis ───────────────────────────────────────────────
-- DEFECT-04 fix: add BR-201 filter to delivered_orders CTE.
-- Uses the full P&L version (20260625_z_profitability_full_pnl) as base,
-- adding the order_classifications join and non_commercial_order_classes() filter.

CREATE OR REPLACE FUNCTION public.get_profitability_kpis(p_start date, p_end date)
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
WITH delivered_orders AS (
  SELECT DISTINCT ON (o.id)
    o.id AS order_id, s.delivered_at::date AS delivered_date,
    COALESCE(s.freight_total_inr, 0) AS freight, COALESCE(s.cod_charges_inr, 0) AS cod_charge
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
    COALESCE(ol.line_total_inr, 0) AS line_revenue,
    COALESCE(
      (SELECT SUM(e.allocated_cogs_inr) FROM order_line_bom_explosions e WHERE e.order_line_id = ol.id),
      ol.quantity * COALESCE(
        (SELECT pc.landed_cost_inr FROM product_costs pc WHERE pc.variant_id = ol.variant_id AND pc.effective_from <= dord.delivered_date ORDER BY pc.effective_from DESC LIMIT 1),
        CASE WHEN ol.variant_id IS NOT NULL THEN (SELECT p.cogs_total_inr FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE pv.id = ol.variant_id LIMIT 1) ELSE 0 END
      )
    ) AS line_cogs
  FROM order_lines ol JOIN delivered_orders dord ON dord.order_id = ol.order_id WHERE ol.line_total_inr IS NOT NULL
),
rev_cogs    AS (SELECT COALESCE(SUM(line_revenue),0) AS revenue, COALESCE(SUM(line_cogs),0) AS cogs FROM lines),
ship_totals AS (SELECT COALESCE(SUM(freight),0) AS total_freight, COALESCE(SUM(cod_charge),0) AS total_cod FROM delivered_orders),
ad          AS (SELECT COALESCE(SUM(spend_inr),0) AS spend FROM ad_spend_daily WHERE spend_date BETWEEN p_start AND p_end),
booked      AS (SELECT COALESCE(SUM(revenue_inr),0) AS total FROM v_revenue_events WHERE event_at::date BETWEEN p_start AND p_end),
exp_opex      AS (SELECT COALESCE(SUM(e.amount_inr),0) AS t FROM expenses e JOIN expense_categories ec ON ec.id=e.category_id WHERE ec.category_group='opex'      AND e.expense_date BETWEEN p_start AND p_end),
exp_marketing AS (SELECT COALESCE(SUM(e.amount_inr),0) AS t FROM expenses e JOIN expense_categories ec ON ec.id=e.category_id WHERE ec.category_group='marketing' AND e.expense_date BETWEEN p_start AND p_end),
exp_capex     AS (SELECT COALESCE(SUM(e.amount_inr),0) AS t FROM expenses e JOIN expense_categories ec ON ec.id=e.category_id WHERE ec.category_group='capex'     AND e.expense_date BETWEEN p_start AND p_end)
SELECT json_build_object(
  'total_revenue_inr',        ROUND(b.total, 2),
  'revenue_in_transit_inr',   ROUND(GREATEST(b.total - rc.revenue, 0), 2),
  'revenue_inr',              ROUND(rc.revenue, 2),
  'delivered_revenue_inr',    ROUND(rc.revenue, 2),
  'cogs_inr',                 ROUND(rc.cogs, 2),
  'gross_profit_inr',         ROUND(rc.revenue - rc.cogs, 2),
  'gross_margin_pct',         ROUND((rc.revenue - rc.cogs) / NULLIF(rc.revenue,0) * 100, 1),
  'shipping_cost_inr',        ROUND(st.total_freight, 2),
  'cod_charges_inr',          ROUND(st.total_cod, 2),
  'ad_spend_inr',             ROUND(a.spend, 2),
  'contribution_margin_inr',  ROUND(rc.revenue - rc.cogs - st.total_freight - st.total_cod - a.spend, 2),
  'contribution_margin_pct',  ROUND((rc.revenue - rc.cogs - st.total_freight - st.total_cod - a.spend) / NULLIF(rc.revenue,0) * 100, 1),
  'opex_inr',                 ROUND(eo.t, 2),
  'marketing_inr',            ROUND(em.t, 2),
  'operating_expenses_inr',   ROUND(eo.t + em.t, 2),
  'net_profit_inr',           ROUND(rc.revenue - rc.cogs - st.total_freight - st.total_cod - a.spend - eo.t - em.t, 2),
  'net_margin_pct',           ROUND((rc.revenue - rc.cogs - st.total_freight - st.total_cod - a.spend - eo.t - em.t) / NULLIF(rc.revenue,0) * 100, 1),
  'capex_inr',                ROUND(ec.t, 2),
  'cash_after_capex_inr',     ROUND(rc.revenue - rc.cogs - st.total_freight - st.total_cod - a.spend - eo.t - em.t - ec.t, 2),
  'return_cost_inr',          0
)
FROM rev_cogs rc, ship_totals st, ad a, booked b, exp_opex eo, exp_marketing em, exp_capex ec;
$function$;

GRANT EXECUTE ON FUNCTION get_profitability_kpis(date, date) TO anon, authenticated;


-- ─── 4. get_product_pl ───────────────────────────────────────────────────────
-- DEFECT-04 fix: add BR-201 filter to delivered_orders CTE.

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
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  WHERE s.status = 'DELIVERED'
    AND s.delivered_at::date BETWEEN p_start AND p_end
    AND COALESCE(oc.classification, 'paid_sale'::order_class) != ALL(non_commercial_order_classes())
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


-- ─── 5. get_sku_pl ───────────────────────────────────────────────────────────
-- DEFECT-04 fix: add BR-201 filter to delivered_orders CTE.

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
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  WHERE s.status = 'DELIVERED'
    AND s.delivered_at::date BETWEEN p_start AND p_end
    AND COALESCE(oc.classification, 'paid_sale'::order_class) != ALL(non_commercial_order_classes())
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


-- ─── 6. get_launch_pl ────────────────────────────────────────────────────────
-- DEFECT-04 fix: add BR-201 filter to delivered_orders CTE.
-- get_launch_pl has no date params; BR-201 filter applies to all-time data.

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
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  WHERE s.status = 'DELIVERED'
    AND COALESCE(oc.classification, 'paid_sale'::order_class) != ALL(non_commercial_order_classes())
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


-- ─── 7. get_customer_pl ──────────────────────────────────────────────────────
-- DEFECT-04 fix: add BR-201 filter to delivered_orders CTE.

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
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  WHERE s.status = 'DELIVERED'
    AND s.delivered_at::date BETWEEN p_start AND p_end
    AND o.customer_id IS NOT NULL
    AND COALESCE(oc.classification, 'paid_sale'::order_class) != ALL(non_commercial_order_classes())
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
