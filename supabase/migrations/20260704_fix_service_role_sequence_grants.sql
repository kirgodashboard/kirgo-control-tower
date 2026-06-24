-- Second layer of the permission fix: service_role needs USAGE on sequences
-- backing auto-increment id columns. Table grants alone are insufficient for INSERT.
-- "permission denied for sequence orders_id_seq" was failing every WooCommerce insert.

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Ensure future sequences/tables created by migrations also grant service_role automatically
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
