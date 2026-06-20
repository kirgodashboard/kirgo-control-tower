-- =============================================================================
-- Inventory Foundation
-- Tables: inventory_items, stock_movements
-- 5 RPCs: get_inventory_kpis, get_stock_position, get_stock_movements,
--         get_stock_ageing, get_reorder_report
-- No seed data — awaiting opening stock entry from user
-- =============================================================================

-- 1. Enum for movement types (safe if already exists)
DO $$ BEGIN
  CREATE TYPE stock_movement_type AS ENUM (
    'opening',
    'purchase_in',
    'sale_out',
    'return_in',
    'adjustment_in',
    'adjustment_out',
    'sample_out',
    'transfer_in',
    'transfer_out'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. inventory_items — one row per SKU
CREATE TABLE inventory_items (
  id              SERIAL PRIMARY KEY,
  variant_id      INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
  sku             TEXT NOT NULL UNIQUE,
  product_name    TEXT NOT NULL,
  opening_stock   INTEGER NOT NULL DEFAULT 0,
  current_stock   INTEGER NOT NULL DEFAULT 0,
  reorder_point   INTEGER NOT NULL DEFAULT 0,
  reorder_qty     INTEGER NOT NULL DEFAULT 0,
  unit_cost_inr   NUMERIC(10,2),
  location        TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  opened_on       DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inv_items_sku        ON inventory_items(sku);
CREATE INDEX idx_inv_items_variant_id ON inventory_items(variant_id);
CREATE INDEX idx_inv_items_stock      ON inventory_items(current_stock);

ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inv_items_auth_select" ON inventory_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "inv_items_service_all" ON inventory_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. stock_movements — full audit log of every stock change
CREATE TABLE stock_movements (
  id                  SERIAL PRIMARY KEY,
  inventory_item_id   INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  movement_type       stock_movement_type NOT NULL,
  quantity            INTEGER NOT NULL CHECK (quantity > 0),
  stock_after         INTEGER NOT NULL,
  unit_cost_inr       NUMERIC(10,2),
  reference_type      TEXT,
  reference_id        INTEGER,
  notes               TEXT,
  moved_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sm_item_id  ON stock_movements(inventory_item_id);
CREATE INDEX idx_sm_moved_at ON stock_movements(moved_at DESC);
CREATE INDEX idx_sm_type     ON stock_movements(movement_type);

ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sm_auth_select" ON stock_movements
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "sm_service_all" ON stock_movements
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================================================
-- RPCs
-- =============================================================================

-- get_inventory_kpis
CREATE OR REPLACE FUNCTION get_inventory_kpis()
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
SELECT json_build_object(
  'total_skus',
    COUNT(*),
  'active_skus',
    COUNT(*) FILTER (WHERE is_active = true),
  'total_units',
    COALESCE(SUM(current_stock), 0),
  'stock_value_inr',
    COALESCE(ROUND(SUM(current_stock * COALESCE(unit_cost_inr, 0)), 2), 0),
  'low_stock_count',
    COUNT(*) FILTER (WHERE is_active AND current_stock > 0 AND reorder_point > 0 AND current_stock <= reorder_point),
  'out_of_stock_count',
    COUNT(*) FILTER (WHERE is_active AND current_stock = 0)
)
FROM inventory_items;
$$;

GRANT EXECUTE ON FUNCTION get_inventory_kpis() TO anon, authenticated;

-- get_stock_position: current stock per SKU, ordered by urgency
CREATE OR REPLACE FUNCTION get_stock_position(
  p_search  text DEFAULT NULL,
  p_limit   int  DEFAULT 200,
  p_offset  int  DEFAULT 0
)
RETURNS TABLE (
  id                int,
  sku               text,
  product_name      text,
  current_stock     int,
  reorder_point     int,
  reorder_qty       int,
  unit_cost_inr     numeric,
  stock_value_inr   numeric,
  location          text,
  status            text,
  last_movement_at  timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH last_move AS (
  SELECT DISTINCT ON (inventory_item_id)
    inventory_item_id,
    moved_at
  FROM stock_movements
  ORDER BY inventory_item_id, moved_at DESC
)
SELECT
  ii.id,
  ii.sku,
  ii.product_name,
  ii.current_stock,
  ii.reorder_point,
  ii.reorder_qty,
  ii.unit_cost_inr,
  ROUND(ii.current_stock * COALESCE(ii.unit_cost_inr, 0), 2) AS stock_value_inr,
  ii.location,
  CASE
    WHEN ii.current_stock = 0                                              THEN 'out'
    WHEN ii.reorder_point > 0 AND ii.current_stock <= ii.reorder_point    THEN 'low'
    ELSE 'ok'
  END AS status,
  lm.moved_at AS last_movement_at
FROM inventory_items ii
LEFT JOIN last_move lm ON lm.inventory_item_id = ii.id
WHERE ii.is_active = true
  AND (
    p_search IS NULL
    OR ii.sku          ILIKE '%' || p_search || '%'
    OR ii.product_name ILIKE '%' || p_search || '%'
  )
ORDER BY
  CASE
    WHEN ii.current_stock = 0                                           THEN 0
    WHEN ii.reorder_point > 0 AND ii.current_stock <= ii.reorder_point THEN 1
    ELSE 2
  END,
  ii.product_name
LIMIT p_limit OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION get_stock_position(text, int, int) TO anon, authenticated;

-- get_stock_movements: full movement log, optionally filtered by item
CREATE OR REPLACE FUNCTION get_stock_movements(
  p_item_id int DEFAULT NULL,
  p_limit   int DEFAULT 200
)
RETURNS TABLE (
  id                  int,
  inventory_item_id   int,
  sku                 text,
  product_name        text,
  movement_type       text,
  quantity            int,
  stock_after         int,
  unit_cost_inr       numeric,
  reference_type      text,
  reference_id        int,
  notes               text,
  moved_at            timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
SELECT
  sm.id,
  sm.inventory_item_id,
  ii.sku,
  ii.product_name,
  sm.movement_type::text,
  sm.quantity,
  sm.stock_after,
  sm.unit_cost_inr,
  sm.reference_type,
  sm.reference_id,
  sm.notes,
  sm.moved_at
FROM stock_movements sm
JOIN inventory_items ii ON ii.id = sm.inventory_item_id
WHERE (p_item_id IS NULL OR sm.inventory_item_id = p_item_id)
ORDER BY sm.moved_at DESC
LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION get_stock_movements(int, int) TO anon, authenticated;

-- get_stock_ageing: items with current stock, ordered by age desc
CREATE OR REPLACE FUNCTION get_stock_ageing()
RETURNS TABLE (
  id              int,
  sku             text,
  product_name    text,
  current_stock   int,
  days_in_stock   int,
  age_bucket      text,
  stock_value_inr numeric,
  last_inflow_at  timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH last_inflow AS (
  SELECT DISTINCT ON (inventory_item_id)
    inventory_item_id,
    moved_at
  FROM stock_movements
  WHERE movement_type IN ('opening','purchase_in','return_in','adjustment_in','transfer_in')
  ORDER BY inventory_item_id, moved_at DESC
)
SELECT
  ii.id,
  ii.sku,
  ii.product_name,
  ii.current_stock,
  (CURRENT_DATE - COALESCE(li.moved_at::date, ii.opened_on))::int  AS days_in_stock,
  CASE
    WHEN (CURRENT_DATE - COALESCE(li.moved_at::date, ii.opened_on)) <=  30 THEN 'fresh'
    WHEN (CURRENT_DATE - COALESCE(li.moved_at::date, ii.opened_on)) <=  60 THEN 'watch'
    WHEN (CURRENT_DATE - COALESCE(li.moved_at::date, ii.opened_on)) <=  90 THEN 'slow'
    ELSE 'dead'
  END AS age_bucket,
  ROUND(ii.current_stock * COALESCE(ii.unit_cost_inr, 0), 2) AS stock_value_inr,
  li.moved_at AS last_inflow_at
FROM inventory_items ii
LEFT JOIN last_inflow li ON li.inventory_item_id = ii.id
WHERE ii.is_active = true
  AND ii.current_stock > 0
ORDER BY days_in_stock DESC;
$$;

GRANT EXECUTE ON FUNCTION get_stock_ageing() TO anon, authenticated;

-- get_reorder_report: SKUs at or below reorder point, or out of stock
CREATE OR REPLACE FUNCTION get_reorder_report()
RETURNS TABLE (
  id                          int,
  sku                         text,
  product_name                text,
  current_stock               int,
  reorder_point               int,
  reorder_qty                 int,
  unit_cost_inr               numeric,
  suggested_order_value_inr   numeric,
  days_since_last_inflow      int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH last_inflow AS (
  SELECT DISTINCT ON (inventory_item_id)
    inventory_item_id,
    moved_at
  FROM stock_movements
  WHERE movement_type IN ('opening','purchase_in','adjustment_in','transfer_in')
  ORDER BY inventory_item_id, moved_at DESC
)
SELECT
  ii.id,
  ii.sku,
  ii.product_name,
  ii.current_stock,
  ii.reorder_point,
  ii.reorder_qty,
  ii.unit_cost_inr,
  ROUND(ii.reorder_qty * COALESCE(ii.unit_cost_inr, 0), 2) AS suggested_order_value_inr,
  (CURRENT_DATE - COALESCE(li.moved_at::date, ii.opened_on))::int AS days_since_last_inflow
FROM inventory_items ii
LEFT JOIN last_inflow li ON li.inventory_item_id = ii.id
WHERE ii.is_active = true
  AND (
    ii.current_stock = 0
    OR (ii.reorder_point > 0 AND ii.current_stock <= ii.reorder_point)
  )
ORDER BY ii.current_stock ASC, ii.product_name;
$$;

GRANT EXECUTE ON FUNCTION get_reorder_report() TO anon, authenticated;
