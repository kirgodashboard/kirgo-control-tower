-- Logistics Register: shipment-level view with AWB, courier, COD, timeline
CREATE OR REPLACE FUNCTION get_logistics_register(
  p_start          date    DEFAULT NULL,
  p_end            date    DEFAULT NULL,
  p_status         text    DEFAULT NULL,
  p_payment_method text    DEFAULT NULL,
  p_courier        text    DEFAULT NULL,
  p_limit          int     DEFAULT 500,
  p_offset         int     DEFAULT 0
)
RETURNS TABLE (
  shipment_id          int,
  order_id             int,
  wc_order_id          bigint,
  order_number         text,
  awb_code             text,
  courier_company      text,
  channel              text,
  zone                 text,
  status               text,
  payment_method       text,
  customer_name        text,
  customer_city        text,
  customer_state       text,
  customer_pincode     text,
  sku                  text,
  product_qty          int,
  order_total_inr      numeric,
  freight_inr          numeric,
  cod_charges_inr      numeric,
  cod_payable_inr      numeric,
  cod_remittance_date  date,
  cod_crf_id           text,
  utr_number           text,
  ndr_attempts         int,
  latest_ndr_reason    text,
  rto_risk             text,
  edd                  date,
  shiprocket_created_at timestamptz,
  picked_up_at         timestamptz,
  shipped_at           timestamptz,
  delivered_at         timestamptz,
  rto_initiated_at     timestamptz,
  rto_delivered_at     timestamptz,
  days_to_deliver      int,
  is_cod_remitted      boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
SELECT
  s.id                                                          AS shipment_id,
  s.order_id,
  o.woocommerce_order_id                                        AS wc_order_id,
  COALESCE(o.woocommerce_order_number, o.woocommerce_order_id::text) AS order_number,
  s.awb_code,
  s.courier_company,
  s.channel,
  s.zone,
  s.status,
  COALESCE(s.payment_method, o.payment_method)                 AS payment_method,
  TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')) AS customer_name,
  COALESCE(s.customer_city, o.billing_city)                    AS customer_city,
  COALESCE(s.customer_state, o.billing_state)                  AS customer_state,
  COALESCE(s.customer_pincode, o.billing_pincode)              AS customer_pincode,
  COALESCE(s.master_sku, s.channel_sku)                        AS sku,
  s.product_quantity                                            AS product_qty,
  COALESCE(s.order_total_inr, o.order_total_inr)               AS order_total_inr,
  s.freight_total_inr                                          AS freight_inr,
  s.cod_charges_inr,
  s.cod_payable_inr,
  s.cod_remittance_date,
  s.cod_crf_id,
  s.utr_number,
  s.ndr_attempts,
  s.latest_ndr_reason,
  s.rto_risk,
  s.edd,
  s.shiprocket_created_at,
  s.picked_up_at,
  s.shipped_at,
  s.delivered_at,
  s.rto_initiated_at,
  s.rto_delivered_at,
  CASE WHEN s.delivered_at IS NOT NULL AND s.shiprocket_created_at IS NOT NULL
    THEN EXTRACT(DAY FROM s.delivered_at - s.shiprocket_created_at)::int
    ELSE NULL
  END                                                           AS days_to_deliver,
  (s.cod_remittance_date IS NOT NULL)                          AS is_cod_remitted
FROM shipments s
LEFT JOIN orders o   ON o.id = s.order_id
LEFT JOIN customers c ON c.id = o.customer_id
WHERE (p_start IS NULL          OR s.shiprocket_created_at::date >= p_start)
  AND (p_end   IS NULL          OR s.shiprocket_created_at::date <= p_end)
  AND (p_status IS NULL         OR LOWER(s.status) ILIKE '%' || LOWER(p_status) || '%')
  AND (p_payment_method IS NULL OR LOWER(COALESCE(s.payment_method, o.payment_method,'')) ILIKE '%' || LOWER(p_payment_method) || '%')
  AND (p_courier IS NULL        OR LOWER(COALESCE(s.courier_company,'')) ILIKE '%' || LOWER(p_courier) || '%')
ORDER BY s.shiprocket_created_at DESC NULLS LAST
LIMIT p_limit OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION get_logistics_register(date,date,text,text,text,int,int) TO anon, authenticated;
