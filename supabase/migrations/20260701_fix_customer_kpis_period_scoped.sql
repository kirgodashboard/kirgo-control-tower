-- Fix get_customer_kpis (two issues combined):
-- 1. total_customers was hardcoded as (SELECT COUNT(*) FROM customers) — always returned 620
--    regardless of the selected period. Now returns distinct customers who ordered in the window.
-- 2. repeat_customers definition fixed:
--    "new" = first-time buyer (no prior orders AND ordered only once in period)
--    "repeat" = either returning buyer (prior orders exist) OR multi-buyer in same period
--    This ensures "all time" views correctly show multi-order customers as repeat.
-- 3. Adds BR-201 non-commercial filter (inlined; non_commercial_order_classes() not yet deployed)
-- 4. Uses ordered_at per CLAUDE.md customer KPI date dimension rule

CREATE OR REPLACE FUNCTION get_customer_kpis(p_start date, p_end date)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH period_customers AS (
  SELECT
    o.customer_id,
    COUNT(DISTINCT o.id) AS period_order_count
  FROM orders o
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  WHERE o.ordered_at::date BETWEEN p_start AND p_end
    AND o.status NOT IN ('cancelled','refunded','failed','trash')
    AND o.customer_id IS NOT NULL
    AND COALESCE(oc.classification, 'paid_sale'::order_class) NOT IN (
      'influencer_promotion'::order_class,
      'brand_seeding'::order_class,
      'internal_use'::order_class,
      'replacement'::order_class
    )
  GROUP BY o.customer_id
),
new_customers AS (
  -- First-time buyers: single order in period AND no commercial orders before this period
  SELECT pc.customer_id
  FROM period_customers pc
  WHERE pc.period_order_count = 1
    AND NOT EXISTS (
      SELECT 1
      FROM orders o2
      LEFT JOIN order_classifications oc2 ON oc2.order_id = o2.id
      WHERE o2.customer_id = pc.customer_id
        AND o2.ordered_at::date < p_start
        AND o2.status NOT IN ('cancelled','refunded','failed','trash')
        AND COALESCE(oc2.classification, 'paid_sale'::order_class) NOT IN (
          'influencer_promotion'::order_class,
          'brand_seeding'::order_class,
          'internal_use'::order_class,
          'replacement'::order_class
        )
    )
)
SELECT json_build_object(
  'total_customers',         COUNT(*),
  'new_customers',           COUNT(*) FILTER (WHERE pc.customer_id IN (SELECT customer_id FROM new_customers)),
  'repeat_customers',        COUNT(*) FILTER (WHERE pc.customer_id NOT IN (SELECT customer_id FROM new_customers)),
  'repeat_purchase_pct',     ROUND(
    COUNT(*) FILTER (WHERE pc.customer_id NOT IN (SELECT customer_id FROM new_customers))::numeric
    / NULLIF(COUNT(*), 0) * 100, 1
  ),
  'avg_orders_per_customer', ROUND(AVG(period_order_count), 1)
)
FROM period_customers pc;
$$;
