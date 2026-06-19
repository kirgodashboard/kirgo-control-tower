-- =============================================================================
-- MIGRATION: product_costs table
-- Phase 2 / Priority 1 — Profitability Engine
-- =============================================================================

CREATE TABLE product_costs (
  id               serial        NOT NULL,
  variant_id       int           NOT NULL,
  factory_cost_inr numeric(10,2) NOT NULL,
  freight_cost_inr numeric(10,2) NOT NULL DEFAULT 0,
  duty_cost_inr    numeric(10,2) NOT NULL DEFAULT 0,
  landed_cost_inr  numeric(10,2) NOT NULL GENERATED ALWAYS AS (
                     factory_cost_inr + freight_cost_inr + duty_cost_inr
                   ) STORED,
  notes            text,
  effective_from   date          NOT NULL,
  created_at       timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT product_costs_pkey        PRIMARY KEY (id),
  CONSTRAINT product_costs_variant_fk  FOREIGN KEY (variant_id) REFERENCES product_variants (id),
  CONSTRAINT product_costs_unique      UNIQUE (variant_id, effective_from),
  CONSTRAINT product_costs_factory_pos CHECK (factory_cost_inr >= 0),
  CONSTRAINT product_costs_freight_pos CHECK (freight_cost_inr >= 0),
  CONSTRAINT product_costs_duty_pos    CHECK (duty_cost_inr    >= 0)
);

COMMENT ON TABLE  product_costs                 IS 'Variant-level landed cost with time dimension. '
                                                   'freight_cost_inr holds freight+duty combined per user spec. '
                                                   'landed_cost_inr GENERATED = factory + freight + duty.';
COMMENT ON COLUMN product_costs.effective_from  IS 'Latest row with effective_from <= delivery date is the active cost.';
COMMENT ON COLUMN product_costs.landed_cost_inr IS 'GENERATED: factory + freight + duty. Excludes outbound shipping (shipments.freight_total_inr).';

-- RLS
ALTER TABLE product_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_costs_select" ON product_costs
  FOR SELECT USING (public.current_app_role() IN ('admin','analyst','viewer'));
CREATE POLICY "product_costs_write"  ON product_costs
  FOR ALL    USING (public.current_app_role() = 'admin')
  WITH CHECK (public.current_app_role() = 'admin');

-- Seed: one row per variant using parent product costs, effective from launch date
-- freight_cost_inr = cogs_shoot_import_inr (freight+duty treated as combined per user spec)
-- duty_cost_inr = 0 (included in freight_cost_inr)
INSERT INTO product_costs (variant_id, factory_cost_inr, freight_cost_inr, duty_cost_inr, effective_from, notes)
SELECT
  pv.id,
  p.cogs_manufacture_inr,
  p.cogs_shoot_import_inr,
  0,
  COALESCE(l.launched_at, '2023-10-01'::date),
  'Seeded from products.cogs_* — freight+duty combined in freight_cost_inr'
FROM product_variants pv
JOIN products p ON p.id = pv.product_id
JOIN launches  l ON l.id = p.launch_id;
