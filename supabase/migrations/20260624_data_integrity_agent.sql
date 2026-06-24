-- ════════════════════════════════════════════════════════════════════
-- DATA INTEGRITY AGENT — nightly cross-dashboard validation + trust score
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS data_trust_runs (
  id          SERIAL PRIMARY KEY,
  run_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trust_score NUMERIC NOT NULL,
  status      TEXT NOT NULL,
  checks      JSONB NOT NULL,
  triggered_by TEXT DEFAULT 'manual'
);
ALTER TABLE data_trust_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY data_trust_runs_select ON data_trust_runs FOR SELECT USING (true);
CREATE POLICY data_trust_runs_write  ON data_trust_runs FOR ALL USING (current_app_role() = 'admin');
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE data_trust_runs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE data_trust_runs_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.run_data_trust_check(p_triggered_by text DEFAULT 'manual')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  checks jsonb := '[]'::jsonb;
  v_exec_rev numeric; v_trend_rev numeric;
  v_ops_cod numeric;  v_recv_cod numeric;
  v_repeat int; v_total_cust int;
  v_returns int; v_rto int;
  v_orphans int;
  v_last_order date; v_lag_days int;
  v_delivered int; v_sale_events int;
  red int := 0; amber int := 0; green int := 0;
  score numeric; final_status text;
BEGIN
  v_exec_rev := (get_executive_kpis('2023-01-01', CURRENT_DATE)->>'gross_revenue_inr')::numeric;
  SELECT COALESCE(SUM(revenue_inr),0) INTO v_trend_rev FROM get_revenue_trend('2023-01-01', CURRENT_DATE, 'month');
  checks := checks || jsonb_build_object('key','revenue_consistency','label','Revenue consistent across dashboards',
    'status', CASE WHEN abs(v_exec_rev - v_trend_rev) < 1 THEN 'GREEN' ELSE 'RED' END,
    'expected', v_exec_rev, 'actual', v_trend_rev, 'detail','Executive vs revenue-trend gross revenue');

  v_ops_cod  := (get_operations_kpis('2023-01-01', CURRENT_DATE)->>'cod_outstanding_inr')::numeric;
  v_recv_cod := cod_receivable_inr();
  checks := checks || jsonb_build_object('key','cod_consistency','label','COD outstanding consistent',
    'status', CASE WHEN abs(v_ops_cod - v_recv_cod) < 1 THEN 'GREEN' ELSE 'RED' END,
    'expected', v_recv_cod, 'actual', v_ops_cod, 'detail','Operations vs Receivables COD');

  v_repeat := (get_customer_kpis('2023-01-01', CURRENT_DATE)->>'repeat_customers')::int;
  v_total_cust := (get_customer_kpis('2023-01-01', CURRENT_DATE)->>'total_customers')::int;
  checks := checks || jsonb_build_object('key','repeat_customers','label','Repeat customers populated',
    'status', CASE WHEN v_repeat > 0 AND v_repeat <= v_total_cust THEN 'GREEN' ELSE 'RED' END,
    'expected','>0', 'actual', v_repeat, 'detail','Repeat customers must be > 0');

  v_returns := (get_operations_kpis('2023-01-01', CURRENT_DATE)->>'customer_returns')::int;
  v_rto := (get_operations_kpis('2023-01-01', CURRENT_DATE)->>'rto')::int;
  checks := checks || jsonb_build_object('key','returns_rto','label','Returns & RTO recognised',
    'status', CASE WHEN v_returns > 0 AND v_rto > 0 THEN 'GREEN' ELSE 'RED' END,
    'expected','>0', 'actual', format('returns=%s, rto=%s', v_returns, v_rto), 'detail','Both must be > 0');

  SELECT COUNT(*) INTO v_orphans FROM shipments WHERE order_id IS NULL;
  checks := checks || jsonb_build_object('key','orphan_shipments','label','Orphaned shipments (no order)',
    'status', CASE WHEN v_orphans = 0 THEN 'GREEN' ELSE 'AMBER' END,
    'expected', 0, 'actual', v_orphans, 'detail','Manual shipments now classified; monitor count');

  SELECT COUNT(*) INTO v_delivered FROM shipments WHERE status='DELIVERED';
  v_sale_events := (get_executive_kpis('2023-01-01', CURRENT_DATE)->>'orders_count')::int;
  checks := checks || jsonb_build_object('key','delivered_vs_orders','label','Delivered shipments vs sale events',
    'status', CASE WHEN v_delivered <= v_sale_events THEN 'GREEN' ELSE 'AMBER' END,
    'expected', format('<= %s', v_sale_events), 'actual', v_delivered, 'detail','Delivered > sale events implies unlinked shipments');

  SELECT MAX(ordered_at)::date INTO v_last_order FROM orders;
  v_lag_days := CURRENT_DATE - v_last_order;
  checks := checks || jsonb_build_object('key','sync_freshness','label','Order data freshness',
    'status', CASE WHEN v_lag_days <= 2 THEN 'GREEN' WHEN v_lag_days <= 7 THEN 'AMBER' ELSE 'RED' END,
    'expected','<= 2 days', 'actual', format('%s days (latest %s)', v_lag_days, v_last_order), 'detail','Days since latest synced order');

  SELECT COUNT(*) FILTER (WHERE value->>'status'='RED'),
         COUNT(*) FILTER (WHERE value->>'status'='AMBER'),
         COUNT(*) FILTER (WHERE value->>'status'='GREEN')
  INTO red, amber, green FROM jsonb_array_elements(checks);

  score := ROUND(green::numeric / NULLIF(red+amber+green,0) * 100, 0);
  final_status := CASE WHEN red > 0 THEN 'RED' WHEN amber > 0 THEN 'AMBER' ELSE 'GREEN' END;

  INSERT INTO data_trust_runs (trust_score, status, checks, triggered_by)
  VALUES (score, final_status, checks, p_triggered_by);

  RETURN jsonb_build_object('trust_score', score, 'status', final_status,
    'red', red, 'amber', amber, 'green', green, 'checks', checks);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_data_trust_latest()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object('run_at', run_at, 'trust_score', trust_score, 'status', status, 'checks', checks)
  FROM data_trust_runs ORDER BY run_at DESC LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_data_trust_history(p_limit int DEFAULT 30)
RETURNS TABLE(run_at timestamptz, trust_score numeric, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT run_at, trust_score, status FROM data_trust_runs ORDER BY run_at DESC LIMIT p_limit;
$function$;
