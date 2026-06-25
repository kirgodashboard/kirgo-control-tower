-- ════════════════════════════════════════════════════════════════════
-- Complete Profitability P&L: Total Revenue (booked, = Executive) →
-- recognition bridge → Delivered Revenue → COGS → margins → full
-- operating-expense breakdown → Net Profit. Capex excluded from Net
-- Profit (memo) + Cash-after-capex line. Reconciles to Executive (revenue)
-- and to the expenses register (opex + marketing + capex + cogs-adj).
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_profitability_kpis(p_start date, p_end date)
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
WITH delivered_orders AS (
  SELECT DISTINCT ON (o.id)
    o.id AS order_id, s.delivered_at::date AS delivered_date,
    COALESCE(s.freight_total_inr, 0) AS freight, COALESCE(s.cod_charges_inr, 0) AS cod_charge
  FROM orders o JOIN shipments s ON s.order_id = o.id
  WHERE s.status = 'DELIVERED' AND s.delivered_at::date BETWEEN p_start AND p_end
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
