-- ============================================================
-- BOM IMPLEMENTATION — Steps 2 & 3
-- product_boms + product_bom_lines + order_line_bom_explosions
-- Revenue allocation: SSP-based (not 50/50)
-- NO historical data is written in this migration.
-- Backfill of order_line_bom_explosions requires separate approval.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- STEP 2A: product_boms — one row per bundle product
-- ─────────────────────────────────────────────────────────────
CREATE TABLE product_boms (
  id              serial PRIMARY KEY,
  set_product_id  int NOT NULL REFERENCES products(id),
  name            text NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (set_product_id)
);

ALTER TABLE product_boms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_select" ON product_boms FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_full_access"  ON product_boms FOR ALL   TO service_role  USING (true);

-- ─────────────────────────────────────────────────────────────
-- STEP 2B: product_bom_lines — 2 rows per BOM (bra + leggings)
--   standalone_price_inr: the component's standalone selling
--   price — this is the SSP used for revenue allocation.
--   Size matching is IMPLICIT: set size S → bra size S + leggings size S.
--   Quantity is always 1 for Kirgo 2-piece sets.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE product_bom_lines (
  id                    serial PRIMARY KEY,
  bom_id                int NOT NULL REFERENCES product_boms(id),
  component_type        text NOT NULL CHECK (component_type IN ('bra','leggings')),
  component_product_id  int NOT NULL REFERENCES products(id),
  quantity              int NOT NULL DEFAULT 1,
  standalone_price_inr  numeric(10,2) NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bom_id, component_type)
);

ALTER TABLE product_bom_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_select" ON product_bom_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_full_access"  ON product_bom_lines FOR ALL   TO service_role  USING (true);

-- ─────────────────────────────────────────────────────────────
-- STEP 2C: Seed Classic Set (products.id = 8)
--   Bra  → Classic Sports Bra (id=2)  SSP ₹1,599
--   Legs → Classic Leggings  (id=1)   SSP ₹1,699
--   Sum  = ₹3,298  (matches set selling_price_inr exactly)
-- ─────────────────────────────────────────────────────────────
INSERT INTO product_boms (set_product_id, name, notes)
VALUES (8, 'Classic Set BOM',
        'Classic Sports Bra (id=2) + Classic Leggings (id=1). Size implicit from order_line.');

INSERT INTO product_bom_lines (bom_id, component_type, component_product_id, quantity, standalone_price_inr)
SELECT b.id, 'bra',      2, 1, 1599.00 FROM product_boms b WHERE b.set_product_id = 8
UNION ALL
SELECT b.id, 'leggings', 1, 1, 1699.00 FROM product_boms b WHERE b.set_product_id = 8;

-- ─────────────────────────────────────────────────────────────
-- Seed Summer Set (products.id = 9)
--   Bra  → Summer Sports Bra (id=4)  SSP ₹1,499
--   Legs → Summer Leggings   (id=3)  SSP ₹1,799
--   Sum  = ₹3,298
-- ─────────────────────────────────────────────────────────────
INSERT INTO product_boms (set_product_id, name, notes)
VALUES (9, 'Summer Set BOM',
        'Summer Sports Bra (id=4) + Summer Leggings (id=3). Size implicit from order_line.');

INSERT INTO product_bom_lines (bom_id, component_type, component_product_id, quantity, standalone_price_inr)
SELECT b.id, 'bra',      4, 1, 1499.00 FROM product_boms b WHERE b.set_product_id = 9
UNION ALL
SELECT b.id, 'leggings', 3, 1, 1799.00 FROM product_boms b WHERE b.set_product_id = 9;

-- ─────────────────────────────────────────────────────────────
-- Seed Core Set (products.id = 10)
--   Bra  → Core Sports Bra (id=7)  SSP ₹1,799
--   Legs → Core Leggings   (id=6)  SSP ₹1,999
--   Sum  = ₹3,798
-- ─────────────────────────────────────────────────────────────
INSERT INTO product_boms (set_product_id, name, notes)
VALUES (10, 'Core Set BOM',
        'Core Sports Bra (id=7) + Core Leggings (id=6). Size implicit from order_line.');

INSERT INTO product_bom_lines (bom_id, component_type, component_product_id, quantity, standalone_price_inr)
SELECT b.id, 'bra',      7, 1, 1799.00 FROM product_boms b WHERE b.set_product_id = 10
UNION ALL
SELECT b.id, 'leggings', 6, 1, 1999.00 FROM product_boms b WHERE b.set_product_id = 10;

-- ─────────────────────────────────────────────────────────────
-- STEP 3A: order_line_bom_explosions — schema only, no data yet.
--   Populated via backfill RPC after approval (Step 5).
--   NOT a trigger table — populated explicitly to allow review
--   before going live.
--
--   IMPORTANT: product identification uses sku_raw / product_name_raw,
--   NOT variant_id. variant_id is non-unique across product lines
--   (Summer and Core share variant_ids 9-16, 19-21; Classic Bra and
--   Classic Set share variant_ids 5-7). This is a confirmed data
--   quality issue in the source WooCommerce data.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE order_line_bom_explosions (
  id                    bigserial PRIMARY KEY,
  order_line_id         bigint  NOT NULL REFERENCES order_lines(id),
  order_id              int     NOT NULL,
  set_product_id        int     NOT NULL REFERENCES products(id),
  component_type        text    NOT NULL CHECK (component_type IN ('bra','leggings')),
  component_product_id  int     NOT NULL REFERENCES products(id),
  size                  text,
  quantity              int     NOT NULL,
  set_sku_raw           text,
  set_name_raw          text,
  allocated_revenue_inr numeric(12,2) NOT NULL,
  allocated_cogs_inr    numeric(12,2) NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_line_id, component_type)
);

ALTER TABLE order_line_bom_explosions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_select" ON order_line_bom_explosions FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_full_access"  ON order_line_bom_explosions FOR ALL   TO service_role  USING (true);

CREATE INDEX idx_bom_exp_order_id         ON order_line_bom_explosions (order_id);
CREATE INDEX idx_bom_exp_component_product ON order_line_bom_explosions (component_product_id);
CREATE INDEX idx_bom_exp_set_product       ON order_line_bom_explosions (set_product_id);

-- ─────────────────────────────────────────────────────────────
-- STEP 3B: get_bom_explosion_preview()
--   READ-ONLY simulation of the BOM explosion.
--   Revenue allocation formula:
--     bra_revenue  = line_total_inr × (bra_ssp  / (bra_ssp + leg_ssp))
--     leg_revenue  = line_total_inr − bra_revenue   ← residual ensures sum = line_total_inr
--   COGS: component_product.cogs_total_inr × quantity
--   NO data is written by this function.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_bom_explosion_preview()
RETURNS TABLE (
  order_line_id         bigint,
  order_id              int,
  set_sku_raw           text,
  set_name_raw          text,
  size                  text,
  quantity              int,
  set_line_total_inr    numeric,
  component_type        text,
  component_product_id  int,
  component_name        text,
  component_ssp_inr     numeric,
  total_ssp_inr         numeric,
  allocated_revenue_inr numeric,
  allocated_cogs_inr    numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
  WITH set_lines AS (
    SELECT
      ol.id::bigint  AS order_line_id,
      ol.order_id,
      ol.sku_raw     AS set_sku_raw,
      ol.product_name_raw AS set_name_raw,
      ol.quantity,
      ol.line_total_inr,
      CASE
        WHEN ol.product_name_raw ILIKE 'Summer%' THEN 9
        WHEN ol.product_name_raw ILIKE 'Core%'   THEN 10
        ELSE                                        8
      END AS set_product_id,
      CASE
        WHEN ol.product_name_raw ILIKE '%Extra Small%' THEN 'XS'
        WHEN ol.product_name_raw ILIKE '%Extra Large%' THEN 'XL'
        WHEN ol.product_name_raw ILIKE '%Small%'        THEN 'S'
        WHEN ol.product_name_raw ILIKE '%Medium%'       THEN 'M'
        WHEN ol.product_name_raw ILIKE '%Large%'        THEN 'L'
        ELSE NULL
      END AS sz
    FROM order_lines ol
    WHERE ol.product_name_raw ILIKE '%Bra%Legging%'
      AND ol.unit_price_inr >= 100
  ),
  bom_expanded AS (
    SELECT
      sl.*,
      pb.id                           AS bom_id,
      pbl.component_type,
      pbl.component_product_id,
      p_comp.name                     AS component_name,
      pbl.standalone_price_inr        AS component_ssp,
      -- Partition by (order_line_id, pb.id): total_ssp = 2 rows per line (bra+legs SSPs)
      -- NOT just pb.id — that would sum SSP across all order_lines for the BOM
      SUM(pbl.standalone_price_inr) OVER (PARTITION BY sl.order_line_id, pb.id) AS total_ssp,
      p_comp.cogs_total_inr           AS component_cogs_per_unit,
      ROW_NUMBER() OVER (
        PARTITION BY sl.order_line_id, pb.id
        ORDER BY pbl.component_type   -- 'bra' < 'leggings' alphabetically
      ) AS component_rank,
      COUNT(*) OVER (PARTITION BY sl.order_line_id, pb.id) AS component_count
    FROM set_lines sl
    JOIN product_boms pb ON pb.set_product_id = sl.set_product_id
    JOIN product_bom_lines pbl ON pbl.bom_id = pb.id
    JOIN products p_comp ON p_comp.id = pbl.component_product_id
  ),
  allocated AS (
    SELECT
      order_line_id,
      order_id,
      set_sku_raw,
      set_name_raw,
      sz,
      quantity,
      line_total_inr,
      component_type,
      component_product_id,
      component_name,
      component_ssp,
      total_ssp,
      component_cogs_per_unit,
      component_rank,
      component_count,
      CASE
        -- Last component gets the residual to ensure sum = line_total_inr exactly
        WHEN component_rank = component_count
          THEN line_total_inr
               - SUM(ROUND(line_total_inr * component_ssp / total_ssp, 2))
                   FILTER (WHERE component_rank < component_count)
                   OVER (PARTITION BY order_line_id)
        ELSE ROUND(line_total_inr * component_ssp / total_ssp, 2)
      END AS allocated_revenue_inr
    FROM bom_expanded
  )
  SELECT
    order_line_id,
    order_id,
    set_sku_raw,
    set_name_raw,
    sz                                              AS size,
    quantity,
    line_total_inr                                  AS set_line_total_inr,
    component_type,
    component_product_id,
    component_name,
    component_ssp                                   AS component_ssp_inr,
    total_ssp                                       AS total_ssp_inr,
    allocated_revenue_inr,
    ROUND(component_cogs_per_unit * quantity, 2)    AS allocated_cogs_inr
  FROM allocated
  ORDER BY order_line_id, component_type;
$$;

GRANT EXECUTE ON FUNCTION get_bom_explosion_preview() TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- STEP 3C: Verification helper — confirm BOM seed integrity
--   Checks: SSP sum = set selling_price_inr for all 3 Sets
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_mismatch int;
BEGIN
  SELECT COUNT(*) INTO v_mismatch
  FROM product_boms pb
  JOIN products p_set ON p_set.id = pb.set_product_id
  WHERE (
    SELECT SUM(pbl.standalone_price_inr)
    FROM product_bom_lines pbl
    WHERE pbl.bom_id = pb.id
  ) != p_set.selling_price_inr;

  IF v_mismatch > 0 THEN
    RAISE EXCEPTION 'BOM SEED ERROR: % Set(s) have BOM SSP sum ≠ set selling_price_inr', v_mismatch;
  ELSE
    RAISE NOTICE 'BOM seed integrity OK: all Set SSP sums match selling_price_inr';
  END IF;
END $$;
