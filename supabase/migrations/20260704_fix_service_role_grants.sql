-- Fix: grant service_role full DML on all tables sync edge functions write to.
-- Root cause: these tables were created with authenticated=SELECT only; service_role
-- was never explicitly granted, causing "permission denied" on every insert.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE orders               TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE order_lines          TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE order_classifications TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE shipments            TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE products             TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE product_variants     TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE returns              TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE bank_transactions    TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ccavenue_settlements TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE gateway_settlements  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ad_campaigns         TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ad_spend_daily       TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE stock_movements      TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE inventory_ledger     TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE inventory_batches    TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE inventory_items      TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE expenses             TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE launches             TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE launch_expenses      TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE import_runs          TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE import_errors        TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE bank_feed_runs       TO service_role;
