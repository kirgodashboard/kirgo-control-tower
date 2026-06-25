-- ════════════════════════════════════════════════════════════════════
-- (1) Profitability P&L: surface OPERATING EXPENSES + NET PROFIT.
--     COGS stays goods-only (BOM/landed cost). Opex comes from the
--     expenses table (category_group='opex') — kept separate from COGS.
-- (2) Sales register: payment filter understands the "prepaid" category
--     (all non-COD gateways) instead of an exact match that never hit.
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
opex        AS (SELECT COALESCE(SUM(e.amount_inr),0) AS total
                FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id
                WHERE ec.category_group = 'opex' AND e.expense_date BETWEEN p_start AND p_end)
SELECT json_build_object(
  'revenue_inr',             ROUND(rc.revenue, 2),
  'cogs_inr',                ROUND(rc.cogs, 2),
  'gross_profit_inr',        ROUND(rc.revenue - rc.cogs, 2),
  'gross_margin_pct',        ROUND((rc.revenue - rc.cogs) / NULLIF(rc.revenue,0) * 100, 1),
  'shipping_cost_inr',       ROUND(st.total_freight, 2),
  'cod_charges_inr',         ROUND(st.total_cod, 2),
  'ad_spend_inr',            ROUND(a.spend, 2),
  'contribution_margin_inr', ROUND(rc.revenue - rc.cogs - st.total_freight - st.total_cod - a.spend, 2),
  'contribution_margin_pct', ROUND((rc.revenue - rc.cogs - st.total_freight - st.total_cod - a.spend) / NULLIF(rc.revenue,0) * 100, 1),
  'operating_expenses_inr',  ROUND(ox.total, 2),
  'net_profit_inr',          ROUND(rc.revenue - rc.cogs - st.total_freight - st.total_cod - a.spend - ox.total, 2),
  'net_margin_pct',          ROUND((rc.revenue - rc.cogs - st.total_freight - st.total_cod - a.spend - ox.total) / NULLIF(rc.revenue,0) * 100, 1)
)
FROM rev_cogs rc, ship_totals st, ad a, opex ox;
$function$;

CREATE OR REPLACE FUNCTION public.get_sales_register(
  p_start date DEFAULT NULL, p_end date DEFAULT NULL, p_order_status text DEFAULT NULL,
  p_payment_method text DEFAULT NULL, p_city text DEFAULT NULL, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
RETURNS TABLE(order_id integer, wc_order_id integer, order_number text, ordered_at timestamp with time zone,
  customer_name text, customer_email text, city text, state text, products text, total_qty integer,
  subtotal_inr numeric, discount_inr numeric, shipping_inr numeric, order_total_inr numeric,
  payment_method text, order_status text, classification text, shipment_status text, delivered_at date, revenue_recognized boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    o.id, o.woocommerce_order_id,
    COALESCE(o.woocommerce_order_number, o.woocommerce_order_id::text),
    o.ordered_at,
    NULLIF(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')), ''),
    c.email, o.billing_city, o.billing_state, agg.products, agg.total_qty,
    o.subtotal_inr, o.discount_inr, o.shipping_charged_inr, o.order_total_inr,
    COALESCE(o.payment_method_title, o.payment_method), o.status,
    COALESCE(oc.classification::text, 'unclassified'), s.status, s.delivered_at::date,
    (s.status = 'DELIVERED' AND s.delivered_at IS NOT NULL)
  FROM orders o
  LEFT JOIN customers c ON c.id = o.customer_id
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  LEFT JOIN LATERAL (
    SELECT STRING_AGG(DISTINCT ol.product_name_raw, ', ' ORDER BY ol.product_name_raw) AS products,
           SUM(ol.quantity)::int AS total_qty
    FROM order_lines ol WHERE ol.order_id = o.id
  ) agg ON true
  LEFT JOIN LATERAL (
    SELECT status, delivered_at FROM shipments WHERE order_id = o.id ORDER BY created_at DESC LIMIT 1
  ) s ON true
  WHERE (p_start IS NULL OR o.ordered_at::date >= p_start)
    AND (p_end   IS NULL OR o.ordered_at::date <= p_end)
    AND (p_order_status   IS NULL OR o.status = p_order_status)
    AND (
      p_payment_method IS NULL
      OR (LOWER(p_payment_method) = 'prepaid' AND o.payment_method <> 'cod')
      OR (LOWER(p_payment_method) = 'cod'     AND o.payment_method = 'cod')
      OR LOWER(o.payment_method) = LOWER(p_payment_method)
    )
    AND (p_city IS NULL OR LOWER(o.billing_city) ILIKE '%' || LOWER(p_city) || '%')
  ORDER BY o.ordered_at DESC
  LIMIT p_limit OFFSET p_offset;
$function$;
