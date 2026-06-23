-- Fix v_customer_growth_monthly: exclude customers whose only orders are cancelled/refunded.
-- Root cause: 82 customers existed in the customers table with only failed/cancelled orders.
-- These were included in the cumulative chart (620 total) but correctly excluded from
-- get_customer_kpis (538 actual buyers), creating a visible KPI mismatch.
-- After this fix, cumulative chart max = 538, matching the KPI.

CREATE OR REPLACE VIEW v_customer_growth_monthly AS
WITH actual_buyers AS (
  SELECT DISTINCT o.customer_id
  FROM orders o
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  WHERE o.customer_id IS NOT NULL
    AND o.status NOT IN ('cancelled', 'refunded', 'failed', 'trash')
    AND COALESCE(oc.classification, 'paid_sale'::order_class) NOT IN (
      'influencer_promotion'::order_class,
      'brand_seeding'::order_class,
      'internal_use'::order_class,
      'replacement'::order_class
    )
),
monthly AS (
  SELECT
    DATE_TRUNC('month', c.first_order_at)::date AS cohort_month,
    COUNT(*)                                      AS new_customers
  FROM customers c
  JOIN actual_buyers ab ON ab.customer_id = c.id
  WHERE c.first_order_at IS NOT NULL
  GROUP BY DATE_TRUNC('month', c.first_order_at)::date
)
SELECT
  cohort_month,
  new_customers,
  SUM(new_customers) OVER (ORDER BY cohort_month) AS cumulative_customers
FROM monthly
ORDER BY cohort_month;
