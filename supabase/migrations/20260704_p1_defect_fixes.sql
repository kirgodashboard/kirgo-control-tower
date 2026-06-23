-- =============================================================================
-- P1 Defect Sprint
-- 1. City normalization: normalize_city() + city_aliases table
-- 2. Update v_top_cities and get_city_pl to use normalized cities
-- 3. Fix customer metric definitions: align "new" definition across RPCs
-- 4. Add get_system_health RPC for the System Health dashboard
-- =============================================================================

-- ─── 1. City aliases ────────────────────────────────────────────────────────
-- Static lookup: alias_lower → canonical display name.
-- Covers major Indian city variations (case-folded, trimmed).

CREATE TABLE IF NOT EXISTS city_aliases (
  alias_lower    text PRIMARY KEY,
  canonical_city text NOT NULL
);

ALTER TABLE city_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY city_aliases_select ON city_aliases FOR SELECT TO anon, authenticated USING (true);

-- Seed canonical aliases (safe to re-run: INSERT OR IGNORE pattern)
INSERT INTO city_aliases (alias_lower, canonical_city) VALUES
  -- Mumbai
  ('bombay',           'Mumbai'),
  -- Bengaluru
  ('bangalore',        'Bengaluru'),
  ('bengaluru',        'Bengaluru'),
  ('bengalore',        'Bengaluru'),
  ('banglore',         'Bengaluru'),
  -- Delhi
  ('delhi',            'New Delhi'),
  ('new delhi',        'New Delhi'),
  -- Kolkata
  ('calcutta',         'Kolkata'),
  -- Chennai
  ('madras',           'Chennai'),
  -- Pune
  ('pune',             'Pune'),
  -- Hyderabad
  ('hyderabad',        'Hyderabad'),
  -- Ahmedabad
  ('ahmedabad',        'Ahmedabad'),
  -- Surat
  ('surat',            'Surat')
ON CONFLICT (alias_lower) DO NOTHING;


-- ─── 2. normalize_city() ────────────────────────────────────────────────────
-- Returns canonical city name: alias lookup → title-case fallback.

CREATE OR REPLACE FUNCTION normalize_city(p_city text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    -- Alias lookup (exact, case-folded)
    (SELECT ca.canonical_city
     FROM city_aliases ca
     WHERE ca.alias_lower = LOWER(TRIM(p_city))
     LIMIT 1),
    -- No alias: title-case the trimmed city
    INITCAP(TRIM(p_city))
  )
  WHERE NULLIF(TRIM(p_city), '') IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION normalize_city(text) TO anon, authenticated;


-- ─── 3. Rebuild v_top_cities with city normalization ─────────────────────────

CREATE OR REPLACE VIEW v_top_cities AS
SELECT
  COALESCE(normalize_city(o.billing_city), 'Unknown') AS city,
  COUNT(o.id)                                          AS orders_count,
  ROUND(COALESCE(SUM(o.order_total_inr), 0), 2)       AS revenue_inr,
  COUNT(DISTINCT o.customer_id)                        AS customer_count
FROM orders o
LEFT JOIN order_classifications oc ON oc.order_id = o.id
WHERE o.status NOT IN ('cancelled','refunded','failed','trash')
  AND COALESCE(oc.classification, 'paid_sale'::order_class)
      != ALL(non_commercial_order_classes())
GROUP BY COALESCE(normalize_city(o.billing_city), 'Unknown')
ORDER BY revenue_inr DESC;

ALTER VIEW v_top_cities OWNER TO postgres;
GRANT SELECT ON v_top_cities TO anon, authenticated;


-- ─── 4. Rebuild get_city_pl with city normalization ──────────────────────────

CREATE OR REPLACE FUNCTION get_city_pl(p_start date, p_end date)
RETURNS TABLE (
  city             text,
  orders_count     int,
  units_sold       int,
  revenue_inr      numeric,
  cogs_inr         numeric,
  gross_profit_inr numeric,
  gross_margin_pct numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH delivered_orders AS (
  SELECT DISTINCT ON (o.id)
    o.id                                                                 AS order_id,
    o.woocommerce_order_id,
    s.delivered_at::date                                                 AS delivered_date,
    COALESCE(normalize_city(o.billing_city), 'Unknown')                  AS city
  FROM orders o
  JOIN shipments s ON s.order_id = o.id
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  WHERE s.status = 'DELIVERED'
    AND s.delivered_at::date BETWEEN p_start AND p_end
    AND COALESCE(oc.classification, 'paid_sale'::order_class)
        != ALL(non_commercial_order_classes())
  ORDER BY o.id, s.delivered_at DESC
),
base AS (
  SELECT
    dord.city,
    dord.woocommerce_order_id,
    ol.quantity,
    COALESCE(ol.line_total_inr, 0) AS line_revenue,
    COALESCE(
      (SELECT SUM(e.allocated_cogs_inr)
       FROM order_line_bom_explosions e
       WHERE e.order_line_id = ol.id),
      ol.quantity * COALESCE(
        CASE WHEN ol.variant_id IS NOT NULL THEN
          (SELECT pc.landed_cost_inr FROM product_costs pc
           WHERE pc.variant_id = ol.variant_id
             AND pc.effective_from <= dord.delivered_date
           ORDER BY pc.effective_from DESC LIMIT 1)
        END,
        CASE WHEN ol.variant_id IS NOT NULL THEN
          (SELECT p.cogs_total_inr FROM product_variants pv
           JOIN products p ON p.id = pv.product_id
           WHERE pv.id = ol.variant_id LIMIT 1)
        ELSE 0 END
      )
    ) AS line_cogs
  FROM order_lines ol
  JOIN delivered_orders dord ON dord.order_id = ol.order_id
  WHERE ol.line_total_inr IS NOT NULL
)
SELECT
  city,
  COUNT(DISTINCT woocommerce_order_id)::int                          AS orders_count,
  SUM(quantity)::int                                                  AS units_sold,
  ROUND(SUM(line_revenue), 2)                                         AS revenue_inr,
  ROUND(SUM(line_cogs), 2)                                            AS cogs_inr,
  ROUND(SUM(line_revenue) - SUM(line_cogs), 2)                       AS gross_profit_inr,
  ROUND(
    (SUM(line_revenue) - SUM(line_cogs)) / NULLIF(SUM(line_revenue), 0) * 100,
  1)                                                                   AS gross_margin_pct
FROM base
GROUP BY city
ORDER BY SUM(line_revenue) DESC
LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION get_city_pl(date, date) TO anon, authenticated;


-- ─── 5. Fix get_executive_kpis — align new_customers definition ──────────────
-- Root cause: new_customers used HAVING MIN(ordered_at) IN period which included
-- customers whose account pre-existed but ordered first commercial order in period.
-- Now aligns with get_customer_kpis: first commercial order ever is within period.

CREATE OR REPLACE FUNCTION get_executive_kpis(p_start date, p_end date)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH commercial AS (
  SELECT
    o.id           AS order_id,
    o.order_total_inr,
    o.customer_id,
    o.payment_method,
    o.ordered_at::date AS order_date
  FROM orders o
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  WHERE o.ordered_at::date BETWEEN p_start AND p_end
    AND o.status NOT IN ('cancelled','refunded','failed','trash')
    AND o.customer_id IS NOT NULL
    AND COALESCE(oc.classification, 'paid_sale'::order_class)
        != ALL(non_commercial_order_classes())
),
totals AS (
  SELECT
    COUNT(*)                                            AS orders_count,
    COALESCE(SUM(order_total_inr), 0)                  AS gross_revenue,
    COUNT(DISTINCT customer_id)                         AS unique_customers,
    COALESCE(ROUND(AVG(order_total_inr), 2), 0)         AS aov,
    COUNT(*) FILTER (WHERE payment_method ILIKE '%cod%') AS cod_count
  FROM commercial
),
-- "New" = customer's first-ever commercial order falls within the period
new_custs AS (
  SELECT COUNT(DISTINCT o2.customer_id) AS cnt
  FROM orders o2
  LEFT JOIN order_classifications oc2 ON oc2.order_id = o2.id
  WHERE o2.status NOT IN ('cancelled','refunded','failed','trash')
    AND o2.customer_id IS NOT NULL
    AND COALESCE(oc2.classification, 'paid_sale'::order_class)
        != ALL(non_commercial_order_classes())
  GROUP BY o2.customer_id
  HAVING MIN(o2.ordered_at::date) BETWEEN p_start AND p_end
),
rto AS (
  SELECT COUNT(DISTINCT s.order_id) AS rto_count
  FROM shipments s
  JOIN commercial c ON c.order_id = s.order_id
  WHERE s.status IN ('RTO','RETURNED','RETURN_DELIVERED')
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
$$;

GRANT EXECUTE ON FUNCTION get_executive_kpis(date, date) TO anon, authenticated;


-- ─── 6. Fix get_customer_kpis — same "new" definition as executive ───────────
-- Root cause: old definition required exactly 1 order in period AND no prior orders.
-- Multi-order new customers (first ever order in period, but 2+ orders) were counted
-- as "repeat". Aligning to: first commercial order ever is within the period.

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
    AND COALESCE(oc.classification, 'paid_sale'::order_class)
        != ALL(non_commercial_order_classes())
  GROUP BY o.customer_id
),
-- New = first-ever commercial order falls in this period
new_customers AS (
  SELECT o2.customer_id
  FROM orders o2
  LEFT JOIN order_classifications oc2 ON oc2.order_id = o2.id
  WHERE o2.status NOT IN ('cancelled','refunded','failed','trash')
    AND o2.customer_id IS NOT NULL
    AND COALESCE(oc2.classification, 'paid_sale'::order_class)
        != ALL(non_commercial_order_classes())
  GROUP BY o2.customer_id
  HAVING MIN(o2.ordered_at::date) BETWEEN p_start AND p_end
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

GRANT EXECUTE ON FUNCTION get_customer_kpis(date, date) TO anon, authenticated;


-- ─── 7. get_system_health RPC ────────────────────────────────────────────────
-- Powers the /dashboard/system-health page.
-- Returns scores, timestamps, and per-integration status.

CREATE OR REPLACE FUNCTION get_system_health()
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_result json;
BEGIN
  SELECT json_build_object(

    -- ── Integration status (per key) ──────────────────────────────────────
    'integrations', (
      SELECT json_agg(json_build_object(
        'key',           sj.integration_key,
        'name',          is2.display_name,
        'is_enabled',    is2.is_enabled,
        'last_run_at',   sr.started_at,
        'last_status',   sr.status,
        'error_summary', sr.error_summary,
        'records_fetched', sr.records_fetched
      ) ORDER BY sj.integration_key)
      FROM (
        SELECT DISTINCT ON (integration_key) integration_key
        FROM sync_jobs
        ORDER BY integration_key
      ) sj
      JOIN integration_settings is2 ON is2.integration_key = sj.integration_key
      LEFT JOIN LATERAL (
        SELECT sr2.started_at, sr2.status, sr2.error_summary, sr2.records_fetched
        FROM sync_runs sr2
        JOIN sync_jobs sj2 ON sj2.id = sr2.sync_job_id
        WHERE sj2.integration_key = sj.integration_key
        ORDER BY sr2.id DESC
        LIMIT 1
      ) sr ON true
    ),

    -- ── Latest synced records ─────────────────────────────────────────────
    'latest_order_at',    (SELECT MAX(ordered_at) FROM orders),
    'total_orders',       (SELECT COUNT(*) FROM orders),
    'latest_shipment_at', (SELECT MAX(created_at) FROM shipments),
    'total_shipments',    (SELECT COUNT(*) FROM shipments),
    'total_customers',    (SELECT COUNT(*) FROM customers),
    'unclassified_orders',(
      SELECT COUNT(*) FROM orders o
      WHERE NOT EXISTS (
        SELECT 1 FROM order_classifications oc WHERE oc.order_id = o.id
      )
    ),
    'unclassified_bank',  (
      SELECT COUNT(*) FROM bank_transactions
      WHERE transaction_type = 'unclassified'
    ),

    -- ── Data quality score (0-100) ────────────────────────────────────────
    -- Deductions: unclassified orders (-2 each, max -40), unclassified bank (-1 each, max -20)
    -- sync failures 7d (-5 each, max -30)
    'data_quality_score', GREATEST(0, 100
      - LEAST(40, (
          SELECT COUNT(*) FROM orders o
          WHERE NOT EXISTS (SELECT 1 FROM order_classifications oc WHERE oc.order_id = o.id)
        ) * 2)
      - LEAST(20, (
          SELECT COUNT(*) FROM bank_transactions WHERE transaction_type = 'unclassified'
        ) * 1)
      - LEAST(30, (
          SELECT COUNT(*) FROM sync_runs
          WHERE status = 'failed' AND started_at > now() - interval '7 days'
        ) * 5)
    ),

    -- ── Sync failures 7d ─────────────────────────────────────────────────
    'sync_failures_7d', (
      SELECT COUNT(*) FROM sync_runs
      WHERE status = 'failed' AND started_at > now() - interval '7 days'
    ),

    -- ── COD reconciliation ────────────────────────────────────────────────
    'cod_outstanding_inr',   (
      SELECT COALESCE(SUM(s.cod_payable_inr), 0)
      FROM shipments s
      WHERE LOWER(s.payment_method) = 'cod'
        AND s.status = 'DELIVERED'
        AND s.cod_remittance_date IS NULL
    ),
    'cod_outstanding_count', (
      SELECT COUNT(*)
      FROM shipments s
      WHERE LOWER(s.payment_method) = 'cod'
        AND s.status = 'DELIVERED'
        AND s.cod_remittance_date IS NULL
    )

  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_system_health() TO anon, authenticated;
