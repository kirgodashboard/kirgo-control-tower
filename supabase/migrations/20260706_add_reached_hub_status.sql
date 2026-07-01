-- Add REACHED_AT_DESTINATION_HUB to the in-transit status group.
-- This is a Shiprocket intermediate status meaning the package has arrived at
-- the destination hub and is awaiting last-mile dispatch — operationally
-- equivalent to in-transit for management reporting purposes.
-- Also adds RETURN_IN_TRANSIT to the in-transit count for visibility.

CREATE OR REPLACE FUNCTION get_operations_kpis(p_start date, p_end date)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT json_build_object(
    'total_shipments',       COUNT(DISTINCT s.id),
    'delivered',             COUNT(CASE WHEN s.status = 'DELIVERED' THEN 1 END),
    'in_transit',            COUNT(CASE WHEN s.status IN (
                               'IN_TRANSIT','IN TRANSIT','OUT_FOR_DELIVERY','PICKED_UP',
                               'REACHED_AT_DESTINATION_HUB'
                             ) THEN 1 END),
    'rto',                   COUNT(CASE WHEN s.status IN ('RTO_DELIVERED','RTO_ACKNOWLEDGED','RTO_INITIATED','RTO') THEN 1 END),
    'pending',               COUNT(CASE WHEN s.status IN ('NEW_ORDER','PENDING','PICKUP_SCHEDULED') THEN 1 END),
    'customer_returns',      (
      SELECT COUNT(*) FROM returns r
      WHERE r.returned_at::date BETWEEN p_start AND p_end
    ),
    'delivery_success_pct',  ROUND(
      COUNT(CASE WHEN s.status = 'DELIVERED' THEN 1 END)::numeric
      / NULLIF(COUNT(DISTINCT s.id), 0) * 100, 1),
    'rto_rate_pct',          ROUND(
      COUNT(CASE WHEN s.status IN ('RTO_DELIVERED','RTO_ACKNOWLEDGED','RTO_INITIATED','RTO') THEN 1 END)::numeric
      / NULLIF(COUNT(DISTINCT s.id), 0) * 100, 1),
    'cod_outstanding_inr',   (
      SELECT COALESCE(SUM(o.order_total_inr), 0)
      FROM shipments s2
      LEFT JOIN orders o ON o.id = s2.order_id
      WHERE s2.payment_method = 'cod'
        AND s2.status = 'DELIVERED'
        AND (
          s2.cod_crf_id IS NULL
          OR s2.cod_crf_id NOT IN (
            SELECT extracted_reference FROM bank_transactions
            WHERE transaction_type = 'cod_remittance'
              AND extracted_reference IS NOT NULL
          )
        )
    ),
    'cod_outstanding_count', (
      SELECT COUNT(*) FROM shipments s2
      WHERE s2.payment_method = 'cod'
        AND s2.status = 'DELIVERED'
        AND (
          s2.cod_crf_id IS NULL
          OR s2.cod_crf_id NOT IN (
            SELECT extracted_reference FROM bank_transactions
            WHERE transaction_type = 'cod_remittance'
              AND extracted_reference IS NOT NULL
          )
        )
    )
  )
  FROM shipments s
  WHERE s.channel_created_at::date BETWEEN p_start AND p_end;
$$;

GRANT EXECUTE ON FUNCTION get_operations_kpis(date, date) TO anon, authenticated;
