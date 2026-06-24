-- ════════════════════════════════════════════════════════════════════
-- CANONICAL COD + RETURNS (per owner sign-off 2026-06-24)
-- 1. COD outstanding → order-basis (cod_pending order_total = ₹3.23L) so
--    Operations and Receivables agree (was shipment cod_payable = ₹783).
-- 2. RTO and Customer Returns are separate KPIs everywhere.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.cod_receivable_inr()
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT COALESCE(SUM(o.order_total_inr),0)
  FROM order_classifications oc JOIN orders o ON o.id = oc.order_id
  WHERE oc.classification = 'cod_pending';
$function$;

CREATE OR REPLACE FUNCTION public.get_operations_kpis(p_start date, p_end date)
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT json_build_object(
    'total_shipments',       COUNT(DISTINCT s.id),
    'delivered',             COUNT(CASE WHEN s.status = 'DELIVERED' THEN 1 END),
    'in_transit',            COUNT(CASE WHEN s.status IN ('IN_TRANSIT','IN TRANSIT','OUT_FOR_DELIVERY','PICKED_UP') THEN 1 END),
    'rto',                   COUNT(CASE WHEN s.status IN ('RTO_DELIVERED','RTO_ACKNOWLEDGED','RTO_INITIATED','RTO') THEN 1 END),
    'pending',               COUNT(CASE WHEN s.status IN ('NEW_ORDER','PENDING','PICKUP_SCHEDULED') THEN 1 END),
    'customer_returns',      (SELECT COUNT(*) FROM returns r WHERE r.status NOT ILIKE '%CANCEL%'),
    'delivery_success_pct',  ROUND(COUNT(CASE WHEN s.status = 'DELIVERED' THEN 1 END)::numeric / NULLIF(COUNT(DISTINCT s.id), 0) * 100, 1),
    'rto_rate_pct',          ROUND(COUNT(CASE WHEN s.status IN ('RTO_DELIVERED','RTO_ACKNOWLEDGED','RTO_INITIATED','RTO') THEN 1 END)::numeric / NULLIF(COUNT(DISTINCT s.id), 0) * 100, 1),
    'cod_outstanding_inr',   cod_receivable_inr(),
    'cod_outstanding_count', (SELECT COUNT(*) FROM order_classifications WHERE classification = 'cod_pending')
  )
  FROM shipments s
  WHERE s.channel_created_at::date BETWEEN p_start AND p_end;
$function$;

CREATE OR REPLACE FUNCTION public.get_executive_kpis(p_start date, p_end date)
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
WITH ev AS (SELECT * FROM v_revenue_events WHERE event_at::date BETWEEN p_start AND p_end),
totals AS (
  SELECT COUNT(*) AS orders_count, COALESCE(SUM(revenue_inr), 0) AS gross_revenue,
         COUNT(DISTINCT customer_id) AS unique_customers, COALESCE(ROUND(AVG(revenue_inr), 2), 0) AS aov,
         COUNT(*) FILTER (WHERE COALESCE(payment_method,'') ILIKE '%cod%') AS cod_count
  FROM ev
),
new_custs AS (
  SELECT COUNT(DISTINCT customer_id) AS cnt FROM ev
  WHERE customer_id IN (SELECT id FROM customers c WHERE c.first_order_at::date BETWEEN p_start AND p_end)
),
rto AS (
  SELECT COUNT(DISTINCT s.id) AS rto_count FROM shipments s
  WHERE s.status IN ('RTO_DELIVERED','RTO_ACKNOWLEDGED','RTO_INITIATED','RTO') AND s.channel_created_at::date BETWEEN p_start AND p_end
),
cust_ret AS (
  SELECT COUNT(*) AS ret_count FROM returns r WHERE r.status NOT ILIKE '%CANCEL%' AND r.returned_at::date BETWEEN p_start AND p_end
)
SELECT json_build_object(
  'gross_revenue_inr', ROUND(t.gross_revenue, 2), 'orders_count', t.orders_count, 'aov_inr', t.aov,
  'unique_customers', t.unique_customers, 'new_customers', nc.cnt,
  'cod_pct', ROUND(t.cod_count::numeric / NULLIF(t.orders_count, 0) * 100, 1),
  'return_count', r.rto_count, 'return_rate_pct', ROUND(r.rto_count::numeric / NULLIF(t.orders_count, 0) * 100, 1),
  'rto_count', r.rto_count, 'rto_rate_pct', ROUND(r.rto_count::numeric / NULLIF(t.orders_count, 0) * 100, 1),
  'customer_returns_count', cr.ret_count,
  'customer_returns_rate_pct', ROUND(cr.ret_count::numeric / NULLIF(t.orders_count, 0) * 100, 1)
)
FROM totals t, new_custs nc, rto r, cust_ret cr;
$function$;

-- get_director_snapshot COD → order-basis + returns exclude-cancel
-- (full body applied via MCP migration 20260624_canonical_cod_and_returns)

UPDATE metric_catalog SET
  notes = 'Canonical: order-basis (cod_pending order_total). Operations and Receivables now agree.',
  source_rpc = 'get_receivables_kpis / cod_receivable_inr'
WHERE metric_key = 'cod_receivable';
UPDATE metric_catalog SET
  definition = 'Same as COD Receivable — order-basis money owed on COD sales (Operations and Receivables unified).',
  formula = 'cod_receivable_inr(): SUM(order_total_inr) for cod_pending orders.',
  notes = 'Unified to order-basis per governance sign-off.'
WHERE metric_key = 'cod_outstanding';
UPDATE metric_catalog SET
  notes = 'Separate KPI from RTO. Customer returns = returns table rows excluding cancelled (108). RTO = shipments sent back.'
WHERE metric_key = 'return_count';
