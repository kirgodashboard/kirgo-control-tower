-- Fix get_customer_receivables, get_receivables_trend, get_receivables_ageing:
-- All three were still querying order_classifications WHERE classification='cod_pending'
-- which returns 0 rows (no orders are classified that way).
-- Align with get_receivables_kpis and get_cod_receivables — use shipment delivery status:
--   COD receivable = COD shipment DELIVERED where CRF ID not matched to a bank cod_remittance.
-- Age is measured from delivered_at (when remittance clock starts), not ordered_at.

-- ── get_customer_receivables ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_customer_receivables(p_limit int DEFAULT 200)
RETURNS TABLE (
  order_id              int,
  woocommerce_order_id  int,
  customer_name         text,
  ordered_at            date,
  amount_inr            numeric,
  status                text,
  days_outstanding      int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
SELECT
  o.id,
  o.woocommerce_order_id,
  COALESCE(
    NULLIF(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')), ''),
    c.email,
    'Unknown'
  )                                                    AS customer_name,
  o.ordered_at::date,
  o.order_total_inr,
  o.status,
  (CURRENT_DATE - s.delivered_at::date)::int           AS days_outstanding
FROM shipments s
JOIN orders o ON o.id = s.order_id
LEFT JOIN customers c ON c.id = o.customer_id
WHERE s.payment_method = 'cod'
  AND s.status = 'DELIVERED'
  AND s.delivered_at IS NOT NULL
  AND (
    s.cod_crf_id IS NULL
    OR s.cod_crf_id NOT IN (
      SELECT extracted_reference
      FROM bank_transactions
      WHERE transaction_type = 'cod_remittance'
        AND extracted_reference IS NOT NULL
    )
  )
ORDER BY days_outstanding DESC
LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION get_customer_receivables(int) TO anon, authenticated;

-- ── get_receivables_trend ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_receivables_trend(p_days int DEFAULT 90)
RETURNS TABLE (
  period               text,
  new_receivables_inr  numeric,
  order_count          int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
SELECT
  TO_CHAR(DATE_TRUNC('week', s.delivered_at), 'YYYY-MM-DD') AS period,
  COALESCE(SUM(o.order_total_inr), 0)                        AS new_receivables_inr,
  COUNT(*)::int                                              AS order_count
FROM shipments s
JOIN orders o ON o.id = s.order_id
WHERE s.payment_method = 'cod'
  AND s.status = 'DELIVERED'
  AND s.delivered_at IS NOT NULL
  AND s.delivered_at >= (CURRENT_DATE - p_days)
  AND (
    s.cod_crf_id IS NULL
    OR s.cod_crf_id NOT IN (
      SELECT extracted_reference
      FROM bank_transactions
      WHERE transaction_type = 'cod_remittance'
        AND extracted_reference IS NOT NULL
    )
  )
GROUP BY DATE_TRUNC('week', s.delivered_at)
ORDER BY DATE_TRUNC('week', s.delivered_at);
$$;

GRANT EXECUTE ON FUNCTION get_receivables_trend(int) TO anon, authenticated;

-- ── get_receivables_ageing ────────────────────────────────────────────────────
-- Age is days since delivery (when the remittance clock starts).
CREATE OR REPLACE FUNCTION get_receivables_ageing()
RETURNS TABLE (
  bucket        text,
  bucket_label  text,
  order_count   int,
  amount_inr    numeric,
  sort_order    int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
SELECT
  CASE
    WHEN (CURRENT_DATE - s.delivered_at::date) <= 7  THEN 'current'
    WHEN (CURRENT_DATE - s.delivered_at::date) <= 30 THEN '0_30'
    WHEN (CURRENT_DATE - s.delivered_at::date) <= 60 THEN '31_60'
    WHEN (CURRENT_DATE - s.delivered_at::date) <= 90 THEN '61_90'
    ELSE '90_plus'
  END                                              AS bucket,
  CASE
    WHEN (CURRENT_DATE - s.delivered_at::date) <= 7  THEN 'Current (0–7d)'
    WHEN (CURRENT_DATE - s.delivered_at::date) <= 30 THEN '8–30 Days'
    WHEN (CURRENT_DATE - s.delivered_at::date) <= 60 THEN '31–60 Days'
    WHEN (CURRENT_DATE - s.delivered_at::date) <= 90 THEN '61–90 Days'
    ELSE '90+ Days'
  END                                              AS bucket_label,
  COUNT(*)::int                                    AS order_count,
  COALESCE(SUM(o.order_total_inr), 0)             AS amount_inr,
  CASE
    WHEN (CURRENT_DATE - s.delivered_at::date) <= 7  THEN 1
    WHEN (CURRENT_DATE - s.delivered_at::date) <= 30 THEN 2
    WHEN (CURRENT_DATE - s.delivered_at::date) <= 60 THEN 3
    WHEN (CURRENT_DATE - s.delivered_at::date) <= 90 THEN 4
    ELSE 5
  END                                              AS sort_order
FROM shipments s
JOIN orders o ON o.id = s.order_id
WHERE s.payment_method = 'cod'
  AND s.status = 'DELIVERED'
  AND s.delivered_at IS NOT NULL
  AND (
    s.cod_crf_id IS NULL
    OR s.cod_crf_id NOT IN (
      SELECT extracted_reference
      FROM bank_transactions
      WHERE transaction_type = 'cod_remittance'
        AND extracted_reference IS NOT NULL
    )
  )
GROUP BY bucket, bucket_label, sort_order
ORDER BY sort_order;
$$;

GRANT EXECUTE ON FUNCTION get_receivables_ageing() TO anon, authenticated;
