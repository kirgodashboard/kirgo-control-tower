-- Add billing name/email columns to orders table.
-- Needed because WooCommerce guest orders have no customer_id (customer FK is null),
-- so the only source of the buyer's name is the billing object on the order itself.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS billing_first_name text,
  ADD COLUMN IF NOT EXISTS billing_last_name  text,
  ADD COLUMN IF NOT EXISTS billing_email      text;

-- Update get_sales_register to use billing name columns as primary source,
-- falling back to the customers table FK for older records.
CREATE OR REPLACE FUNCTION get_sales_register(
  p_start          date    DEFAULT NULL,
  p_end            date    DEFAULT NULL,
  p_order_status   text    DEFAULT NULL,
  p_payment_method text    DEFAULT NULL,
  p_city           text    DEFAULT NULL,
  p_limit          int     DEFAULT 200,
  p_offset         int     DEFAULT 0
)
RETURNS TABLE (
  order_id          int,
  wc_order_id       int,
  order_number      text,
  ordered_at        timestamptz,
  customer_name     text,
  customer_email    text,
  city              text,
  state             text,
  products          text,
  total_qty         int,
  subtotal_inr      numeric,
  discount_inr      numeric,
  shipping_inr      numeric,
  order_total_inr   numeric,
  payment_method    text,
  order_status      text,
  classification    text,
  shipment_status   text,
  delivered_at      date,
  revenue_recognized boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    o.id                                                         AS order_id,
    o.woocommerce_order_id                                       AS wc_order_id,
    COALESCE(o.woocommerce_order_number, o.woocommerce_order_id::text) AS order_number,
    o.ordered_at,
    NULLIF(TRIM(
      COALESCE(o.billing_first_name, c.first_name, '') || ' ' ||
      COALESCE(o.billing_last_name,  c.last_name,  '')
    ), '')                                                       AS customer_name,
    COALESCE(o.billing_email, c.email)                           AS customer_email,
    o.billing_city                                               AS city,
    o.billing_state                                              AS state,
    agg.products,
    agg.total_qty,
    o.subtotal_inr,
    o.discount_inr,
    o.shipping_charged_inr                                       AS shipping_inr,
    o.order_total_inr,
    COALESCE(o.payment_method_title, o.payment_method)          AS payment_method,
    o.status                                                     AS order_status,
    COALESCE(oc.classification::text, 'unclassified')            AS classification,
    s.status                                                     AS shipment_status,
    s.delivered_at::date                                         AS delivered_at,
    (s.status = 'DELIVERED' AND s.delivered_at IS NOT NULL)      AS revenue_recognized
  FROM orders o
  LEFT JOIN customers c ON c.id = o.customer_id
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  LEFT JOIN LATERAL (
    SELECT
      STRING_AGG(DISTINCT ol.product_name_raw, ', ' ORDER BY ol.product_name_raw) AS products,
      SUM(ol.quantity)::int AS total_qty
    FROM order_lines ol
    WHERE ol.order_id = o.id
  ) agg ON true
  LEFT JOIN LATERAL (
    SELECT status, delivered_at
    FROM shipments
    WHERE order_id = o.id
    ORDER BY created_at DESC
    LIMIT 1
  ) s ON true
  WHERE (p_start IS NULL OR o.ordered_at::date >= p_start)
    AND (p_end   IS NULL OR o.ordered_at::date <= p_end)
    AND (p_order_status   IS NULL OR o.status = p_order_status)
    AND (p_payment_method IS NULL OR LOWER(o.payment_method) = LOWER(p_payment_method))
    AND (p_city           IS NULL OR LOWER(o.billing_city)   ILIKE '%' || LOWER(p_city) || '%')
  ORDER BY o.ordered_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;
