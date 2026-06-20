-- =============================================================================
-- Order Classification + Receivables
-- Implements manual/auto classification of orders and clean receivables view.
-- Business rule: promotional orders are never receivables; they go to marketing spend.
-- =============================================================================

-- 1. Enum type
CREATE TYPE order_class AS ENUM (
  'paid_sale',
  'cod_pending',
  'influencer_promotion',
  'brand_seeding',
  'replacement',
  'warranty',
  'internal_use',
  'cancelled'
);

-- 2. Classification table (one row per order, UNIQUE enforced)
CREATE TABLE order_classifications (
  id             SERIAL PRIMARY KEY,
  order_id       INTEGER NOT NULL UNIQUE REFERENCES orders(id),
  classification order_class NOT NULL,
  is_manual      BOOLEAN NOT NULL DEFAULT false,
  notes          TEXT,
  classified_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_oc_classification ON order_classifications(classification);
CREATE INDEX idx_oc_order_id       ON order_classifications(order_id);

ALTER TABLE order_classifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oc_authenticated_select" ON order_classifications
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "oc_service_role_all" ON order_classifications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. Auto-classify all existing orders on migration
INSERT INTO order_classifications (order_id, classification, is_manual)
SELECT
  o.id,
  CASE
    WHEN o.status IN ('cancelled', 'refunded', 'failed')
      THEN 'cancelled'::order_class
    WHEN o.payment_method ILIKE '%cod%'
      AND o.status NOT IN ('completed', 'cancelled', 'refunded', 'failed')
      THEN 'cod_pending'::order_class
    ELSE 'paid_sale'::order_class
  END,
  false
FROM orders o
ON CONFLICT (order_id) DO NOTHING;

-- =============================================================================
-- RPCs
-- =============================================================================

-- classify_order: manual reclassification of a single order
CREATE OR REPLACE FUNCTION classify_order(
  p_order_id       integer,
  p_classification order_class,
  p_notes          text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO order_classifications (order_id, classification, is_manual, notes, updated_at)
  VALUES (p_order_id, p_classification, true, p_notes, now())
  ON CONFLICT (order_id) DO UPDATE
    SET classification = p_classification,
        is_manual      = true,
        notes          = p_notes,
        updated_at     = now();
END;
$$;

GRANT EXECUTE ON FUNCTION classify_order(integer, order_class, text) TO anon, authenticated;

-- auto_classify_orders: re-runs rules for all non-manual rows
CREATE OR REPLACE FUNCTION auto_classify_orders()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  INSERT INTO order_classifications (order_id, classification, is_manual)
  SELECT
    o.id,
    CASE
      WHEN o.status IN ('cancelled', 'refunded', 'failed')
        THEN 'cancelled'::order_class
      WHEN o.payment_method ILIKE '%cod%'
        AND o.status NOT IN ('completed', 'cancelled', 'refunded', 'failed')
        THEN 'cod_pending'::order_class
      ELSE 'paid_sale'::order_class
    END,
    false
  FROM orders o
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  WHERE oc.order_id IS NULL OR oc.is_manual = false
  ON CONFLICT (order_id) DO UPDATE
    SET classification = EXCLUDED.classification,
        updated_at     = now()
  WHERE order_classifications.is_manual = false;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION auto_classify_orders() TO anon, authenticated;

-- get_classification_summary: count + value per category
CREATE OR REPLACE FUNCTION get_classification_summary()
RETURNS TABLE (
  classification  text,
  order_count     bigint,
  total_value_inr numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
SELECT
  oc.classification::text,
  COUNT(*)                              AS order_count,
  COALESCE(SUM(o.order_total_inr), 0)  AS total_value_inr
FROM order_classifications oc
JOIN orders o ON o.id = oc.order_id
GROUP BY oc.classification
ORDER BY order_count DESC;
$$;

GRANT EXECUTE ON FUNCTION get_classification_summary() TO anon, authenticated;

-- get_orders_by_classification: paginated order list with customer name
CREATE OR REPLACE FUNCTION get_orders_by_classification(
  p_classification text DEFAULT NULL,
  p_limit          int  DEFAULT 50,
  p_offset         int  DEFAULT 0
)
RETURNS TABLE (
  order_id              int,
  woocommerce_order_id  int,
  customer_name         text,
  ordered_at            date,
  order_total_inr       numeric,
  payment_method        text,
  status                text,
  billing_city          text,
  classification        text,
  is_manual             boolean,
  notes                 text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
SELECT
  o.id,
  o.woocommerce_order_id,
  COALESCE(
    NULLIF(TRIM(c.first_name || ' ' || c.last_name), ''),
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
  oc.notes
FROM orders o
LEFT JOIN order_classifications oc ON oc.order_id = o.id
LEFT JOIN customers c ON c.id = o.customer_id
WHERE p_classification IS NULL
   OR oc.classification::text = p_classification
ORDER BY o.ordered_at DESC
LIMIT p_limit OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION get_orders_by_classification(text, int, int) TO anon, authenticated;

-- get_receivables_summary: KPIs for COD-pending orders only
CREATE OR REPLACE FUNCTION get_receivables_summary()
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
SELECT json_build_object(
  'total_outstanding_inr',  ROUND(COALESCE(SUM(o.order_total_inr), 0), 2),
  'order_count',            COUNT(*),
  'avg_days_outstanding',   ROUND(AVG(CURRENT_DATE - o.ordered_at::date), 1),
  'oldest_days',            COALESCE(MAX(CURRENT_DATE - o.ordered_at::date)::int, 0)
)
FROM order_classifications oc
JOIN orders o ON o.id = oc.order_id
WHERE oc.classification = 'cod_pending';
$$;

GRANT EXECUTE ON FUNCTION get_receivables_summary() TO anon, authenticated;

-- get_receivables_list: COD-pending orders sorted by age, no promotional orders
CREATE OR REPLACE FUNCTION get_receivables_list(p_limit int DEFAULT 100)
RETURNS TABLE (
  order_id              int,
  woocommerce_order_id  int,
  customer_name         text,
  ordered_at            date,
  order_total_inr       numeric,
  days_outstanding      int,
  status                text,
  billing_city          text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
SELECT
  o.id,
  o.woocommerce_order_id,
  COALESCE(
    NULLIF(TRIM(c.first_name || ' ' || c.last_name), ''),
    c.email,
    'Unknown'
  )                                  AS customer_name,
  o.ordered_at::date,
  o.order_total_inr,
  (CURRENT_DATE - o.ordered_at::date)::int AS days_outstanding,
  o.status,
  o.billing_city
FROM order_classifications oc
JOIN orders o ON o.id = oc.order_id
LEFT JOIN customers c ON c.id = o.customer_id
WHERE oc.classification = 'cod_pending'
ORDER BY days_outstanding DESC
LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION get_receivables_list(int) TO anon, authenticated;

-- get_promo_spend_summary: for profitability marketing spend line
CREATE OR REPLACE FUNCTION get_promo_spend_summary(p_start date, p_end date)
RETURNS TABLE (
  classification    text,
  order_count       bigint,
  total_value_inr   numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
SELECT
  oc.classification::text,
  COUNT(*),
  COALESCE(SUM(o.order_total_inr), 0)
FROM order_classifications oc
JOIN orders o ON o.id = oc.order_id
WHERE oc.classification IN ('influencer_promotion', 'brand_seeding')
  AND o.ordered_at::date BETWEEN p_start AND p_end
GROUP BY oc.classification;
$$;

GRANT EXECUTE ON FUNCTION get_promo_spend_summary(date, date) TO anon, authenticated;

-- =============================================================================
-- Update get_profitability_kpis to exclude promotional orders from revenue
-- and add promo_spend_inr to the output
-- =============================================================================

CREATE OR REPLACE FUNCTION get_profitability_kpis(p_start date, p_end date)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH delivered_orders AS (
  SELECT DISTINCT ON (o.id)
    o.id                              AS order_id,
    s.delivered_at::date              AS delivered_date,
    COALESCE(s.freight_total_inr, 0)  AS freight,
    COALESCE(s.cod_charges_inr, 0)    AS cod_charge
  FROM orders o
  JOIN  shipments s ON s.order_id = o.id
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  WHERE s.status = 'DELIVERED'
    AND s.delivered_at::date BETWEEN p_start AND p_end
    AND COALESCE(oc.classification::text, 'paid_sale')
        NOT IN ('influencer_promotion', 'brand_seeding')
  ORDER BY o.id, s.delivered_at DESC
),
lines AS (
  SELECT
    COALESCE(ol.line_total_inr, 0)   AS line_revenue,
    ol.quantity * COALESCE(
      (SELECT pc.landed_cost_inr FROM product_costs pc
       WHERE pc.variant_id = ol.variant_id
         AND pc.effective_from <= dord.delivered_date
       ORDER BY pc.effective_from DESC LIMIT 1),
      CASE WHEN ol.variant_id IS NOT NULL THEN
        (SELECT p.cogs_total_inr FROM product_variants pv
         JOIN products p ON p.id = pv.product_id
         WHERE pv.id = ol.variant_id LIMIT 1)
      ELSE 0 END
    )                                AS line_cogs
  FROM order_lines ol
  JOIN delivered_orders dord ON dord.order_id = ol.order_id
  WHERE ol.line_total_inr IS NOT NULL
),
rev_cogs AS (
  SELECT
    COALESCE(SUM(line_revenue), 0) AS revenue,
    COALESCE(SUM(line_cogs), 0)    AS cogs
  FROM lines
),
ship_totals AS (
  SELECT
    COALESCE(SUM(freight), 0)    AS total_freight,
    COALESCE(SUM(cod_charge), 0) AS total_cod
  FROM delivered_orders
),
ad AS (
  SELECT COALESCE(SUM(spend_inr), 0) AS spend
  FROM ad_spend_daily
  WHERE spend_date BETWEEN p_start AND p_end
),
promo AS (
  SELECT COALESCE(SUM(o.order_total_inr), 0) AS promo_spend
  FROM order_classifications oc
  JOIN orders o ON o.id = oc.order_id
  WHERE oc.classification IN ('influencer_promotion', 'brand_seeding')
    AND o.ordered_at::date BETWEEN p_start AND p_end
)
SELECT json_build_object(
  'revenue_inr',             ROUND(rc.revenue, 2),
  'cogs_inr',                ROUND(rc.cogs, 2),
  'gross_profit_inr',        ROUND(rc.revenue - rc.cogs, 2),
  'gross_margin_pct',        ROUND((rc.revenue - rc.cogs) / NULLIF(rc.revenue, 0) * 100, 1),
  'shipping_cost_inr',       ROUND(st.total_freight, 2),
  'cod_charges_inr',         ROUND(st.total_cod, 2),
  'ad_spend_inr',            ROUND(a.spend, 2),
  'promo_spend_inr',         ROUND(p.promo_spend, 2),
  'contribution_margin_inr', ROUND(rc.revenue - rc.cogs - st.total_freight - st.total_cod - a.spend - p.promo_spend, 2),
  'contribution_margin_pct', ROUND(
    (rc.revenue - rc.cogs - st.total_freight - st.total_cod - a.spend - p.promo_spend)
    / NULLIF(rc.revenue, 0) * 100, 1),
  'return_cost_inr',         0
)
FROM rev_cogs rc, ship_totals st, ad a, promo p;
$$;

GRANT EXECUTE ON FUNCTION get_profitability_kpis(date, date) TO anon, authenticated;
