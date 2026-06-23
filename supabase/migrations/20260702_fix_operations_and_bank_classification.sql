-- Fix 1: get_operations_kpis — use channel_created_at (actual order/shipment date)
-- Previously used created_at (DB insertion timestamp). All 914 shipments were bulk-synced
-- in a 9-minute window on 2026-06-18, so every period filter returned the same 914 count.
CREATE OR REPLACE FUNCTION get_operations_kpis(p_start date, p_end date)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT json_build_object(
    'total_shipments',       COUNT(DISTINCT s.id),
    'delivered',             COUNT(CASE WHEN s.status = 'DELIVERED' THEN 1 END),
    'in_transit',            COUNT(CASE WHEN s.status = 'IN_TRANSIT' THEN 1 END),
    'rto',                   COUNT(CASE WHEN s.status = 'RTO' THEN 1 END),
    'pending',               COUNT(CASE WHEN s.status = 'PENDING' THEN 1 END),
    'delivery_success_pct',  ROUND(
      COUNT(CASE WHEN s.status = 'DELIVERED' THEN 1 END)::numeric
      / NULLIF(COUNT(DISTINCT s.id), 0) * 100, 1),
    'rto_rate_pct',          ROUND(
      COUNT(CASE WHEN s.status = 'RTO' THEN 1 END)::numeric
      / NULLIF(COUNT(DISTINCT s.id), 0) * 100, 1),
    'cod_outstanding_inr',   (SELECT COALESCE(SUM(cod_payable_inr), 0) FROM v_cod_outstanding),
    'cod_outstanding_count', (SELECT COUNT(*) FROM v_cod_outstanding)
  )
  FROM shipments s
  WHERE s.channel_created_at::date BETWEEN p_start AND p_end;
$$;

-- Fix 2: get_unclassified_transactions — include both debits AND credits
-- Previously only returned withdrawal rows (debits) via "withdrawal_inr IS NOT NULL",
-- silently hiding all 51 unclassified credit transactions from the classification page.
CREATE OR REPLACE FUNCTION get_unclassified_transactions(p_limit int DEFAULT 100)
RETURNS TABLE (
  id                  int,
  transaction_date    date,
  narration_raw       text,
  withdrawal_inr      numeric,
  deposit_inr         numeric,
  amount_inr          numeric,
  tx_direction        text,
  closing_balance_inr numeric,
  counterparty        text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    bt.id,
    bt.transaction_date,
    bt.narration_raw,
    bt.withdrawal_inr,
    bt.deposit_inr,
    COALESCE(bt.withdrawal_inr, bt.deposit_inr, 0)                                    AS amount_inr,
    CASE WHEN COALESCE(bt.withdrawal_inr, 0) > 0 THEN 'debit'::text ELSE 'credit'::text END AS tx_direction,
    bt.closing_balance_inr,
    bt.counterparty
  FROM   bank_transactions bt
  WHERE  bt.transaction_type = 'unclassified'
  ORDER  BY bt.transaction_date DESC, bt.id DESC
  LIMIT  p_limit;
END;
$$;

-- Fix 3: reconcile_bank_credit — set transaction_type on an unclassified credit transaction
-- Used by the bank classification page to reconcile incoming money (credits).
CREATE OR REPLACE FUNCTION reconcile_bank_credit(
  p_transaction_id int,
  p_type           text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE bank_transactions
  SET    transaction_type = p_type
  WHERE  id               = p_transaction_id
    AND  transaction_type = 'unclassified'
    AND  deposit_inr      > 0;
END;
$$;
