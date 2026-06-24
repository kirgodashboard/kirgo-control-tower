-- get_order_detail(p_order_id)
-- Returns full order detail: header + line items + shipment info for the drawer UI.
-- Source record link: wc_order_id lets the UI construct the WC admin URL.

CREATE OR REPLACE FUNCTION get_order_detail(p_order_id int)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
SELECT json_build_object(
  'order_id',         o.id,
  'wc_order_id',      o.woocommerce_order_id,
  'order_number',     COALESCE(o.woocommerce_order_number, o.woocommerce_order_id::text),
  'ordered_at',       o.ordered_at,
  'paid_at',          o.paid_at,
  'status',           o.status,
  'payment_method',   COALESCE(o.payment_method_title, o.payment_method),
  'transaction_id',   o.transaction_id,
  'subtotal_inr',     o.subtotal_inr,
  'discount_inr',     o.discount_inr,
  'shipping_inr',     o.shipping_charged_inr,
  'order_total_inr',  o.order_total_inr,
  'billing_city',     o.billing_city,
  'billing_state',    o.billing_state,
  'billing_pincode',  o.billing_pincode,
  'attribution_source',   o.attribution_source,
  'attribution_medium',   o.attribution_medium,
  'attribution_campaign', o.attribution_campaign,
  'customer_name',    TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')),
  'customer_email',   c.email,
  'customer_phone',   c.phone,
  'classification',   COALESCE(oc.classification::text, 'unclassified'),
  'shipment_status',  s.status,
  'delivered_at',     s.delivered_at,
  'cod_payable_inr',  s.cod_payable_inr,
  'cod_remittance_date', s.cod_remittance_date,
  'freight_inr',      s.freight_total_inr,
  'revenue_recognized', (s.status = 'DELIVERED' AND s.delivered_at IS NOT NULL),
  'line_items',       COALESCE(
    (SELECT json_agg(json_build_object(
      'line_item_id',    ol.woocommerce_line_item_id,
      'product_name',    ol.product_name_raw,
      'sku',             ol.sku_raw,
      'quantity',        ol.quantity,
      'unit_price_inr',  ol.unit_price_inr,
      'line_subtotal',   ol.line_subtotal_inr,
      'line_total',      ol.line_total_inr
    ) ORDER BY ol.woocommerce_line_item_id)
    FROM order_lines ol
    WHERE ol.order_id = o.id),
    '[]'::json
  )
)
FROM orders o
LEFT JOIN customers c ON c.id = o.customer_id
LEFT JOIN order_classifications oc ON oc.order_id = o.id
LEFT JOIN LATERAL (
  SELECT status, delivered_at, cod_payable_inr, cod_remittance_date, freight_total_inr
  FROM shipments
  WHERE order_id = o.id
  ORDER BY created_at DESC
  LIMIT 1
) s ON true
WHERE o.id = p_order_id;
$$;
