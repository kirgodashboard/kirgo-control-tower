-- =============================================================================
-- Forecasting RPCs
-- /dashboard/forecasting — revenue, cash flow, customer, chart data
-- Methodology: trailing 3-month baseline + linear regression growth rate
-- No numbers are fabricated — all projections derive from historical orders
-- =============================================================================

-- Non-commercial exclusion inline (consistent with BR-201, avoids search_path dep)
-- Excluded classes: influencer_promotion, brand_seeding, internal_use, replacement

-- ---------------------------------------------------------------------------
-- 1. get_revenue_forecast()
--    Returns JSON: 30D / 90D / 180D × conservative / expected / optimistic
--    Baseline = trailing 3-month avg of complete calendar months
--    Growth   = REGR_SLOPE over last 6 complete months, capped −5%…+20%/month
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_revenue_forecast()
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_baseline   numeric := 0;
  v_avg_6m     numeric := 0;
  v_slope      numeric := 0;
  v_rate       numeric := 0;   -- expected monthly growth (fraction)
  v_opt_rate   numeric := 0;   -- optimistic monthly growth (fraction)
  v_n_months   int    := 0;
BEGIN
  WITH monthly AS (
    SELECT
      DATE_TRUNC('month', o.ordered_at)        AS mon,
      SUM(o.order_total_inr)                   AS rev,
      ROW_NUMBER() OVER (ORDER BY DATE_TRUNC('month', o.ordered_at)) AS rn
    FROM orders o
    LEFT JOIN order_classifications oc ON oc.order_id = o.id
    WHERE COALESCE(oc.classification::text, 'paid_sale')
          NOT IN ('influencer_promotion','brand_seeding','internal_use','replacement')
      AND DATE_TRUNC('month', o.ordered_at) < DATE_TRUNC('month', CURRENT_DATE)
      AND o.ordered_at >= CURRENT_DATE - INTERVAL '7 months'
    GROUP BY DATE_TRUNC('month', o.ordered_at)
    HAVING SUM(o.order_total_inr) > 0
  )
  SELECT
    COALESCE(
      AVG(rev) FILTER (WHERE mon >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '3 months'),
      AVG(rev), 0),
    COALESCE(AVG(rev), 0),
    COALESCE(REGR_SLOPE(rev, rn::float), 0),
    COUNT(*)::int
  INTO v_baseline, v_avg_6m, v_slope, v_n_months
  FROM monthly;

  IF v_baseline = 0 THEN v_baseline := v_avg_6m; END IF;

  v_rate     := GREATEST(-0.05, LEAST(0.20,
                  CASE WHEN v_baseline > 0 THEN v_slope / v_baseline ELSE 0 END));
  v_opt_rate := LEAST(GREATEST(v_rate, 0) * 1.5, 0.25);

  RETURN json_build_object(
    'baseline_monthly_inr', ROUND(v_baseline, 0),
    'avg_6m_monthly_inr',   ROUND(v_avg_6m, 0),
    'growth_rate_pct',      ROUND(v_rate * 100, 1),
    'months_of_data',       v_n_months,
    'generated_at',         CURRENT_DATE,

    'horizon_30d', json_build_object(
      'label',            '30 Days',
      'days',             30,
      'conservative_inr', ROUND(v_baseline, 0),
      'expected_inr',     ROUND(v_baseline * POWER(1 + v_rate, 1), 0),
      'optimistic_inr',   ROUND(v_baseline * POWER(1 + v_opt_rate, 1), 0)
    ),

    'horizon_90d', json_build_object(
      'label',            '90 Days',
      'days',             90,
      'conservative_inr', ROUND(v_baseline * 3, 0),
      'expected_inr',     ROUND(
        v_baseline * POWER(1 + v_rate, 1) +
        v_baseline * POWER(1 + v_rate, 2) +
        v_baseline * POWER(1 + v_rate, 3), 0),
      'optimistic_inr',   ROUND(
        v_baseline * POWER(1 + v_opt_rate, 1) +
        v_baseline * POWER(1 + v_opt_rate, 2) +
        v_baseline * POWER(1 + v_opt_rate, 3), 0)
    ),

    'horizon_180d', json_build_object(
      'label',            '6 Months',
      'days',             180,
      'conservative_inr', ROUND(v_baseline * 6, 0),
      'expected_inr',     ROUND(
        v_baseline * POWER(1 + v_rate, 1) +
        v_baseline * POWER(1 + v_rate, 2) +
        v_baseline * POWER(1 + v_rate, 3) +
        v_baseline * POWER(1 + v_rate, 4) +
        v_baseline * POWER(1 + v_rate, 5) +
        v_baseline * POWER(1 + v_rate, 6), 0),
      'optimistic_inr',   ROUND(
        v_baseline * POWER(1 + v_opt_rate, 1) +
        v_baseline * POWER(1 + v_opt_rate, 2) +
        v_baseline * POWER(1 + v_opt_rate, 3) +
        v_baseline * POWER(1 + v_opt_rate, 4) +
        v_baseline * POWER(1 + v_opt_rate, 5) +
        v_baseline * POWER(1 + v_opt_rate, 6), 0)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_revenue_forecast() TO anon, authenticated;


-- ---------------------------------------------------------------------------
-- 2. get_cash_flow_forecast()
--    Inflows = projected revenue
--    Outflows = COGS (from product_costs) + shipping (from shipments) + returns
--    Returns JSON: same 3-horizon × 3-scenario structure
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_cash_flow_forecast()
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_baseline     numeric := 0;
  v_avg_6m       numeric := 0;
  v_slope        numeric := 0;
  v_rate         numeric := 0;
  v_opt_rate     numeric := 0;
  v_cogs_pct     numeric := 0.535;  -- fallback: avg landed cost / avg order value
  v_ship_pct     numeric := 0.038;  -- fallback: avg freight / avg order value
  v_return_pct   numeric := 0.05;   -- fallback: refund / revenue
  v_outflow_pct  numeric;
  -- per-horizon expected values
  v_rev_30e      numeric;  v_rev_90e  numeric;  v_rev_180e  numeric;
  v_rev_30c      numeric;  v_rev_90c  numeric;  v_rev_180c  numeric;
  v_rev_30o      numeric;  v_rev_90o  numeric;  v_rev_180o  numeric;
BEGIN
  -- ── Revenue baseline (same logic as get_revenue_forecast) ────────────────
  WITH monthly AS (
    SELECT
      DATE_TRUNC('month', o.ordered_at) AS mon,
      SUM(o.order_total_inr) AS rev,
      ROW_NUMBER() OVER (ORDER BY DATE_TRUNC('month', o.ordered_at)) AS rn
    FROM orders o
    LEFT JOIN order_classifications oc ON oc.order_id = o.id
    WHERE COALESCE(oc.classification::text, 'paid_sale')
          NOT IN ('influencer_promotion','brand_seeding','internal_use','replacement')
      AND DATE_TRUNC('month', o.ordered_at) < DATE_TRUNC('month', CURRENT_DATE)
      AND o.ordered_at >= CURRENT_DATE - INTERVAL '7 months'
    GROUP BY DATE_TRUNC('month', o.ordered_at)
    HAVING SUM(o.order_total_inr) > 0
  )
  SELECT
    COALESCE(AVG(rev) FILTER (
      WHERE mon >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '3 months'),
      AVG(rev), 0),
    COALESCE(AVG(rev), 0),
    COALESCE(REGR_SLOPE(rev, rn::float), 0)
  INTO v_baseline, v_avg_6m, v_slope
  FROM monthly;

  IF v_baseline = 0 THEN v_baseline := v_avg_6m; END IF;
  v_rate     := GREATEST(-0.05, LEAST(0.20,
                  CASE WHEN v_baseline > 0 THEN v_slope / v_baseline ELSE 0 END));
  v_opt_rate := LEAST(GREATEST(v_rate, 0) * 1.5, 0.25);

  -- ── Cost ratios from actual data ─────────────────────────────────────────
  -- COGS: avg landed cost per unit / avg order value
  SELECT COALESCE(AVG(pc.landed_cost_inr) /
           NULLIF((SELECT AVG(order_total_inr) FROM orders), 0), 0.535)
  INTO v_cogs_pct FROM product_costs pc;

  -- Shipping: avg freight per shipment / avg order value
  SELECT COALESCE(AVG(s.freight_total_inr) /
           NULLIF((SELECT AVG(order_total_inr) FROM orders), 0), 0.038)
  INTO v_ship_pct FROM shipments s WHERE s.freight_total_inr > 0;

  -- Returns: avg monthly refunds / avg monthly revenue
  WITH ret_monthly AS (
    SELECT DATE_TRUNC('month', r.returned_at) AS mon,
           SUM(r.refund_amount_inr) AS refunds
    FROM returns r
    WHERE r.returned_at >= CURRENT_DATE - INTERVAL '6 months'
    GROUP BY 1
  ),
  rev_monthly AS (
    SELECT DATE_TRUNC('month', o.ordered_at) AS mon,
           SUM(o.order_total_inr) AS rev
    FROM orders o
    LEFT JOIN order_classifications oc ON oc.order_id = o.id
    WHERE COALESCE(oc.classification::text, 'paid_sale')
          NOT IN ('influencer_promotion','brand_seeding','internal_use','replacement')
      AND o.ordered_at >= CURRENT_DATE - INTERVAL '6 months'
    GROUP BY 1
  )
  SELECT COALESCE(SUM(rm.refunds) / NULLIF(SUM(rv.rev), 0), 0.05)
  INTO v_return_pct
  FROM ret_monthly rm
  JOIN rev_monthly rv ON rv.mon = rm.mon;

  -- Cap COGS at 80% (data sanity), shipping at 10%, returns at 30%
  v_cogs_pct   := LEAST(v_cogs_pct, 0.80);
  v_ship_pct   := LEAST(v_ship_pct, 0.10);
  v_return_pct := LEAST(v_return_pct, 0.30);
  v_outflow_pct := v_cogs_pct + v_ship_pct + v_return_pct;

  -- ── Project revenues for all 9 combinations ──────────────────────────────
  -- 30D
  v_rev_30c := v_baseline;
  v_rev_30e := v_baseline * POWER(1 + v_rate, 1);
  v_rev_30o := v_baseline * POWER(1 + v_opt_rate, 1);
  -- 90D
  v_rev_90c := v_baseline * 3;
  v_rev_90e := v_baseline * (POWER(1+v_rate,1) + POWER(1+v_rate,2) + POWER(1+v_rate,3));
  v_rev_90o := v_baseline * (POWER(1+v_opt_rate,1) + POWER(1+v_opt_rate,2) + POWER(1+v_opt_rate,3));
  -- 180D
  v_rev_180c := v_baseline * 6;
  v_rev_180e := v_baseline * (POWER(1+v_rate,1)+POWER(1+v_rate,2)+POWER(1+v_rate,3)+
                               POWER(1+v_rate,4)+POWER(1+v_rate,5)+POWER(1+v_rate,6));
  v_rev_180o := v_baseline * (POWER(1+v_opt_rate,1)+POWER(1+v_opt_rate,2)+POWER(1+v_opt_rate,3)+
                               POWER(1+v_opt_rate,4)+POWER(1+v_opt_rate,5)+POWER(1+v_opt_rate,6));

  RETURN json_build_object(
    'cogs_pct',          ROUND(v_cogs_pct * 100, 1),
    'shipping_pct',      ROUND(v_ship_pct * 100, 1),
    'return_rate_pct',   ROUND(v_return_pct * 100, 1),
    'total_outflow_pct', ROUND(v_outflow_pct * 100, 1),
    'note',              'Marketing/SaaS/other operating costs excluded — no expense data available',

    'horizon_30d', json_build_object(
      'label', '30 Days', 'days', 30,
      'conservative', json_build_object(
        'inflows_inr',  ROUND(v_rev_30c, 0),
        'outflows_inr', ROUND(v_rev_30c * v_outflow_pct, 0),
        'net_inr',      ROUND(v_rev_30c * (1 - v_outflow_pct), 0)),
      'expected', json_build_object(
        'inflows_inr',  ROUND(v_rev_30e, 0),
        'outflows_inr', ROUND(v_rev_30e * v_outflow_pct, 0),
        'net_inr',      ROUND(v_rev_30e * (1 - v_outflow_pct), 0)),
      'optimistic', json_build_object(
        'inflows_inr',  ROUND(v_rev_30o, 0),
        'outflows_inr', ROUND(v_rev_30o * v_outflow_pct, 0),
        'net_inr',      ROUND(v_rev_30o * (1 - v_outflow_pct), 0))
    ),

    'horizon_90d', json_build_object(
      'label', '90 Days', 'days', 90,
      'conservative', json_build_object(
        'inflows_inr',  ROUND(v_rev_90c, 0),
        'outflows_inr', ROUND(v_rev_90c * v_outflow_pct, 0),
        'net_inr',      ROUND(v_rev_90c * (1 - v_outflow_pct), 0)),
      'expected', json_build_object(
        'inflows_inr',  ROUND(v_rev_90e, 0),
        'outflows_inr', ROUND(v_rev_90e * v_outflow_pct, 0),
        'net_inr',      ROUND(v_rev_90e * (1 - v_outflow_pct), 0)),
      'optimistic', json_build_object(
        'inflows_inr',  ROUND(v_rev_90o, 0),
        'outflows_inr', ROUND(v_rev_90o * v_outflow_pct, 0),
        'net_inr',      ROUND(v_rev_90o * (1 - v_outflow_pct), 0))
    ),

    'horizon_180d', json_build_object(
      'label', '6 Months', 'days', 180,
      'conservative', json_build_object(
        'inflows_inr',  ROUND(v_rev_180c, 0),
        'outflows_inr', ROUND(v_rev_180c * v_outflow_pct, 0),
        'net_inr',      ROUND(v_rev_180c * (1 - v_outflow_pct), 0)),
      'expected', json_build_object(
        'inflows_inr',  ROUND(v_rev_180e, 0),
        'outflows_inr', ROUND(v_rev_180e * v_outflow_pct, 0),
        'net_inr',      ROUND(v_rev_180e * (1 - v_outflow_pct), 0)),
      'optimistic', json_build_object(
        'inflows_inr',  ROUND(v_rev_180o, 0),
        'outflows_inr', ROUND(v_rev_180o * v_outflow_pct, 0),
        'net_inr',      ROUND(v_rev_180o * (1 - v_outflow_pct), 0))
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_cash_flow_forecast() TO anon, authenticated;


-- ---------------------------------------------------------------------------
-- 3. get_customer_forecast()
--    TABLE: 6 future months of projected new + active customer counts
--    Baseline = trailing 3-month avg of new/active customers per month
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_customer_forecast()
RETURNS TABLE (
  month                       date,
  new_customers_conservative  int,
  new_customers_expected      int,
  new_customers_optimistic    int,
  active_customers_expected   int,
  cumulative_base             int,
  cumulative_expected         int,
  repeat_rate_pct             numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_base_new       numeric := 0;
  v_base_active    numeric := 0;
  v_base_repeat    numeric := 0;
  v_total_base     int    := 0;
  v_new_slope      numeric := 0;
  v_new_rate       numeric := 0;
BEGIN
  -- Trailing 3M avg of new customers and active customers per month
  WITH monthly AS (
    SELECT
      DATE_TRUNC('month', o.ordered_at) AS mon,
      COUNT(DISTINCT o.customer_id) AS active_cust,
      COUNT(DISTINCT CASE
        WHEN o.ordered_at = (
          SELECT MIN(o2.ordered_at) FROM orders o2
          WHERE o2.customer_id = o.customer_id
        ) THEN o.customer_id END) AS new_cust,
      ROW_NUMBER() OVER (ORDER BY DATE_TRUNC('month', o.ordered_at)) AS rn
    FROM orders o
    LEFT JOIN order_classifications oc ON oc.order_id = o.id
    WHERE COALESCE(oc.classification::text, 'paid_sale')
          NOT IN ('influencer_promotion','brand_seeding','internal_use','replacement')
      AND DATE_TRUNC('month', o.ordered_at) < DATE_TRUNC('month', CURRENT_DATE)
      AND o.ordered_at >= CURRENT_DATE - INTERVAL '7 months'
    GROUP BY DATE_TRUNC('month', o.ordered_at)
  )
  SELECT
    COALESCE(AVG(new_cust) FILTER (
      WHERE mon >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '3 months'), AVG(new_cust), 0),
    COALESCE(AVG(active_cust) FILTER (
      WHERE mon >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '3 months'), AVG(active_cust), 0),
    COALESCE(
      AVG(CASE WHEN active_cust > 0
          THEN (active_cust - new_cust)::numeric / active_cust ELSE 0 END)
      FILTER (WHERE mon >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '3 months'),
    0),
    COALESCE(REGR_SLOPE(new_cust::float, rn::float), 0)
  INTO v_base_new, v_base_active, v_base_repeat, v_new_slope
  FROM monthly;

  -- Total unique customers with any order (cumulative base)
  SELECT COUNT(DISTINCT customer_id)::int INTO v_total_base FROM orders;

  -- Monthly new-customer growth rate (capped)
  v_new_rate := GREATEST(-0.05, LEAST(0.20,
    CASE WHEN v_base_new > 0 THEN v_new_slope / v_base_new ELSE 0 END));

  RETURN QUERY
  SELECT
    (DATE_TRUNC('month', CURRENT_DATE) + (g * INTERVAL '1 month'))::date AS month,
    -- conservative: flat at 3M avg (rounded down)
    GREATEST(0, ROUND(v_base_new)::int)               AS new_customers_conservative,
    -- expected: apply growth rate
    GREATEST(0, ROUND(v_base_new * POWER(1 + v_new_rate, g))::int) AS new_customers_expected,
    -- optimistic: 1.3× growth rate
    GREATEST(0, ROUND(v_base_new * POWER(1 + LEAST(v_new_rate*1.3, 0.20), g))::int) AS new_customers_optimistic,
    -- active customers = new + estimated repeats
    GREATEST(0, ROUND(
      v_base_new * POWER(1 + v_new_rate, g) +
      (v_base_active - v_base_new) * POWER(1 + v_new_rate * 0.5, g)
    )::int) AS active_customers_expected,
    -- cumulative base: conservative
    (v_total_base + ROUND(v_base_new)::int * g)::int   AS cumulative_base,
    -- cumulative: expected (geometric sum)
    (v_total_base + ROUND(
      SUM(v_base_new * POWER(1 + v_new_rate, gs))
      OVER (ORDER BY g ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
    )::int)                                             AS cumulative_expected,
    ROUND(v_base_repeat * 100, 1)                      AS repeat_rate_pct
  FROM generate_series(1, 6) AS g
  ORDER BY 1;
END;
$$;

GRANT EXECUTE ON FUNCTION get_customer_forecast() TO anon, authenticated;


-- ---------------------------------------------------------------------------
-- 4. get_forecast_chart_data()
--    TABLE: last 12 complete months actuals + next 6 months projections
--    Used for the overlay area/line chart on the forecasting page
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_forecast_chart_data()
RETURNS TABLE (
  month            date,
  is_actual        boolean,
  actual_inr       numeric,
  conservative_inr numeric,
  expected_inr     numeric,
  optimistic_inr   numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_baseline   numeric := 0;
  v_avg_6m     numeric := 0;
  v_slope      numeric := 0;
  v_rate       numeric := 0;
  v_opt_rate   numeric := 0;
BEGIN
  WITH monthly AS (
    SELECT
      DATE_TRUNC('month', o.ordered_at) AS mon,
      SUM(o.order_total_inr) AS rev,
      ROW_NUMBER() OVER (ORDER BY DATE_TRUNC('month', o.ordered_at)) AS rn
    FROM orders o
    LEFT JOIN order_classifications oc ON oc.order_id = o.id
    WHERE COALESCE(oc.classification::text, 'paid_sale')
          NOT IN ('influencer_promotion','brand_seeding','internal_use','replacement')
      AND DATE_TRUNC('month', o.ordered_at) < DATE_TRUNC('month', CURRENT_DATE)
      AND o.ordered_at >= CURRENT_DATE - INTERVAL '7 months'
    GROUP BY DATE_TRUNC('month', o.ordered_at)
    HAVING SUM(o.order_total_inr) > 0
  )
  SELECT
    COALESCE(AVG(rev) FILTER (
      WHERE mon >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '3 months'),
      AVG(rev), 0),
    COALESCE(AVG(rev), 0),
    COALESCE(REGR_SLOPE(rev, rn::float), 0)
  INTO v_baseline, v_avg_6m, v_slope
  FROM monthly;

  IF v_baseline = 0 THEN v_baseline := v_avg_6m; END IF;
  v_rate     := GREATEST(-0.05, LEAST(0.20,
                  CASE WHEN v_baseline > 0 THEN v_slope / v_baseline ELSE 0 END));
  v_opt_rate := LEAST(GREATEST(v_rate, 0) * 1.5, 0.25);

  -- Historical actuals (last 12 complete months)
  RETURN QUERY
  SELECT
    DATE_TRUNC('month', o.ordered_at)::date,
    true,
    ROUND(SUM(o.order_total_inr), 0),
    NULL::numeric,
    NULL::numeric,
    NULL::numeric
  FROM orders o
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  WHERE COALESCE(oc.classification::text, 'paid_sale')
        NOT IN ('influencer_promotion','brand_seeding','internal_use','replacement')
    AND DATE_TRUNC('month', o.ordered_at) < DATE_TRUNC('month', CURRENT_DATE)
    AND o.ordered_at >= CURRENT_DATE - INTERVAL '13 months'
  GROUP BY DATE_TRUNC('month', o.ordered_at)
  ORDER BY 1;

  -- Forward projections (next 6 months)
  RETURN QUERY
  SELECT
    (DATE_TRUNC('month', CURRENT_DATE) + (g * INTERVAL '1 month'))::date,
    false,
    NULL::numeric,
    ROUND(v_baseline, 0),
    ROUND(v_baseline * POWER(1 + v_rate, g), 0),
    ROUND(v_baseline * POWER(1 + v_opt_rate, g), 0)
  FROM generate_series(1, 6) AS g
  ORDER BY 1;
END;
$$;

GRANT EXECUTE ON FUNCTION get_forecast_chart_data() TO anon, authenticated;
