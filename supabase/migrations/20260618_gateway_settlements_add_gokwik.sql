-- =============================================================================
-- Migration: add 'gokwik' to gateway_settlements.gateway CHECK constraint
--
-- GoKwik (legal entity: Bigfoot Retail Solutions Pvt Ltd) remits prepaid-order
-- settlements via NEFT from ICICI nodal account. These appear in the HDFC bank
-- statement as "NEFT CR-ICIC0099999-BIGFOOT RETAIL SOLUTIONS PVT LTD-KIRGO-{CMS_REF}".
--
-- Evidence that gokwik is a valid domain value:
--   - BANK_IMPORT_SPEC.md §8.3: 6 settlements, ₹17,490 documented
--   - 79 WC orders with payment_method='gokwik_prepaid' require gateway reconciliation
--   - The CHECK constraint was written without gokwik; the spec always included it
--
-- Safe to run: DROP + ADD CONSTRAINT is transactional in PostgreSQL.
-- =============================================================================

ALTER TABLE gateway_settlements
  DROP CONSTRAINT gateway_settlements_gateway_chk;

ALTER TABLE gateway_settlements
  ADD  CONSTRAINT gateway_settlements_gateway_chk
       CHECK (gateway IN ('easebuzz', 'infibeam', 'shiprocket_cod', 'gokwik'));
