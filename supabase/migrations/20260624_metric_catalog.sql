-- ════════════════════════════════════════════════════════════════════
-- METRIC CATALOG — single source of truth for every KPI definition
-- Powers: info-icon tooltips, /dashboard/metric-catalog, Data Integrity Agent
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS metric_catalog (
  id              SERIAL PRIMARY KEY,
  metric_key      TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL,
  acronym         TEXT,
  category        TEXT NOT NULL,
  owner_dashboard TEXT NOT NULL,
  definition      TEXT NOT NULL,
  formula         TEXT NOT NULL,
  source_tables   TEXT NOT NULL,
  source_rpc      TEXT,
  unit            TEXT NOT NULL DEFAULT 'inr',
  basis           TEXT,
  notes           TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE metric_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY metric_catalog_select ON metric_catalog FOR SELECT USING (true);
CREATE POLICY metric_catalog_write  ON metric_catalog FOR ALL USING (current_app_role() = 'admin');
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE metric_catalog TO service_role;
GRANT USAGE, SELECT ON SEQUENCE metric_catalog_id_seq TO service_role;

INSERT INTO metric_catalog (metric_key, display_name, acronym, category, owner_dashboard, definition, formula, source_tables, source_rpc, unit, basis, notes) VALUES
('gross_revenue','Gross Revenue','GMV','revenue','Executive',
 'Total booked sales value from commercial orders plus paid manual (orphan) shipments.',
 'SUM(revenue_inr) over v_revenue_events in period (by event date).',
 'orders, order_classifications, shipments, shipment_classifications via v_revenue_events','get_executive_kpis','inr','intake',
 'Booked/intake basis (order placed). Excludes non-commercial classes (BR-201). Differs from Profitability revenue which is delivered-basis.'),
('orders_count','Orders / Sale Events',NULL,'revenue','Executive',
 'Count of revenue-generating events (commercial orders + paid orphan shipments).',
 'COUNT(*) over v_revenue_events in period.','v_revenue_events','get_executive_kpis','count','intake',
 'Includes paid manual shipments that have no WooCommerce order.'),
('aov','Average Order Value','AOV','revenue','Executive',
 'Average revenue per sale event.','gross_revenue / orders_count.','v_revenue_events','get_executive_kpis','inr','intake',NULL),
('delivered_revenue','Delivered Revenue',NULL,'profitability','Profitability',
 'Recognized revenue from delivered orders, line-item basis, used for margin analysis.',
 'SUM(order_lines.line_total_inr) for shipments where status=DELIVERED, by delivered_at.',
 'shipments, orders, order_lines','get_profitability_kpis','inr','delivered',
 'Delivered/recognition basis. Reconciles to Gross Revenue via not-shipped/cancelled/RTO bridge.'),
('repeat_customers','Repeat Customers',NULL,'customer','Customer Intelligence',
 'Customers (active in period) who have made 2+ valid commercial purchases lifetime.',
 'COUNT(active customers WHERE lifetime valid commercial orders >= 2).',
 'orders, order_classifications, customers','get_customer_kpis','count','classification',
 'Was 0 (bug: defined as order-before-period-start). Excludes cancelled/refunded and non-commercial orders.'),
('repeat_purchase_pct','Repeat Purchase Rate',NULL,'customer','Customer Intelligence',
 'Share of active customers who are repeat buyers.','repeat_customers / active_customers * 100.',
 'orders, order_classifications','get_customer_kpis','pct','classification',NULL),
('new_customers','New Customers',NULL,'customer','Customer Intelligence',
 'Active customers with exactly one lifetime valid commercial order.',
 'COUNT(active customers WHERE lifetime orders = 1).','orders, customers','get_customer_kpis','count','classification',NULL),
('ltv','Customer Lifetime Value','LTV','customer','Customer Intelligence',
 'Average total revenue generated per customer over their lifetime.',
 'SUM(customer revenue) / distinct customers.','orders, customers','get_customer_kpis','inr','intake','Planned metric — confirm formula.'),
('rto_count','Return to Origin','RTO','operations','Operations',
 'Shipments that failed delivery and were returned to origin.',
 'COUNT(shipments WHERE status IN RTO_DELIVERED, RTO_ACKNOWLEDGED, RTO_INITIATED).',
 'shipments','get_operations_kpis','count','delivered',
 'Was 0 (bug: matched status=RTO; real vocab is RTO_DELIVERED/RTO_ACKNOWLEDGED).'),
('rto_rate_pct','RTO Rate','RTO','operations','Operations',
 'Percentage of shipments returned to origin.','rto_count / total_shipments * 100.','shipments','get_operations_kpis','pct','delivered',NULL),
('return_count','Customer Returns',NULL,'operations','Operations',
 'Post-delivery customer returns logged by the courier.',
 'COUNT(returns) — distinct from RTO. Executive return_count currently counts RTO.',
 'returns','get_operations_kpis','count','delivered',
 'GOVERNANCE: Executive returns presently = RTO. True customer returns live in returns table (130 rows). Needs unification.'),
('delivery_success_pct','Delivery Success Rate',NULL,'operations','Operations',
 'Share of shipments successfully delivered.','delivered / total_shipments * 100.','shipments','get_operations_kpis','pct','delivered',NULL),
('cash_inflow','Cash Inflow',NULL,'finance','Finance & Bank',
 'Total money received into bank accounts in the period (all sources).',
 'SUM(bank_transactions.deposit_inr) in period.','bank_transactions','get_finance_kpis','inr','cash',
 'Cash basis. Includes sales collections, COD remittances, owner funding, transfers, refunds. Exceeds revenue by design. 30% currently unclassified.'),
('cod_receivable','COD Receivable','COD','receivables','Receivables',
 'Order value of COD orders awaiting collection.',
 'SUM(order_total_inr) for orders classified cod_pending.','orders, order_classifications','get_receivables_kpis','inr','classification',
 'GOVERNANCE: differs from Operations COD outstanding (v_cod_outstanding, shipment cod_payable basis = tiny). Two COD definitions need unifying.'),
('cod_outstanding','COD Outstanding','COD','operations','Operations',
 'Delivered COD shipments not yet remitted by the courier.',
 'SUM(shipments.cod_payable_inr) WHERE delivered, COD, unremitted.','shipments via v_cod_outstanding','get_operations_kpis','inr','delivered',
 'cod_payable_inr is sparsely populated; see cod_receivable for the order-basis figure.'),
('orphan_shipments','Orphaned Shipments',NULL,'operations','System Health',
 'Shipments with no linked order — manual CUSTOM-channel fulfilments.',
 'COUNT(shipments WHERE order_id IS NULL).','shipments, shipment_classifications',NULL,'count','classification',
 'Now classified via shipment_classifications. Delivered ones count as paid_sale revenue per owner rule.');
