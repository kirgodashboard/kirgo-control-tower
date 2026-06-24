-- ════════════════════════════════════════════════════════════════════
-- UNIFY HEADLINE REVENUE on v_revenue_events (booked/intake basis)
-- Previously executive used order-intake while director/trend/period-
-- comparison used delivered line-revenue → same KPI, different answers.
-- All headline "Gross Revenue" surfaces now read v_revenue_events.
-- Profitability stays on its delivered-margin basis (separate KPI).
-- Also fixes director's RTO=0 bug and inconsistent repeat calc.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_revenue_trend(p_start date, p_end date, p_grain text DEFAULT 'day')
RETURNS TABLE(period date, revenue_inr numeric, orders_count bigint, aov_inr numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT DATE_TRUNC(p_grain, ev.event_at)::date,
         SUM(ev.revenue_inr),
         COUNT(*),
         ROUND(SUM(ev.revenue_inr) / NULLIF(COUNT(*),0), 2)
  FROM v_revenue_events ev
  WHERE ev.event_at::date BETWEEN p_start AND p_end
  GROUP BY 1 ORDER BY 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_period_comparison(p_current_start date, p_current_end date, p_prior_start date, p_prior_end date)
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH cur AS (
    SELECT COALESCE(SUM(revenue_inr),0) AS rev, COUNT(*) AS ord
    FROM v_revenue_events WHERE event_at::date BETWEEN p_current_start AND p_current_end
  ),
  pri AS (
    SELECT COALESCE(SUM(revenue_inr),0) AS rev, COUNT(*) AS ord
    FROM v_revenue_events WHERE event_at::date BETWEEN p_prior_start AND p_prior_end
  )
  SELECT json_build_object(
    'current_revenue', c.rev, 'prior_revenue', p.rev,
    'revenue_change_pct', ROUND((c.rev-p.rev)/NULLIF(p.rev,0)*100,1),
    'current_orders', c.ord, 'prior_orders', p.ord,
    'orders_change_pct', ROUND((c.ord-p.ord)::numeric/NULLIF(p.ord,0)*100,1)
  ) FROM cur c, pri p;
$function$;

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
    cod_pending AS (
      SELECT COALESCE(SUM(cod_payable_inr), 0) AS total, COUNT(*) AS count FROM v_cod_outstanding
    ),
    ops_30d AS (
      SELECT COUNT(*) AS total,
             COUNT(CASE WHEN s.status = 'DELIVERED' THEN 1 END) AS delivered,
             COUNT(CASE WHEN s.status IN ('RTO_DELIVERED','RTO_ACKNOWLEDGED','RTO_INITIATED','RTO') THEN 1 END) AS rto
      FROM shipments s WHERE s.created_at >= CURRENT_DATE - 30
    ),
    returns_30d AS (
      SELECT COUNT(*) AS return_count FROM returns r
      WHERE r.returned_at::date >= CURRENT_DATE - 30 AND r.return_reason IS NOT NULL
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
         ops_30d o, returns_30d r, repeat_custs rc, alert_counts ac
  );
END;
$function$;
