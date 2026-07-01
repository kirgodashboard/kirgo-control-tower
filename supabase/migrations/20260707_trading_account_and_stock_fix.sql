-- =============================================================================
-- 1. Fix inventory_items.unit_cost_inr — backfill from product_costs
--    Root cause: inventory_items were created with unit_cost_inr = NULL.
--    product_costs table has landed_cost_inr per variant_id.
-- =============================================================================

UPDATE inventory_items ii
SET unit_cost_inr = (
  SELECT pc.landed_cost_inr
  FROM product_costs pc
  WHERE pc.variant_id = ii.variant_id
  ORDER BY pc.effective_from DESC
  LIMIT 1
)
WHERE ii.unit_cost_inr IS NULL
  AND ii.variant_id IS NOT NULL;


-- =============================================================================
-- 2. Fix get_inventory_kpis — join product_costs as resilient fallback
--    so stock_value_inr stays correct even if unit_cost_inr is null in future.
-- =============================================================================

CREATE OR REPLACE FUNCTION get_inventory_kpis()
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
SELECT json_build_object(
  'total_skus',
    COUNT(*),
  'active_skus',
    COUNT(*) FILTER (WHERE ii.is_active = true),
  'total_units',
    COALESCE(SUM(ii.current_stock), 0),
  'stock_value_inr',
    COALESCE(ROUND(SUM(
      ii.current_stock * COALESCE(
        ii.unit_cost_inr,
        (SELECT pc.landed_cost_inr FROM product_costs pc
         WHERE pc.variant_id = ii.variant_id
         ORDER BY pc.effective_from DESC LIMIT 1),
        0
      )
    ), 2), 0),
  'low_stock_count',
    COUNT(*) FILTER (WHERE ii.is_active AND ii.current_stock > 0 AND ii.reorder_point > 0 AND ii.current_stock <= ii.reorder_point),
  'out_of_stock_count',
    COUNT(*) FILTER (WHERE ii.is_active AND ii.current_stock = 0),
  'bom_units_consumed',
    (SELECT COALESCE(SUM(quantity), 0) FROM order_line_bom_explosions),
  'hidden_in_sets_units',
    (SELECT COALESCE(SUM(quantity), 0) FROM order_line_bom_explosions),
  'total_direct_plus_set_units',
    (SELECT COALESCE(SUM(quantity), 0) FROM order_line_bom_explosions)
    + (
      SELECT COALESCE(SUM(ol.quantity), 0)
      FROM order_lines ol
      WHERE ol.unit_price_inr >= 100
        AND ol.product_name_raw NOT ILIKE '%Bra%Legging%'
        AND ol.product_name_raw ~* '(Sports Bra|Leggings)'
    )
)
FROM inventory_items ii;
$$;

GRANT EXECUTE ON FUNCTION get_inventory_kpis() TO anon, authenticated;


-- =============================================================================
-- 3. get_trading_account — Trading Account P&L
--
-- Formula:
--   Revenue (booked commercial orders in period, ordered_at basis)
--   Less: Purchases in period (from purchase_orders.invoice_date)
--   Add:  Closing Stock Value (current inventory at cost, as of today)
--   ────────────────────────────────────────────────────────
--   Goods Consumed = Purchases − Closing Stock
--   (Exact for "All Time" view where opening stock = 0.
--    For sub-periods, this is an approximation — opening stock is excluded.)
--   ────────────────────────────────────────────────────────
--   Gross Profit = Revenue − Goods Consumed
--   Less: Outbound Shipping, COD Charges, Ad Spend → Contribution Margin
--   Less: Opex, Marketing → Net Profit
--   Memo: Capex → Cash after Capex
-- =============================================================================

CREATE OR REPLACE FUNCTION get_trading_account(p_start date, p_end date)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
WITH
revenue AS (
  SELECT COALESCE(SUM(revenue_inr), 0) AS total
  FROM v_revenue_events
  WHERE event_at::date BETWEEN p_start AND p_end
),
purchases AS (
  SELECT COALESCE(SUM(po.total_inr), 0) AS total,
         COUNT(*)                        AS order_count
  FROM purchase_orders po
  WHERE COALESCE(po.invoice_date, po.created_at::date) BETWEEN p_start AND p_end
    AND po.status != 'cancelled'
),
closing_stock AS (
  SELECT COALESCE(SUM(
    ii.current_stock * COALESCE(
      ii.unit_cost_inr,
      (SELECT pc.landed_cost_inr FROM product_costs pc
       WHERE pc.variant_id = ii.variant_id
       ORDER BY pc.effective_from DESC LIMIT 1),
      0
    )
  ), 0) AS total,
  COALESCE(SUM(ii.current_stock), 0) AS total_units
  FROM inventory_items ii
  WHERE ii.current_stock > 0
),
ship_costs AS (
  SELECT COALESCE(SUM(s.freight_total_inr), 0) AS shipping,
         COALESCE(SUM(s.cod_charges_inr), 0)   AS cod
  FROM shipments s
  WHERE s.status = 'DELIVERED'
    AND s.delivered_at::date BETWEEN p_start AND p_end
),
ad AS (
  SELECT COALESCE(SUM(spend_inr), 0) AS spend
  FROM ad_spend_daily
  WHERE spend_date BETWEEN p_start AND p_end
),
exp_opex      AS (SELECT COALESCE(SUM(e.amount_inr),0) AS t FROM expenses e JOIN expense_categories ec ON ec.id=e.category_id WHERE ec.category_group='opex'      AND e.expense_date BETWEEN p_start AND p_end),
exp_marketing AS (SELECT COALESCE(SUM(e.amount_inr),0) AS t FROM expenses e JOIN expense_categories ec ON ec.id=e.category_id WHERE ec.category_group='marketing' AND e.expense_date BETWEEN p_start AND p_end),
exp_capex     AS (SELECT COALESCE(SUM(e.amount_inr),0) AS t FROM expenses e JOIN expense_categories ec ON ec.id=e.category_id WHERE ec.category_group='capex'     AND e.expense_date BETWEEN p_start AND p_end)
SELECT json_build_object(
  'revenue_inr',              ROUND(r.total, 2),
  'purchases_inr',            ROUND(p.total, 2),
  'purchase_order_count',     p.order_count,
  'closing_stock_inr',        ROUND(cs.total, 2),
  'closing_stock_units',      cs.total_units,
  -- goods_consumed = purchases minus closing stock on hand.
  -- If closing_stock > purchases (can happen in period views since stock includes
  -- pre-period inventory), goods_consumed is negative — meaning net stock build.
  'goods_consumed_inr',       ROUND(p.total - cs.total, 2),
  'gross_profit_inr',         ROUND(r.total - (p.total - cs.total), 2),
  'gross_margin_pct',         ROUND((r.total - (p.total - cs.total)) / NULLIF(r.total, 0) * 100, 1),
  'shipping_cost_inr',        ROUND(sc.shipping, 2),
  'cod_charges_inr',          ROUND(sc.cod, 2),
  'ad_spend_inr',             ROUND(a.spend, 2),
  'contribution_margin_inr',  ROUND(r.total - (p.total - cs.total) - sc.shipping - sc.cod - a.spend, 2),
  'contribution_margin_pct',  ROUND((r.total - (p.total - cs.total) - sc.shipping - sc.cod - a.spend) / NULLIF(r.total, 0) * 100, 1),
  'opex_inr',                 ROUND(eo.t, 2),
  'marketing_inr',            ROUND(em.t, 2),
  'net_profit_inr',           ROUND(r.total - (p.total - cs.total) - sc.shipping - sc.cod - a.spend - eo.t - em.t, 2),
  'net_margin_pct',           ROUND((r.total - (p.total - cs.total) - sc.shipping - sc.cod - a.spend - eo.t - em.t) / NULLIF(r.total, 0) * 100, 1),
  'capex_inr',                ROUND(ec.t, 2),
  'cash_after_capex_inr',     ROUND(r.total - (p.total - cs.total) - sc.shipping - sc.cod - a.spend - eo.t - em.t - ec.t, 2)
)
FROM revenue r, purchases p, closing_stock cs, ship_costs sc, ad a,
     exp_opex eo, exp_marketing em, exp_capex ec;
$$;

GRANT EXECUTE ON FUNCTION get_trading_account(date, date) TO anon, authenticated;
