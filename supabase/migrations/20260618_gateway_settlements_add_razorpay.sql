-- =============================================================================
-- Migration: add 'razorpay' to gateway_settlements.gateway CHECK constraint
--
-- Razorpay remits prepaid-order settlements via NEFT. These appear in the HDFC
-- bank statement as "NEFT CR-...-RAZORPAY..." narrations.
--
-- Evidence that razorpay is a valid domain value:
--   - BANK_IMPORT_SPEC.md §transaction type table: Razorpay listed as a gateway
--     settlement source alongside Infibeam, EaseBuzz, Gokwik (188 total rows)
--   - KIRGO_WORKBOOK_IMPORT_SPEC.md: 11 WC orders with payment_method='razorpay'
--   - bank_transactions.py rule already correctly emits gateway='razorpay'
--   - Omitted from CHECK constraint alongside 'gokwik' (fixed in prior migration)
-- =============================================================================

ALTER TABLE gateway_settlements
  DROP CONSTRAINT gateway_settlements_gateway_chk;

ALTER TABLE gateway_settlements
  ADD  CONSTRAINT gateway_settlements_gateway_chk
       CHECK (gateway IN ('easebuzz', 'infibeam', 'shiprocket_cod', 'gokwik', 'razorpay'));
