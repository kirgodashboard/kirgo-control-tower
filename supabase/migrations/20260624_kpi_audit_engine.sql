-- ════════════════════════════════════════════════════════════════════
-- PART A — KPI VALIDATION ENGINE (System Audit Center)
-- For each KPI: recompute independently from source tables and compare to
-- the dashboard RPC value, applying tolerances (₹1 / 0.1% / exact count).
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS audit_runs (
  id           SERIAL PRIMARY KEY,
  company_id   INT  NOT NULL DEFAULT 1,
  run_type     TEXT NOT NULL DEFAULT 'manual' CHECK (run_type IN ('manual','nightly')),
  status       TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  tests_run    INT DEFAULT 0,
  passed       INT DEFAULT 0,
  failed       INT DEFAULT 0,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS audit_results (
  id               SERIAL PRIMARY KEY,
  run_id           INT  NOT NULL REFERENCES audit_runs(id) ON DELETE CASCADE,
  company_id       INT  NOT NULL DEFAULT 1,
  dashboard_name   TEXT NOT NULL,
  kpi_name         TEXT NOT NULL,
  value_type       TEXT NOT NULL CHECK (value_type IN ('currency','percent','count')),
  dashboard_value  NUMERIC,
  calculated_value NUMERIC,
  difference       NUMERIC,
  tolerance        NUMERIC,
  status           TEXT NOT NULL CHECK (status IN ('pass','fail')),
  likely_cause     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_results_run ON audit_results(run_id);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['audit_runs','audit_results'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write  ON %I', t, t);
    EXECUTE format('CREATE POLICY %I_select ON %I FOR SELECT USING (true)', t, t);
    EXECUTE format('CREATE POLICY %I_write  ON %I FOR ALL USING (current_app_role() = ''admin'')', t, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO service_role', t);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %I_id_seq TO service_role', t);
  END LOOP;
END $$;

-- Validation engine. Each row: (dashboard, kpi, type, dashboard_value, independent_recompute, cause)
CREATE OR REPLACE FUNCTION run_kpi_audit(p_company_id INT DEFAULT 1, p_run_type TEXT DEFAULT 'manual')
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_run_id INT;
  v_s date := '2023-01-01';
  v_e date := CURRENT_DATE;
  v_pass INT; v_fail INT;
BEGIN
  INSERT INTO audit_runs(company_id, run_type) VALUES (p_company_id, p_run_type) RETURNING id INTO v_run_id;

  INSERT INTO audit_results(run_id, company_id, dashboard_name, kpi_name, value_type,
    dashboard_value, calculated_value, difference, tolerance, status, likely_cause)
  SELECT v_run_id, p_company_id, d.dashboard, d.kpi, d.vtype,
         d.dash, d.calc, ABS(COALESCE(d.dash,0)-COALESCE(d.calc,0)), tol.t,
         CASE WHEN ABS(COALESCE(d.dash,0)-COALESCE(d.calc,0)) <= tol.t THEN 'pass' ELSE 'fail' END,
         CASE WHEN ABS(COALESCE(d.dash,0)-COALESCE(d.calc,0)) <= tol.t THEN NULL ELSE d.cause END
  FROM (
    VALUES
      ('Executive Overview','Gross Revenue','currency',
        (get_executive_kpis(v_s,v_e)->>'gross_revenue_inr')::numeric,
        (SELECT COALESCE(SUM(revenue_inr),0) FROM v_revenue_events WHERE event_at::date BETWEEN v_s AND v_e),
        'RPC diverges from canonical v_revenue_events'),
      ('Executive Overview','Order/Sale Count','count',
        (get_executive_kpis(v_s,v_e)->>'orders_count')::numeric,
        (SELECT COUNT(*)::numeric FROM v_revenue_events WHERE event_at::date BETWEEN v_s AND v_e),
        'Event count mismatch'),
      ('Executive Overview','Returns (RTO)','count',
        (get_executive_kpis(v_s,v_e)->>'return_count')::numeric,
        (SELECT COUNT(*)::numeric FROM shipments WHERE status IN ('RTO_DELIVERED','RTO_ACKNOWLEDGED','RTO_INITIATED','RTO')
           AND channel_created_at::date BETWEEN v_s AND v_e),
        'Status vocabulary mismatch (expected RTO_*)'),
      ('Customer Intelligence','Repeat Customers','count',
        (get_customer_kpis(v_s,v_e)->>'repeat_customers')::numeric,
        (SELECT COUNT(*)::numeric FROM (
           SELECT o.customer_id FROM orders o LEFT JOIN order_classifications oc ON oc.order_id=o.id
           WHERE o.status NOT IN ('cancelled','refunded','failed','trash') AND o.customer_id IS NOT NULL
             AND COALESCE(oc.classification,'paid_sale'::order_class) != ALL(non_commercial_order_classes())
           GROUP BY o.customer_id HAVING COUNT(DISTINCT o.id) >= 2) x),
        'Repeat defined as pre-period order (collapses to 0 for All-Time)'),
      ('Operations','RTO Shipments','count',
        (get_operations_kpis(v_s,v_e)->>'rto')::numeric,
        (SELECT COUNT(*)::numeric FROM shipments WHERE status IN ('RTO_DELIVERED','RTO_ACKNOWLEDGED','RTO_INITIATED','RTO')
           AND channel_created_at::date BETWEEN v_s AND v_e),
        'Status filter looked for literal RTO'),
      ('Cash Flow / Receivables','COD Receivable','currency',
        (get_receivables_kpis()->>'cod_pending_inr')::numeric,
        (SELECT COALESCE(SUM(o.order_total_inr),0) FROM order_classifications oc JOIN orders o ON o.id=oc.order_id
           WHERE oc.classification='cod_pending'),
        'COD pending basis mismatch'),
      ('Cash Flow','Cash Inflow','currency',
        (get_finance_kpis(v_s,v_e)->>'cash_inflow_inr')::numeric,
        (SELECT COALESCE(SUM(deposit_inr),0) FROM bank_transactions WHERE transaction_date BETWEEN v_s AND v_e),
        'Deposit sum mismatch'),
      ('Profitability','Delivered Revenue','currency',
        (get_profitability_kpis(v_s,v_e)->>'revenue_inr')::numeric,
        (SELECT COALESCE(SUM(ol.line_total_inr),0) FROM order_lines ol
         WHERE ol.order_id IN (SELECT DISTINCT o.id FROM orders o JOIN shipments s ON s.order_id=o.id
           WHERE s.status='DELIVERED' AND s.delivered_at::date BETWEEN v_s AND v_e)),
        'Delivered line-revenue mismatch')
  ) AS d(dashboard,kpi,vtype,dash,calc,cause)
  CROSS JOIN LATERAL (SELECT CASE d.vtype WHEN 'currency' THEN 1 WHEN 'percent' THEN 0.1 ELSE 0 END AS t) tol;

  SELECT COUNT(*) FILTER (WHERE status='pass'), COUNT(*) FILTER (WHERE status='fail')
  INTO v_pass, v_fail FROM audit_results WHERE run_id=v_run_id;
  UPDATE audit_runs SET status='completed', tests_run=v_pass+v_fail, passed=v_pass, failed=v_fail, completed_at=NOW()
  WHERE id=v_run_id;
  RETURN v_run_id;
END;
$$;

CREATE OR REPLACE FUNCTION get_audit_runs(p_company_id INT DEFAULT 1, p_limit INT DEFAULT 30)
RETURNS SETOF audit_runs LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT * FROM audit_runs WHERE company_id=p_company_id ORDER BY started_at DESC LIMIT p_limit; $$;

CREATE OR REPLACE FUNCTION get_audit_results(p_run_id INT)
RETURNS SETOF audit_results LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT * FROM audit_results WHERE run_id=p_run_id ORDER BY status DESC, dashboard_name, kpi_name; $$;

GRANT SELECT ON audit_runs, audit_results TO anon, authenticated;
