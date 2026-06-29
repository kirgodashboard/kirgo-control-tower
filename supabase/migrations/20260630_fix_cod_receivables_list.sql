-- Fix get_cod_receivables: was querying order_classifications WHERE classification='cod_pending'
-- which returns 0 rows (no orders are manually classified that way).
-- Align with cod_receivable_inr() which uses shipment delivery status.
--
-- Definition of COD receivable: COD shipment that is DELIVERED but the
-- COD remittance has NOT yet been matched to a bank transaction.

CREATE OR REPLACE FUNCTION get_cod_receivables(p_limit int DEFAULT 200)
RETURNS TABLE (
  order_id                  int,
  woocommerce_order_id      int,
  customer_name             text,
  cod_amount_inr            numeric,
  shipment_status           text,
  expected_settlement_date  date
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
SELECT
  o.id                                                                    AS order_id,
  o.woocommerce_order_id,
  COALESCE(
    NULLIF(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')), ''),
    c.email,
    'Unknown'
  )                                                                       AS customer_name,
  o.order_total_inr                                                       AS cod_amount_inr,
  -- Normalise to lower-case to match what the frontend expects
  LOWER(s.status)                                                         AS shipment_status,
  CASE
    WHEN s.cod_remittance_date IS NOT NULL THEN s.cod_remittance_date
    WHEN s.delivered_at IS NOT NULL        THEN (s.delivered_at::date + INTERVAL '7 days')::date
    ELSE NULL
  END                                                                     AS expected_settlement_date
FROM shipments s
JOIN orders o ON o.id = s.order_id
LEFT JOIN customers c ON c.id = o.customer_id
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
  )
ORDER BY o.ordered_at DESC
LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION get_cod_receivables(int) TO anon, authenticated;
