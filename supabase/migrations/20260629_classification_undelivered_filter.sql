-- Add p_undelivered_only flag to get_orders_by_classification.
-- When true, returns only orders with no DELIVERED shipment — the user needs
-- to review these and reclassify any influencer/seeding orders that are
-- sitting as paid_sale but were never real customer purchases.

DROP FUNCTION IF EXISTS get_orders_by_classification(text, integer, integer);

CREATE OR REPLACE FUNCTION get_orders_by_classification(
  p_classification   text    DEFAULT NULL,
  p_limit            int     DEFAULT 100,
  p_offset           int     DEFAULT 0,
  p_undelivered_only boolean DEFAULT false
)
RETURNS TABLE (
  id                   int,
  woocommerce_order_id int,
  customer_name        text,
  ordered_at           date,
  order_total_inr      numeric,
  payment_method       text,
  status               text,
  billing_city         text,
  classification       text,
  is_manual            boolean,
  notes                text,
  shipment_status      text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    o.id,
    o.woocommerce_order_id,
    COALESCE(
      NULLIF(TRIM(
        COALESCE(o.billing_first_name, c.first_name, '') || ' ' ||
        COALESCE(o.billing_last_name,  c.last_name,  '')
      ), ''),
      c.email,
      'Unknown'
    )                                                   AS customer_name,
    o.ordered_at::date,
    o.order_total_inr,
    COALESCE(o.payment_method_title, o.payment_method)  AS payment_method,
    o.status,
    o.billing_city,
    COALESCE(oc.classification::text, 'unclassified')   AS classification,
    COALESCE(oc.is_manual, false)                        AS is_manual,
    oc.notes,
    COALESCE(s.status, 'none')                          AS shipment_status
  FROM orders o
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  LEFT JOIN customers c ON c.id = o.customer_id
  LEFT JOIN LATERAL (
    SELECT status, delivered_at
    FROM shipments
    WHERE order_id = o.id
    ORDER BY created_at DESC
    LIMIT 1
  ) s ON true
  WHERE
    -- classification filter
    (p_classification IS NULL
     OR (p_classification = 'unclassified' AND oc.order_id IS NULL)
     OR (p_classification != 'unclassified' AND oc.classification::text = p_classification))
    -- undelivered filter: no shipment, or latest shipment not DELIVERED
    AND (NOT p_undelivered_only
         OR s.status IS NULL
         OR s.status != 'DELIVERED')
  ORDER BY o.ordered_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;
