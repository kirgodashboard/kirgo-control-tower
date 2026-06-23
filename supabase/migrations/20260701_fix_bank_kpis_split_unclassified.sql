-- Fix get_bank_kpis: add unclassified_debit_count and unclassified_credit_count
-- Previously unclassified_count counted all unclassified transactions (debits + credits).
-- The bank-classification page only handles debits, so the counts confused users.
-- Additive change — existing unclassified_count field is preserved.

CREATE OR REPLACE FUNCTION get_bank_kpis(
  p_account_id int     DEFAULT NULL,
  p_company_id int     DEFAULT 1,
  p_from       date    DEFAULT NULL,
  p_to         date    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'total_receipts',            COALESCE(SUM(bt.deposit_inr),    0),
    'total_payments',            COALESCE(SUM(bt.withdrawal_inr), 0),
    'net_flow',                  COALESCE(SUM(bt.deposit_inr) - SUM(bt.withdrawal_inr), 0),
    'unclassified_count',        COUNT(*) FILTER (WHERE bt.transaction_type = 'unclassified'),
    'unclassified_amount',       COALESCE(SUM(bt.withdrawal_inr) FILTER (WHERE bt.transaction_type = 'unclassified'), 0),
    'unclassified_debit_count',  COUNT(*) FILTER (WHERE bt.transaction_type = 'unclassified' AND bt.withdrawal_inr IS NOT NULL),
    'unclassified_credit_count', COUNT(*) FILTER (WHERE bt.transaction_type = 'unclassified' AND bt.deposit_inr IS NOT NULL AND bt.withdrawal_inr IS NULL),
    'total_transactions',        COUNT(*),
    'classified_count',          COUNT(*) FILTER (WHERE bt.transaction_type != 'unclassified'),
    'reconciliation_pct',        CASE WHEN COUNT(*) = 0 THEN 0
                                      ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE bt.transaction_type != 'unclassified') / COUNT(*), 1)
                                 END,
    'latest_balance',            (
      SELECT bt2.closing_balance_inr
      FROM   bank_transactions bt2
      WHERE  (p_account_id IS NULL OR bt2.bank_account_id = p_account_id)
        AND  bt2.closing_balance_inr IS NOT NULL
      ORDER  BY bt2.transaction_date DESC, bt2.id DESC
      LIMIT  1
    )
  )
  FROM bank_transactions bt
  WHERE (p_account_id IS NULL OR bt.bank_account_id = p_account_id)
    AND (p_from IS NULL OR bt.transaction_date >= p_from)
    AND (p_to IS NULL OR bt.transaction_date <= p_to);
$$;
