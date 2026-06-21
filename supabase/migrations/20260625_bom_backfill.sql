-- ============================================================
-- BOM BACKFILL — Step 5
-- Populates order_line_bom_explosions from get_bom_explosion_preview()
--
-- REQUIRES EXPLICIT APPROVAL before execution.
-- This is the only migration that writes to historical-derived data.
-- Schema was created (empty) in 20260624_bom_tables.sql.
--
-- Safe to run multiple times: INSERT ... ON CONFLICT DO NOTHING
-- Unique constraint: (order_line_id, component_type)
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- PRE-FLIGHT CHECK: confirm preview function returns expected rows
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_preview_rows int;
  v_residual     numeric;
  v_balanced     boolean;
BEGIN
  SELECT
    COUNT(*),
    SUM(allocated_revenue_inr) - SUM(set_line_total_inr) / 2,
    BOOL_AND(ABS(line_check) < 0.01)
  INTO v_preview_rows, v_residual, v_balanced
  FROM (
    SELECT
      set_line_total_inr,
      allocated_revenue_inr,
      SUM(allocated_revenue_inr) OVER (PARTITION BY order_line_id)
        - set_line_total_inr AS line_check
    FROM get_bom_explosion_preview()
  ) t;

  IF v_preview_rows = 0 THEN
    RAISE EXCEPTION 'BOM BACKFILL ABORTED: get_bom_explosion_preview() returned 0 rows';
  END IF;

  IF NOT v_balanced THEN
    RAISE EXCEPTION 'BOM BACKFILL ABORTED: allocation integrity check failed (residual = %)', v_residual;
  END IF;

  RAISE NOTICE 'Pre-flight OK: % rows, residual = %, all_lines_balance = %',
    v_preview_rows, v_residual, v_balanced;
END $$;

-- ─────────────────────────────────────────────────────────────
-- BACKFILL: insert BOM explosion rows
-- ON CONFLICT DO NOTHING makes this idempotent (safe to re-run)
-- ─────────────────────────────────────────────────────────────
INSERT INTO order_line_bom_explosions (
  order_line_id,
  order_id,
  set_product_id,
  component_type,
  component_product_id,
  size,
  quantity,
  set_sku_raw,
  set_name_raw,
  allocated_revenue_inr,
  allocated_cogs_inr
)
SELECT
  p.order_line_id,
  p.order_id,
  CASE
    WHEN p.set_name_raw ILIKE 'Summer%' THEN 9
    WHEN p.set_name_raw ILIKE 'Core%'   THEN 10
    ELSE                                      8
  END                      AS set_product_id,
  p.component_type,
  p.component_product_id,
  p.size,
  p.quantity,
  p.set_sku_raw,
  p.set_name_raw,
  p.allocated_revenue_inr,
  p.allocated_cogs_inr
FROM get_bom_explosion_preview() p
ON CONFLICT (order_line_id, component_type) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- POST-BACKFILL VALIDATION
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_inserted          int;
  v_rev_match         boolean;
  v_cogs_match        boolean;
  v_rev_allocated     numeric;
  v_rev_preview       numeric;
  v_cogs_allocated    numeric;
  v_cogs_preview      numeric;
BEGIN
  -- Row count
  SELECT COUNT(*) INTO v_inserted FROM order_line_bom_explosions;

  -- Revenue reconciliation
  SELECT SUM(allocated_revenue_inr) INTO v_rev_allocated  FROM order_line_bom_explosions;
  SELECT SUM(allocated_revenue_inr) INTO v_rev_preview    FROM get_bom_explosion_preview();
  v_rev_match := ABS(v_rev_allocated - v_rev_preview) < 1;

  -- COGS reconciliation
  SELECT SUM(allocated_cogs_inr) INTO v_cogs_allocated FROM order_line_bom_explosions;
  SELECT SUM(allocated_cogs_inr) INTO v_cogs_preview   FROM get_bom_explosion_preview();
  v_cogs_match := ABS(v_cogs_allocated - v_cogs_preview) < 1;

  IF NOT v_rev_match THEN
    RAISE EXCEPTION 'Revenue mismatch: table=% preview=%', v_rev_allocated, v_rev_preview;
  END IF;

  IF NOT v_cogs_match THEN
    RAISE EXCEPTION 'COGS mismatch: table=% preview=%', v_cogs_allocated, v_cogs_preview;
  END IF;

  RAISE NOTICE 'Backfill complete: % rows, revenue ₹% (match=%), cogs ₹% (match=%)',
    v_inserted,
    ROUND(v_rev_allocated, 2), v_rev_match,
    ROUND(v_cogs_allocated, 2), v_cogs_match;
END $$;
