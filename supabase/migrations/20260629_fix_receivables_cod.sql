-- Fix get_receivables_kpis: COD pending was queried from order_classifications
-- where classification='cod_pending', which has 0 entries. Real COD outstanding
-- comes from shipments that were delivered COD but whose CRF ID has not been
-- matched to a bank cod_remittance transaction — the same source the Operations
-- COD Reconciliation table uses.

CREATE OR REPLACE FUNCTION get_receivables_kpis()
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cod_inr             numeric := 0;
  v_cod_count           int     := 0;
  v_avg_days            numeric := 0;
  v_overdue_inr         numeric := 0;
  v_overdue_count       int     := 0;
  v_settle_pending_inr  numeric := 0;
  v_settle_pending_cnt  int     := 0;
  v_total_gateway_inr   numeric := 0;
  v_settled_inr         numeric := 0;
  v_efficiency          numeric := 0;
BEGIN
  -- COD outstanding: delivered COD shipments whose CRF ID is not matched
  -- to any bank cod_remittance transaction (same logic as Operations COD table)
  SELECT
    COALESCE(SUM(o.order_total_inr), 0),
    COUNT(*)::int,
    ROUND(COALESCE(AVG(CURRENT_DATE - s.delivered_at::date), 0), 1),
    COALESCE(SUM(CASE WHEN (CURRENT_DATE - s.delivered_at::date) > 30
                      THEN o.order_total_inr ELSE 0 END), 0),
    COUNT(CASE WHEN (CURRENT_DATE - s.delivered_at::date) > 30 THEN 1 END)::int
  INTO v_cod_inr, v_cod_count, v_avg_days, v_overdue_inr, v_overdue_count
  FROM shipments s
  LEFT JOIN orders o ON o.id = s.order_id
  WHERE s.payment_method = 'cod'
    AND s.status = 'DELIVERED'
    AND (
      s.cod_crf_id IS NULL
      OR s.cod_crf_id NOT IN (
        SELECT extracted_reference
        FROM bank_transactions
        WHERE transaction_type = 'cod_remittance'
          AND extracted_reference IS NOT NULL
      )
    );

  -- Gateway settlements pending (batch not yet matched to a bank transaction)
  SELECT
    COALESCE(SUM(amount_inr), 0),
    COUNT(*)::int
  INTO v_settle_pending_inr, v_settle_pending_cnt
  FROM gateway_settlements
  WHERE bank_transaction_id IS NULL;

  -- Collection efficiency
  SELECT
    COALESCE(SUM(amount_inr), 0),
    COALESCE(SUM(CASE WHEN bank_transaction_id IS NOT NULL THEN amount_inr ELSE 0 END), 0)
  INTO v_total_gateway_inr, v_settled_inr
  FROM gateway_settlements;

  IF v_total_gateway_inr > 0 THEN
    v_efficiency := ROUND(100.0 * v_settled_inr / v_total_gateway_inr, 1);
  ELSE
    v_efficiency := 100.0;
  END IF;

  RETURN json_build_object(
    'total_receivables_inr',   ROUND(v_cod_inr + v_settle_pending_inr, 2),
    'cod_pending_inr',         ROUND(v_cod_inr, 2),
    'cod_pending_count',       v_cod_count,
    'settlement_pending_inr',  ROUND(v_settle_pending_inr, 2),
    'settlement_pending_count', v_settle_pending_cnt,
    'avg_collection_days',     v_avg_days,
    'overdue_inr',             ROUND(v_overdue_inr, 2),
    'overdue_count',           v_overdue_count,
    'collection_efficiency_pct', v_efficiency
  );
END;
$$;
