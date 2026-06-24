-- ════════════════════════════════════════════════════════════════════
-- ORPHAN SHIPMENT REVENUE — shipment_classifications + canonical revenue
-- Business rule (owner): every shipment is a sale; payment received →
-- revenue, else → expense bucket (marketing/influencer/replacement/lost).
-- 130 CUSTOM-channel shipments have no order; classify them directly.
-- Decision: trust the "prepaid" label → delivered orphans = paid_sale.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS shipment_classifications (
  id             SERIAL PRIMARY KEY,
  shipment_id    INT NOT NULL REFERENCES shipments(id) UNIQUE,
  classification order_class NOT NULL DEFAULT 'paid_sale',
  is_manual      BOOLEAN NOT NULL DEFAULT false,
  notes          TEXT,
  classified_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE shipment_classifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY shipment_classifications_select ON shipment_classifications FOR SELECT USING (true);
CREATE POLICY shipment_classifications_write  ON shipment_classifications FOR ALL USING (current_app_role() = 'admin');
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE shipment_classifications TO service_role;
GRANT USAGE, SELECT ON SEQUENCE shipment_classifications_id_seq TO service_role;

INSERT INTO shipment_classifications (shipment_id, classification, is_manual, notes)
SELECT s.id,
  CASE WHEN s.status = 'DELIVERED' THEN 'paid_sale'::order_class
       WHEN s.status = 'CANCELED'  THEN 'cancelled'::order_class
  END,
  false,
  'auto: orphan CUSTOM-channel shipment, default classification'
FROM shipments s
WHERE s.order_id IS NULL
  AND s.status IN ('DELIVERED','CANCELED')
ON CONFLICT (shipment_id) DO NOTHING;

-- Canonical revenue source: commercial order OR paid_sale orphan shipment.
CREATE OR REPLACE VIEW v_revenue_events AS
  SELECT 'order'::text          AS source,
         o.id                   AS event_id,
         o.order_total_inr      AS revenue_inr,
         o.ordered_at           AS event_at,
         o.customer_id,
         o.payment_method,
         o.woocommerce_order_id AS external_ref
  FROM orders o
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  WHERE o.status NOT IN ('cancelled','refunded','failed','trash')
    AND o.customer_id IS NOT NULL
    AND COALESCE(oc.classification, 'paid_sale'::order_class) != ALL(non_commercial_order_classes())
  UNION ALL
  SELECT 'orphan_shipment'::text, s.id, s.order_total_inr, s.channel_created_at,
         NULL::int, s.payment_method, NULL::int
  FROM shipments s
  JOIN shipment_classifications sc ON sc.shipment_id = s.id
  WHERE s.order_id IS NULL
    AND sc.classification = 'paid_sale'::order_class;

GRANT SELECT ON v_revenue_events TO anon, authenticated, service_role;

-- Executive KPIs rebuilt on the canonical revenue source.
CREATE OR REPLACE FUNCTION public.get_executive_kpis(p_start date, p_end date)
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
WITH ev AS (
  SELECT * FROM v_revenue_events WHERE event_at::date BETWEEN p_start AND p_end
),
totals AS (
  SELECT COUNT(*) AS orders_count, COALESCE(SUM(revenue_inr), 0) AS gross_revenue,
         COUNT(DISTINCT customer_id) AS unique_customers,
         COALESCE(ROUND(AVG(revenue_inr), 2), 0) AS aov,
         COUNT(*) FILTER (WHERE COALESCE(payment_method,'') ILIKE '%cod%') AS cod_count
  FROM ev
),
new_custs AS (
  SELECT COUNT(DISTINCT customer_id) AS cnt FROM ev
  WHERE customer_id IN (SELECT id FROM customers c WHERE c.first_order_at::date BETWEEN p_start AND p_end)
),
rto AS (
  SELECT COUNT(DISTINCT s.id) AS rto_count FROM shipments s
  WHERE s.status IN ('RTO_DELIVERED','RTO_ACKNOWLEDGED','RTO_INITIATED','RTO')
    AND s.channel_created_at::date BETWEEN p_start AND p_end
)
SELECT json_build_object(
  'gross_revenue_inr',  ROUND(t.gross_revenue, 2),
  'orders_count',       t.orders_count,
  'aov_inr',            t.aov,
  'unique_customers',   t.unique_customers,
  'new_customers',      nc.cnt,
  'cod_pct',            ROUND(t.cod_count::numeric / NULLIF(t.orders_count, 0) * 100, 1),
  'return_count',       r.rto_count,
  'return_rate_pct',    ROUND(r.rto_count::numeric / NULLIF(t.orders_count, 0) * 100, 1)
)
FROM totals t, new_custs nc, rto r;
$function$;
