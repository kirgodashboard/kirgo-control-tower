-- Fix get_cod_reconciliation: was returning cod_payable_inr (Shiprocket's service fee ₹46-110)
-- as the "COD Amount". The actual amount owed is the order total (what the customer
-- paid cash to the delivery person). Join to orders and return order_total_inr instead.
-- Also add customer name for context.

DROP FUNCTION IF EXISTS get_cod_reconciliation(date, date);

CREATE OR REPLACE FUNCTION get_cod_reconciliation(
  p_start date DEFAULT '2026-01-01',
  p_end   date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  awb_code           text,
  order_total_inr    numeric,
  cod_payable_inr    numeric,
  customer_name      text,
  delivered_at       date,
  days_outstanding   numeric,
  cod_crf_id         text,
  is_reconciled      boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    s.awb_code,
    COALESCE(o.order_total_inr, 0)                     AS order_total_inr,
    COALESCE(s.cod_payable_inr, 0)                     AS cod_payable_inr,
    COALESCE(
      NULLIF(TRIM(
        COALESCE(o.billing_first_name, c.first_name, '') || ' ' ||
        COALESCE(o.billing_last_name,  c.last_name,  '')
      ), ''),
      c.email,
      'Unknown'
    )                                                   AS customer_name,
    s.delivered_at::date,
    EXTRACT(DAY FROM NOW() - s.delivered_at)           AS days_outstanding,
    s.cod_crf_id,
    (s.cod_crf_id IS NOT NULL AND s.cod_crf_id IN (
      SELECT extracted_reference FROM bank_transactions
      WHERE transaction_type = 'cod_remittance'
        AND extracted_reference IS NOT NULL
    ))                                                  AS is_reconciled
  FROM shipments s
  LEFT JOIN orders o    ON o.id = s.order_id
  LEFT JOIN customers c ON c.id = o.customer_id
  WHERE s.payment_method = 'cod'
    AND s.status = 'DELIVERED'
    AND s.delivered_at::date BETWEEN p_start AND p_end
  ORDER BY s.delivered_at DESC;
$$;
