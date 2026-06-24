-- ════════════════════════════════════════════════════════════════════
-- DATA TRUST AUDIT — RPC FIXES (Issues 1, 4, 5)
-- ════════════════════════════════════════════════════════════════════
-- Root causes (all RPC logic bugs; underlying data was correct):
--   1. Repeat customers = 0  → "repeat" defined as having an order before
--      p_start; for All-Time (2023-01-01) nobody qualifies. Fixed to count
--      active customers with >= 2 valid commercial orders. (0 → 82)
--   4. Returns = 0 (Executive) → RTO CTE matched status IN ('RTO',
--      'RETURNED','RETURN_DELIVERED'); real vocab is RTO_DELIVERED /
--      RTO_ACKNOWLEDGED. (0 → 27 commercial)
--   5. RTO = 0 (Operations) → counted status='RTO'/'IN_TRANSIT'/'PENDING';
--      none match real vocab. Fixed mapping. (0 → 29)

-- ─── ISSUE 1 ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_customer_kpis(p_start date, p_end date)
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
WITH lifetime AS (
  SELECT o.customer_id, COUNT(DISTINCT o.id) AS lifetime_orders
  FROM orders o
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  WHERE o.status NOT IN ('cancelled','refunded','failed','trash')
    AND o.customer_id IS NOT NULL
    AND COALESCE(oc.classification, 'paid_sale'::order_class) != ALL(non_commercial_order_classes())
  GROUP BY o.customer_id
),
active AS (
  SELECT DISTINCT o.customer_id
  FROM orders o
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  WHERE o.ordered_at::date BETWEEN p_start AND p_end
    AND o.status NOT IN ('cancelled','refunded','failed','trash')
    AND o.customer_id IS NOT NULL
    AND COALESCE(oc.classification, 'paid_sale'::order_class) != ALL(non_commercial_order_classes())
),
joined AS (
  SELECT a.customer_id, l.lifetime_orders
  FROM active a JOIN lifetime l ON l.customer_id = a.customer_id
)
SELECT json_build_object(
  'total_customers',         COUNT(*),
  'new_customers',           COUNT(*) FILTER (WHERE lifetime_orders = 1),
  'repeat_customers',        COUNT(*) FILTER (WHERE lifetime_orders >= 2),
  'repeat_purchase_pct',     ROUND(COUNT(*) FILTER (WHERE lifetime_orders >= 2)::numeric / NULLIF(COUNT(*),0) * 100, 1),
  'avg_orders_per_customer', ROUND(AVG(lifetime_orders), 1)
)
FROM joined;
$function$;

-- ─── ISSUE 4 (Executive returns/RTO) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_executive_kpis(p_start date, p_end date)
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
WITH commercial AS (
  SELECT o.id AS order_id, o.woocommerce_order_id, o.order_total_inr,
         o.customer_id, o.payment_method, o.ordered_at::date AS order_date
  FROM orders o
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  WHERE o.ordered_at::date BETWEEN p_start AND p_end
    AND o.status NOT IN ('cancelled','refunded','failed','trash')
    AND o.customer_id IS NOT NULL
    AND COALESCE(oc.classification, 'paid_sale'::order_class) != ALL(non_commercial_order_classes())
),
totals AS (
  SELECT COUNT(DISTINCT woocommerce_order_id) AS orders_count,
         COALESCE(SUM(order_total_inr), 0) AS gross_revenue,
         COUNT(DISTINCT customer_id) AS unique_customers,
         COALESCE(ROUND(AVG(order_total_inr), 2), 0) AS aov,
         COUNT(*) FILTER (WHERE COALESCE(payment_method,'') ILIKE '%cod%') AS cod_count
  FROM commercial
),
new_custs AS (
  SELECT COUNT(DISTINCT customer_id) AS cnt FROM commercial
  WHERE customer_id IN (SELECT id FROM customers c WHERE c.first_order_at::date BETWEEN p_start AND p_end)
),
rto AS (
  SELECT COUNT(DISTINCT s.order_id) AS rto_count
  FROM shipments s JOIN commercial c ON c.order_id = s.order_id
  WHERE s.status IN ('RTO_DELIVERED','RTO_ACKNOWLEDGED','RTO_INITIATED','RTO')
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
$function$;

-- ─── ISSUE 5 (Operations RTO) ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_operations_kpis(p_start date, p_end date)
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT json_build_object(
    'total_shipments',       COUNT(DISTINCT s.id),
    'delivered',             COUNT(CASE WHEN s.status = 'DELIVERED' THEN 1 END),
    'in_transit',            COUNT(CASE WHEN s.status IN ('IN_TRANSIT','IN TRANSIT','OUT_FOR_DELIVERY','PICKED_UP') THEN 1 END),
    'rto',                   COUNT(CASE WHEN s.status IN ('RTO_DELIVERED','RTO_ACKNOWLEDGED','RTO_INITIATED','RTO') THEN 1 END),
    'pending',               COUNT(CASE WHEN s.status IN ('NEW_ORDER','PENDING','PICKUP_SCHEDULED') THEN 1 END),
    'delivery_success_pct',  ROUND(COUNT(CASE WHEN s.status = 'DELIVERED' THEN 1 END)::numeric / NULLIF(COUNT(DISTINCT s.id), 0) * 100, 1),
    'rto_rate_pct',          ROUND(COUNT(CASE WHEN s.status IN ('RTO_DELIVERED','RTO_ACKNOWLEDGED','RTO_INITIATED','RTO') THEN 1 END)::numeric / NULLIF(COUNT(DISTINCT s.id), 0) * 100, 1),
    'cod_outstanding_inr',   (SELECT COALESCE(SUM(cod_payable_inr), 0) FROM v_cod_outstanding),
    'cod_outstanding_count', (SELECT COUNT(*) FROM v_cod_outstanding)
  )
  FROM shipments s
  WHERE s.channel_created_at::date BETWEEN p_start AND p_end;
$function$;
