-- Customer Register: per-customer LTV, segment, order history aggregation
-- Filters by last_order_at within the given date window, with segment and city filters.
-- BR-201 enforced: non-commercial orders excluded from all counts and revenue.

CREATE OR REPLACE FUNCTION get_customer_register(
  p_start    date    DEFAULT NULL,
  p_end      date    DEFAULT NULL,
  p_segment  text    DEFAULT NULL,  -- 'new' | 'repeat' | 'high_value'
  p_city     text    DEFAULT NULL,
  p_limit    int     DEFAULT 500,
  p_offset   int     DEFAULT 0
)
RETURNS TABLE (
  customer_id          int,
  customer_name        text,
  email                text,
  phone                text,
  city                 text,
  state                text,
  acquisition_source   text,
  first_order_at       timestamptz,
  last_order_at        timestamptz,
  days_since_last_order int,
  total_orders         bigint,
  total_revenue_inr    numeric,
  avg_order_value_inr  numeric,
  payment_preference   text,
  is_repeat            boolean,
  segment              text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH commercial_orders AS (
  SELECT
    o.customer_id,
    o.id            AS order_id,
    o.order_total_inr,
    o.ordered_at,
    o.payment_method,
    o.billing_city,
    o.billing_state
  FROM orders o
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  WHERE o.customer_id IS NOT NULL
    AND o.status NOT IN ('cancelled','refunded','failed','trash')
    AND COALESCE(oc.classification, 'paid_sale'::order_class) != ALL(non_commercial_order_classes())
),
customer_stats AS (
  SELECT
    co.customer_id,
    COUNT(*)                                     AS total_orders,
    ROUND(COALESCE(SUM(co.order_total_inr),0),2) AS total_revenue_inr,
    ROUND(COALESCE(AVG(co.order_total_inr),0),2) AS avg_order_value_inr,
    MAX(co.ordered_at)                           AS last_order_at,
    (
      SELECT co2.payment_method
      FROM commercial_orders co2
      WHERE co2.customer_id = co.customer_id
        AND co2.payment_method IS NOT NULL
      GROUP BY co2.payment_method
      ORDER BY COUNT(*) DESC
      LIMIT 1
    )                                            AS payment_preference,
    (
      SELECT co3.billing_city
      FROM commercial_orders co3
      WHERE co3.customer_id = co.customer_id
        AND co3.billing_city IS NOT NULL
      ORDER BY co3.ordered_at DESC
      LIMIT 1
    )                                            AS city,
    (
      SELECT co3.billing_state
      FROM commercial_orders co3
      WHERE co3.customer_id = co.customer_id
        AND co3.billing_state IS NOT NULL
      ORDER BY co3.ordered_at DESC
      LIMIT 1
    )                                            AS state
  FROM commercial_orders co
  GROUP BY co.customer_id
),
with_segment AS (
  SELECT
    cs.*,
    CASE
      WHEN cs.total_orders = 1          THEN 'new'
      WHEN cs.total_revenue_inr >= 5000 THEN 'high_value'
      ELSE 'repeat'
    END AS segment,
    EXTRACT(DAY FROM NOW() - cs.last_order_at)::int AS days_since_last_order
  FROM customer_stats cs
  WHERE (p_start IS NULL OR cs.last_order_at::date >= p_start)
    AND (p_end   IS NULL OR cs.last_order_at::date <= p_end)
)
SELECT
  c.id                   AS customer_id,
  TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')) AS customer_name,
  c.email,
  c.phone,
  COALESCE(ws.city, '')  AS city,
  COALESCE(ws.state,'')  AS state,
  c.acquisition_source,
  c.first_order_at,
  ws.last_order_at,
  ws.days_since_last_order,
  ws.total_orders,
  ws.total_revenue_inr,
  ws.avg_order_value_inr,
  ws.payment_preference,
  (ws.total_orders > 1)  AS is_repeat,
  ws.segment
FROM with_segment ws
JOIN customers c ON c.id = ws.customer_id
WHERE (p_segment IS NULL OR ws.segment = p_segment)
  AND (p_city    IS NULL OR LOWER(COALESCE(ws.city,'')) ILIKE '%' || LOWER(p_city) || '%')
ORDER BY ws.total_revenue_inr DESC
LIMIT p_limit OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION get_customer_register(date,date,text,text,int,int) TO anon, authenticated;

-- Customer order history: all orders for a specific customer (for the detail drawer)
CREATE OR REPLACE FUNCTION get_customer_orders(p_customer_id int)
RETURNS TABLE (
  order_id           int,
  wc_order_id        bigint,
  order_number       text,
  ordered_at         timestamptz,
  order_status       text,
  payment_method     text,
  order_total_inr    numeric,
  shipment_status    text,
  delivered_at       timestamptz,
  classification     text,
  revenue_recognized boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
SELECT
  o.id,
  o.woocommerce_order_id,
  COALESCE(o.woocommerce_order_number, o.woocommerce_order_id::text),
  o.ordered_at,
  o.status,
  o.payment_method,
  o.order_total_inr,
  s.status,
  s.delivered_at,
  COALESCE(oc.classification::text, 'paid_sale'),
  COALESCE(s.delivered_at IS NOT NULL AND o.payment_method != 'cod', o.payment_method != 'cod')
FROM orders o
LEFT JOIN order_classifications oc ON oc.order_id = o.id
LEFT JOIN shipments s ON s.order_id = o.id
WHERE o.customer_id = p_customer_id
ORDER BY o.ordered_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_customer_orders(int) TO anon, authenticated;
