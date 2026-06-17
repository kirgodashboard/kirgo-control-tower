-- =============================================================================
-- KIRGO CONTROL TOWER — DATABASE SCHEMA
-- Version: v2.0  |  Date: 2026-06-17
-- Source: DATABASE_SCHEMA.md v2 · DATA_DICTIONARY.md v2.1 · BUSINESS_RULES.md v2.0
--
-- Database : PostgreSQL 15 via Supabase
-- Convention: snake_case · monetary values in INR (numeric, no paise) · UTC timestamps
--
-- Table creation order follows the FK dependency graph:
--   roles → users
--   expense_categories → (launch_expenses, expenses)
--   launches → (products, inventory_batches, purchase_orders, launch_expenses,
--               expenses, kpi_monthly_snapshot, revenue_forecasts, insights)
--   products → (products self-ref bundles, product_variants)
--   product_variants → (inventory_batches, inventory_ledger, order_lines,
--                       shipments, purchase_order_lines, inventory_forecasts, insights)
--   gateway_settlements ←→ bank_transactions  (circular — resolved with ALTER TABLE)
--   purchase_orders → (purchase_order_lines, inventory_batches, bank_transactions)
--   customers → orders → order_lines
--   shipments → returns
--   ad_campaigns → (ad_spend_daily, expenses, insights)
--   users → (expenses, revenue_forecasts, cashflow_forecasts, insights)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- EXTENSIONS
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";   -- uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";     -- trigram indexes for SKU / narration text search

-- =============================================================================
-- DOMAIN 5: ACCESS CONTROL
-- Created first — users is referenced by expenses, forecasts, and insights.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- roles
-- ---------------------------------------------------------------------------
CREATE TABLE roles (
  id                    serial        NOT NULL,
  code                  text          NOT NULL,
  name                  text          NOT NULL,
  description           text,
  can_view_financials   boolean       NOT NULL DEFAULT false,
  can_view_customers    boolean       NOT NULL DEFAULT false,
  can_edit_forecasts    boolean       NOT NULL DEFAULT false,
  can_manage_expenses   boolean       NOT NULL DEFAULT false,
  can_dismiss_insights  boolean       NOT NULL DEFAULT false,
  can_manage_users      boolean       NOT NULL DEFAULT false,
  created_at            timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT roles_pkey     PRIMARY KEY (id),
  CONSTRAINT roles_code_key UNIQUE      (code)
);

COMMENT ON TABLE  roles                        IS 'Permission sets for Control Tower users. Three seeded roles: admin, analyst, viewer.';
COMMENT ON COLUMN roles.code                   IS 'Machine-readable slug: admin | analyst | viewer.';
COMMENT ON COLUMN roles.can_view_financials    IS 'Access to bank_transactions, cashflow, expenses. Per BR-129.';
COMMENT ON COLUMN roles.can_view_customers     IS 'Access to customer PII (email, phone, address). Per BR-128.';
COMMENT ON COLUMN roles.can_manage_users       IS 'Create, deactivate, and re-assign roles. Admin only.';

INSERT INTO roles
  (code,      name,            description,                                              can_view_financials, can_view_customers, can_edit_forecasts, can_manage_expenses, can_dismiss_insights, can_manage_users)
VALUES
  ('admin',   'Administrator', 'Full access to all modules and data',                    true,                true,               true,               true,                true,                 true),
  ('analyst', 'Analyst',       'Operational access: forecasts, expenses, imports',        true,                true,               true,               true,                true,                 false),
  ('viewer',  'Viewer',        'Read-only access to dashboard KPIs (non-financial)',      false,               false,              false,              false,               false,                false);

-- ---------------------------------------------------------------------------
-- users  (extends Supabase auth.users)
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id              serial        NOT NULL,
  auth_user_id    uuid          NOT NULL,
  role_id         int           NOT NULL,
  full_name       text,
  email           text          NOT NULL,
  avatar_url      text,
  is_active       boolean       NOT NULL DEFAULT true,
  last_login_at   timestamptz,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT users_pkey             PRIMARY KEY (id),
  CONSTRAINT users_auth_user_id_key UNIQUE      (auth_user_id),
  CONSTRAINT users_email_key        UNIQUE      (email),
  CONSTRAINT users_role_id_fk       FOREIGN KEY (role_id)       REFERENCES roles (id),
  CONSTRAINT users_auth_fk          FOREIGN KEY (auth_user_id)  REFERENCES auth.users (id) ON DELETE CASCADE
);

COMMENT ON TABLE  users              IS 'Application user profiles. Extends Supabase auth.users. '
                                        'Integer id is used for all internal FK references; '
                                        'auth_user_id links to the Supabase auth subsystem.';
COMMENT ON COLUMN users.auth_user_id IS 'UUID from auth.users. Join key back to Supabase auth.';
COMMENT ON COLUMN users.id           IS 'Surrogate integer key used in all FK references within the schema.';
COMMENT ON COLUMN users.is_active    IS 'Soft deactivation. Set false instead of deleting; deactivated users lose all RLS access.';

-- =============================================================================
-- HELPER FUNCTION
-- Created after roles + users so PostgreSQL can validate the function body.
-- SECURITY DEFINER runs as the function owner, bypassing RLS on users/roles.
-- Returns NULL for unauthenticated sessions and deactivated accounts.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.code
  FROM public.users u
  JOIN public.roles r ON r.id = u.role_id
  WHERE u.auth_user_id = auth.uid()
    AND u.is_active = true
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.current_app_role() IS
  'Returns admin | analyst | viewer for the current Supabase auth session. '
  'NULL = unauthenticated or deactivated account. '
  'Used by all RLS USING / WITH CHECK expressions.';

-- =============================================================================
-- DOMAIN 6: OPERATIONAL EXPENSES
-- expense_categories is also referenced by launch_expenses (Domain 3).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- expense_categories
-- ---------------------------------------------------------------------------
CREATE TABLE expense_categories (
  id              serial      NOT NULL,
  code            text        NOT NULL,
  name            text        NOT NULL,
  category_group  text        NOT NULL,
  applies_to      text        NOT NULL,
  description     text,
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT expense_categories_pkey       PRIMARY KEY (id),
  CONSTRAINT expense_categories_code_key   UNIQUE      (code),
  CONSTRAINT expense_categories_group_chk  CHECK (category_group IN ('cogs','capex','opex','marketing','financing')),
  CONSTRAINT expense_categories_scope_chk  CHECK (applies_to     IN ('launch','operations','both'))
);

COMMENT ON TABLE  expense_categories                IS 'Controlled vocabulary for P&L cost classification. '
                                                       '15 seeded categories — do not insert free-text values. '
                                                       'Used by launch_expenses (CAPEX) and expenses (OPEX). Per BR-057.';
COMMENT ON COLUMN expense_categories.category_group IS 'P&L grouping: cogs | capex | opex | marketing | financing.';
COMMENT ON COLUMN expense_categories.applies_to     IS 'launch = pre-launch CAPEX only | operations = recurring OPEX | both.';

INSERT INTO expense_categories (code, name, category_group, applies_to, description)
VALUES
  ('manufacturing',     'Manufacturing',            'capex',     'launch',      'Supplier production cost for a collection batch'),
  ('sample',            'Sampling',                 'capex',     'launch',      'Pre-production sample and prototype costs'),
  ('shoot',             'Shoot & Creative',         'capex',     'launch',      'Photoshoot, model fees, post-processing'),
  ('packaging',         'Packaging',                'capex',     'both',        'Poly bags, tags, boxes, branding materials'),
  ('website',           'Website & Tech',           'capex',     'launch',      'Launch-specific website setup or update costs'),
  ('logistics_inbound', 'Inbound Logistics',        'capex',     'launch',      'Import freight, customs duty, port handling'),
  ('legal',             'Legal & Compliance',       'capex',     'launch',      'Trademark, legal review, compliance costs'),
  ('founder_credit',    'Founder Capital',          'financing', 'launch',      'Capital injection from founder — not an operating expense'),
  ('shipping_outbound', 'Outbound Shipping',        'cogs',      'operations',  'Shiprocket / courier cost for delivered orders'),
  ('shipping_inbound',  'Inbound Returns Shipping', 'cogs',      'operations',  'Reverse logistics cost for customer returns'),
  ('ad_spend',          'Advertising',              'marketing', 'both',        'Google Ads, Meta Ads, influencer fees'),
  ('platform_saas',     'Platform & SaaS',          'opex',      'operations',  'Google Workspace, WooCommerce hosting, Shiprocket subscription'),
  ('customer_refund',   'Customer Refunds',         'opex',      'operations',  'Cash refunds paid to customers'),
  ('bank_charges',      'Bank & FX Charges',        'opex',      'operations',  'HDFC fees, NEFT charges, PayPal FX conversion spread'),
  ('misc',              'Miscellaneous',            'opex',      'both',        'Packaging tape, office supplies, ad-hoc costs');

-- =============================================================================
-- DOMAIN 1: PRODUCT
-- =============================================================================

-- ---------------------------------------------------------------------------
-- launches
-- ---------------------------------------------------------------------------
CREATE TABLE launches (
  id                    serial        NOT NULL,
  code                  text          NOT NULL,
  name                  text          NOT NULL,
  launched_at           date,
  planned_launch_at     date,
  status                text          NOT NULL DEFAULT 'planned',
  total_investment_inr  numeric(12,2),
  notes                 text,
  created_at            timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT launches_pkey       PRIMARY KEY (id),
  CONSTRAINT launches_code_key   UNIQUE      (code),
  CONSTRAINT launches_status_chk CHECK (status IN ('planned','active','depleted'))
);

COMMENT ON TABLE  launches                     IS 'One row per product collection. '
                                                  'Kirgo uses a launch-batch model: one production run per collection sold until depleted. '
                                                  'L1=Classic, L2=Summer+Restock, L3=Core, L4=Core Flare (planned).';
COMMENT ON COLUMN launches.code                IS 'Canonical collection code: L1 | L2 | L3 | L4.';
COMMENT ON COLUMN launches.total_investment_inr IS 'Derived sum of launch_expenses.amount_inr. Updated after each expense entry. '
                                                   'Totals: L1 ₹6,43,500 · L2 ₹10,37,760 · L3 ₹5,05,000.';
COMMENT ON COLUMN launches.status              IS 'planned: pre-launch | active: currently selling | depleted: sold out.';

INSERT INTO launches (code, name, launched_at, status, total_investment_inr)
VALUES
  ('L1', 'Classic',                  '2023-10-01', 'active',  643500.00),
  ('L2', 'Summer + Classic Restock', '2024-05-01', 'active',  1037760.00),
  ('L3', 'Core',                     '2026-01-01', 'active',  505000.00),
  ('L4', 'Core Flare',               NULL,         'planned', NULL);

-- ---------------------------------------------------------------------------
-- products
-- GENERATED columns: cogs_total_inr, gross_margin_inr, gross_margin_pct
-- Self-referencing FKs for bundle composition (bundle_leggings_id, bundle_bra_id).
-- ---------------------------------------------------------------------------
CREATE TABLE products (
  id                    serial        NOT NULL,
  launch_id             int           NOT NULL,
  name                  text          NOT NULL,
  product_type          text          NOT NULL,
  is_bundle             boolean       NOT NULL DEFAULT false,
  bundle_leggings_id    int,
  bundle_bra_id         int,
  selling_price_inr     numeric(10,2) NOT NULL,
  cogs_manufacture_inr  numeric(10,2) NOT NULL,
  cogs_shoot_import_inr numeric(10,2) NOT NULL,
  cogs_shipping_pkg_inr numeric(10,2) NOT NULL,
  -- GENERATED ALWAYS: never write to these columns directly.
  cogs_total_inr        numeric(10,2) NOT NULL GENERATED ALWAYS AS (
                            cogs_manufacture_inr
                          + cogs_shoot_import_inr
                          + cogs_shipping_pkg_inr
                        ) STORED,
  gross_margin_inr      numeric(10,2) NOT NULL GENERATED ALWAYS AS (
                            selling_price_inr
                          - (cogs_manufacture_inr + cogs_shoot_import_inr + cogs_shipping_pkg_inr)
                        ) STORED,
  gross_margin_pct      numeric(5,2)  NOT NULL GENERATED ALWAYS AS (
                            ROUND(
                              (selling_price_inr
                               - (cogs_manufacture_inr + cogs_shoot_import_inr + cogs_shipping_pkg_inr))
                              / NULLIF(selling_price_inr, 0) * 100,
                            2)
                        ) STORED,
  is_active             boolean       NOT NULL DEFAULT true,
  created_at            timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT products_pkey               PRIMARY KEY (id),
  CONSTRAINT products_launch_id_fk       FOREIGN KEY (launch_id)          REFERENCES launches  (id),
  CONSTRAINT products_bundle_legs_fk     FOREIGN KEY (bundle_leggings_id) REFERENCES products  (id),
  CONSTRAINT products_bundle_bra_fk      FOREIGN KEY (bundle_bra_id)      REFERENCES products  (id),
  CONSTRAINT products_type_chk           CHECK (product_type IN ('leggings','sports_bra','set')),
  CONSTRAINT products_price_positive     CHECK (selling_price_inr > 0),
  CONSTRAINT products_cogs_positive      CHECK (
                                           cogs_manufacture_inr  >= 0
                                       AND cogs_shoot_import_inr >= 0
                                       AND cogs_shipping_pkg_inr >= 0
                                         ),
  CONSTRAINT products_bundle_completeness CHECK (
    (is_bundle = false)
    OR (is_bundle = true AND bundle_leggings_id IS NOT NULL AND bundle_bra_id IS NOT NULL)
  )
);

COMMENT ON TABLE  products                    IS 'One row per product (not per variant/size). '
                                                 'COGS components are stored separately; '
                                                 'cogs_total_inr, gross_margin_inr, gross_margin_pct are GENERATED ALWAYS STORED — '
                                                 'never INSERT or UPDATE these columns. Per BR-037, BR-044, BR-048.';
COMMENT ON COLUMN products.cogs_total_inr     IS 'GENERATED: cogs_manufacture + cogs_shoot_import + cogs_shipping_pkg. Per BR-037.';
COMMENT ON COLUMN products.gross_margin_inr   IS 'GENERATED: selling_price − cogs_total. Per BR-044.';
COMMENT ON COLUMN products.gross_margin_pct   IS 'GENERATED: gross_margin_inr / selling_price × 100. Per BR-048.';
COMMENT ON COLUMN products.is_bundle          IS 'True for Set products (leggings + bra). Triggers dual inventory deduction on sale. Per BR-027.';
COMMENT ON COLUMN products.bundle_leggings_id IS 'Self-FK to component leggings product. Required when is_bundle=true.';
COMMENT ON COLUMN products.bundle_bra_id      IS 'Self-FK to component sports bra product. Required when is_bundle=true.';

-- Seeded product data (selling prices and COGS from DATA_DICTIONARY.md)
INSERT INTO products
  (launch_id, name, product_type, is_bundle, selling_price_inr, cogs_manufacture_inr, cogs_shoot_import_inr, cogs_shipping_pkg_inr)
SELECT l.id, p.name, p.product_type, p.is_bundle, p.sp, p.mfg, p.shoot, p.pkg
FROM (
  VALUES
    ('L1', 'Classic Leggings',   'leggings',   false, 1699.00,  960.00, 137.00, 70.00),
    ('L1', 'Classic Sports Bra', 'sports_bra', false, 1599.00,  960.00, 137.00, 70.00),
    ('L2', 'Summer Leggings',    'leggings',   false, 1799.00,  670.00,  97.00, 80.00),
    ('L2', 'Summer Sports Bra',  'sports_bra', false, 1499.00,  670.00,  97.00, 80.00),
    ('L2', 'Classic Leggings 2', 'leggings',   false, 1699.00,  670.00,  97.00, 80.00),
    ('L3', 'Core Leggings',      'leggings',   false, 1999.00,  960.00, 109.00, 70.00),
    ('L3', 'Core Sports Bra',    'sports_bra', false, 1799.00,  960.00, 109.00, 70.00)
) AS p (launch_code, name, product_type, is_bundle, sp, mfg, shoot, pkg)
JOIN launches l ON l.code = p.launch_code;

-- Bundle products inserted separately (bundle_leggings_id and bundle_bra_id reference the rows above)
-- Classic Set: L1 Leggings COGS(1167) + L1 Bra COGS(1167) + 75 pkg − duplicate pkg = 2259
-- Summer Set:  L2 Leggings COGS(847)  + L2 Bra COGS(847)  + 75 pkg − duplicate pkg = 1619
-- Core Set:    L3 Leggings COGS(1139) + L3 Bra COGS(1139) + 75 pkg − duplicate pkg = 2203
-- NOTE: bundle_leggings_id / bundle_bra_id are set by a post-insert UPDATE once all product IDs are known.
INSERT INTO products
  (launch_id, name, product_type, is_bundle, selling_price_inr, cogs_manufacture_inr, cogs_shoot_import_inr, cogs_shipping_pkg_inr)
SELECT l.id, p.name, 'set', true, p.sp, p.mfg, p.shoot, p.pkg
FROM (
  VALUES
    ('L1', 'Classic Set', 3298.00, 1920.00, 274.00, 65.00),
    ('L2', 'Summer Set',  3298.00, 1340.00, 194.00, 85.00),
    ('L3', 'Core Set',    3798.00, 1920.00, 218.00, 65.00)
) AS p (launch_code, name, sp, mfg, shoot, pkg)
JOIN launches l ON l.code = p.launch_code;

-- ---------------------------------------------------------------------------
-- product_variants
-- ---------------------------------------------------------------------------
CREATE TABLE product_variants (
  id                      serial      NOT NULL,
  product_id              int         NOT NULL,
  sku                     text        NOT NULL,
  size                    text,
  colour                  text,
  woocommerce_product_id  int,
  shiprocket_channel_sku  text,
  is_active               boolean     NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT product_variants_pkey       PRIMARY KEY (id),
  CONSTRAINT product_variants_sku_key    UNIQUE      (sku),
  CONSTRAINT product_variants_product_fk FOREIGN KEY (product_id) REFERENCES products (id),
  CONSTRAINT product_variants_size_chk   CHECK (size IN ('XS','S','M','L','XL') OR size IS NULL)
);

COMMENT ON TABLE  product_variants                     IS 'One row per SKU (product × size × colour). '
                                                          'sku is the canonical internal identifier; '
                                                          'shiprocket_channel_sku holds the raw value from Shiprocket exports.';
COMMENT ON COLUMN product_variants.sku                 IS 'Canonical SKU format: {launch}-{product_abbr}-{size}-{colour}. E.g., L3-CL-M-BK.';
COMMENT ON COLUMN product_variants.shiprocket_channel_sku IS 'Raw SKU as exported from Shiprocket. Used for import lookup mapping.';
COMMENT ON COLUMN product_variants.woocommerce_product_id IS 'WooCommerce variation ID. Used during import to resolve order_lines.variant_id.';

-- ---------------------------------------------------------------------------
-- inventory_batches
-- ---------------------------------------------------------------------------
CREATE TABLE inventory_batches (
  id                  serial      NOT NULL,
  launch_id           int,
  variant_id          int         NOT NULL,
  opening_quantity    int         NOT NULL,
  received_at         date,
  purchase_order_id   int,        -- FK added after purchase_orders is created
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT inventory_batches_pkey        PRIMARY KEY (id),
  CONSTRAINT inventory_batches_launch_fk   FOREIGN KEY (launch_id)  REFERENCES launches         (id),
  CONSTRAINT inventory_batches_variant_fk  FOREIGN KEY (variant_id) REFERENCES product_variants (id),
  CONSTRAINT inventory_batches_qty_pos     CHECK (opening_quantity > 0)
);

COMMENT ON TABLE  inventory_batches                  IS 'Opening stock for each production batch. '
                                                        'Anchors the inventory_ledger running balance. '
                                                        'Source: ProductionSKU sheet in Kirgo Numbers.xlsx. Per BR-025.';
COMMENT ON COLUMN inventory_batches.opening_quantity IS 'Units received from supplier. Immutable after initial seeding. Per BR-025.';

-- ---------------------------------------------------------------------------
-- inventory_ledger  (append-only; never UPDATE or DELETE rows)
-- ---------------------------------------------------------------------------
CREATE TABLE inventory_ledger (
  id              serial        NOT NULL,
  variant_id      int           NOT NULL,
  batch_id        int,
  movement_type   text          NOT NULL,
  quantity_delta  int           NOT NULL,
  reference_type  text,
  reference_id    int,
  occurred_at     timestamptz   NOT NULL,
  notes           text,

  CONSTRAINT inventory_ledger_pkey          PRIMARY KEY (id),
  CONSTRAINT inventory_ledger_variant_fk    FOREIGN KEY (variant_id) REFERENCES product_variants  (id),
  CONSTRAINT inventory_ledger_batch_fk      FOREIGN KEY (batch_id)   REFERENCES inventory_batches (id),
  CONSTRAINT inventory_ledger_movement_chk  CHECK (movement_type IN ('opening','sale','return','rto','adjustment','write_off','restock')),
  CONSTRAINT inventory_ledger_delta_nonzero CHECK (quantity_delta <> 0),
  CONSTRAINT inventory_ledger_reftype_chk   CHECK (reference_type IN ('shipment','return_shipment','manual') OR reference_type IS NULL)
);

COMMENT ON TABLE  inventory_ledger               IS 'Append-only stock movement log. '
                                                    'NEVER UPDATE or DELETE rows. '
                                                    'Stock on hand = SUM(quantity_delta) WHERE variant_id = ?. Per BR-026.';
COMMENT ON COLUMN inventory_ledger.movement_type IS 'opening | sale | return | rto | adjustment | write_off | restock. Per BR-026.';
COMMENT ON COLUMN inventory_ledger.quantity_delta IS 'Positive = stock in (opening, rto, return, restock, adjustment+). '
                                                     'Negative = stock out (sale, write_off, adjustment−). Never zero.';
COMMENT ON COLUMN inventory_ledger.reference_id  IS 'Polymorphic FK. Points to shipments.id when reference_type=shipment, '
                                                    'returns.id when reference_type=return_shipment. '
                                                    'Not enforced as a DB constraint due to polymorphism.';

-- =============================================================================
-- DOMAIN 2: ORDERS
-- =============================================================================

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------
CREATE TABLE customers (
  id                  serial        NOT NULL,
  email               text          NOT NULL,
  phone               text,
  first_name          text,
  last_name           text,
  first_order_at      timestamptz,
  total_orders        int           NOT NULL DEFAULT 0,
  total_revenue_inr   numeric(12,2) NOT NULL DEFAULT 0,
  acquisition_source  text,
  created_at          timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT customers_pkey          PRIMARY KEY (id),
  CONSTRAINT customers_email_key     UNIQUE      (email),
  CONSTRAINT customers_orders_pos    CHECK (total_orders >= 0),
  CONSTRAINT customers_revenue_pos   CHECK (total_revenue_inr >= 0)
);

COMMENT ON TABLE  customers                   IS 'Deduplicated customer records. email is the primary dedup key. '
                                                 'PII table — admin role access only per BR-128.';
COMMENT ON COLUMN customers.email             IS 'Primary dedup key across WooCommerce imports. Case-insensitive match required.';
COMMENT ON COLUMN customers.phone             IS '10 digits without country code (+91 stripped during import).';
COMMENT ON COLUMN customers.total_revenue_inr IS 'Running total of Net Revenue from all delivered orders. '
                                                  'Maintained by application on each delivery event. Powers LTV (KPI F-04).';

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------
CREATE TABLE orders (
  id                        serial        NOT NULL,
  woocommerce_order_id      int           NOT NULL,
  woocommerce_order_number  text,
  customer_id               int,
  status                    text          NOT NULL,
  payment_method            text,
  payment_method_title      text,
  transaction_id            text,
  subtotal_inr              numeric(10,2),
  discount_inr              numeric(10,2) NOT NULL DEFAULT 0,
  shipping_charged_inr      numeric(10,2) NOT NULL DEFAULT 0,
  order_total_inr           numeric(10,2) NOT NULL,
  attribution_source        text,
  attribution_medium        text,
  attribution_campaign      text,
  attribution_device        text,
  billing_city              text,
  billing_state             text,
  billing_pincode           text,
  ordered_at                timestamptz   NOT NULL,
  paid_at                   timestamptz,
  created_at                timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT orders_pkey          PRIMARY KEY (id),
  CONSTRAINT orders_wc_id_key     UNIQUE      (woocommerce_order_id),
  CONSTRAINT orders_customer_fk   FOREIGN KEY (customer_id) REFERENCES customers (id),
  CONSTRAINT orders_total_pos     CHECK (order_total_inr >= 0),
  CONSTRAINT orders_discount_pos  CHECK (discount_inr >= 0),
  CONSTRAINT orders_status_chk    CHECK (status IN ('processing','completed','cancelled','refunded','on-hold','pending','failed'))
);

COMMENT ON TABLE  orders                        IS 'One row per WooCommerce order. Source of record for all financial amounts (BR-012). '
                                                   'Source: WooCommerce CSV export, 917 rows, 93 columns.';
COMMENT ON COLUMN orders.woocommerce_order_id   IS 'Canonical order identifier. Always use COUNT(DISTINCT woocommerce_order_id) for order counts — never count shipment rows. Per BR-011.';
COMMENT ON COLUMN orders.shipping_charged_inr   IS 'Shipping fee collected from customer. Excluded from all revenue KPIs. Per BR-004.';
COMMENT ON COLUMN orders.discount_inr           IS 'Order-level discount. Deducted from Gross Revenue for Net Revenue calculation. Per BR-003.';
COMMENT ON COLUMN orders.attribution_source     IS 'utm_source captured by WooCommerce. NULL for ~70% of orders. Per BR-077.';

-- ---------------------------------------------------------------------------
-- order_lines
-- ---------------------------------------------------------------------------
CREATE TABLE order_lines (
  id                        serial        NOT NULL,
  order_id                  int           NOT NULL,
  variant_id                int,
  woocommerce_line_item_id  int,
  sku_raw                   text,
  product_name_raw          text,
  quantity                  int           NOT NULL,
  unit_price_inr            numeric(10,2),
  line_total_inr            numeric(10,2),
  line_subtotal_inr         numeric(10,2),

  CONSTRAINT order_lines_pkey       PRIMARY KEY (id),
  CONSTRAINT order_lines_order_fk   FOREIGN KEY (order_id)   REFERENCES orders           (id),
  CONSTRAINT order_lines_variant_fk FOREIGN KEY (variant_id) REFERENCES product_variants (id),
  CONSTRAINT order_lines_qty_pos    CHECK (quantity > 0)
);

COMMENT ON TABLE  order_lines               IS 'One row per SKU per WooCommerce order. '
                                               'line_total_inr is the authoritative Gross Revenue source. Per BR-002.';
COMMENT ON COLUMN order_lines.line_total_inr IS 'Product revenue for this line (quantity × unit_price, excluding shipping). '
                                                 'SUM of this column across delivered orders = Gross Revenue. Per BR-002.';
COMMENT ON COLUMN order_lines.variant_id    IS 'Resolved during import via sku_raw → product_variants.sku lookup. '
                                               'NULL = unresolved SKU (must be zero before go-live — DQ check BR-115).';

-- ---------------------------------------------------------------------------
-- shipments  (one row per Shiprocket order-line; multi-item orders = multiple rows)
-- ---------------------------------------------------------------------------
CREATE TABLE shipments (
  id                    serial        NOT NULL,
  order_id              int,
  shiprocket_order_id   bigint,
  awb_code              text,
  channel               text,
  status                text          NOT NULL,
  variant_id            int,
  channel_sku           text,
  master_sku            text,
  product_quantity      int           NOT NULL,
  payment_method        text,
  product_price_inr     numeric(10,2),
  order_total_inr       numeric(10,2),
  courier_company       text,
  zone                  text,
  freight_total_inr     numeric(10,2),
  cod_charges_inr       numeric(10,2) NOT NULL DEFAULT 0,
  cod_crf_id            text,
  cod_remittance_date   date,
  cod_payable_inr       numeric(10,2),
  remitted_inr          numeric(10,2),
  shiprocket_created_at timestamptz,
  channel_created_at    timestamptz,
  picked_up_at          timestamptz,
  shipped_at            timestamptz,
  delivered_at          timestamptz,
  edd                   date,
  rto_initiated_at      timestamptz,
  rto_delivered_at      timestamptz,
  ndr_attempts          int           NOT NULL DEFAULT 0,
  latest_ndr_reason     text,
  customer_city         text,
  customer_state        text,
  customer_pincode      text,
  rto_risk              text,
  created_at            timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT shipments_pkey            PRIMARY KEY (id),
  CONSTRAINT shipments_order_fk        FOREIGN KEY (order_id)   REFERENCES orders           (id),
  CONSTRAINT shipments_variant_fk      FOREIGN KEY (variant_id) REFERENCES product_variants (id),
  CONSTRAINT shipments_payment_chk     CHECK (payment_method IN ('prepaid','cod') OR payment_method IS NULL),
  CONSTRAINT shipments_zone_chk        CHECK (zone IN ('z_a','z_b','z_c','z_d','z_e') OR zone IS NULL),
  CONSTRAINT shipments_rto_risk_chk    CHECK (rto_risk IN ('low','medium','high') OR rto_risk IS NULL),
  CONSTRAINT shipments_ndr_pos         CHECK (ndr_attempts >= 0),
  CONSTRAINT shipments_cod_charges_pos CHECK (cod_charges_inr >= 0),
  -- Date sequence: shipped before or on delivery; delivered before or on RTO return
  CONSTRAINT shipments_date_seq        CHECK (
    (channel_created_at IS NULL OR shipped_at IS NULL        OR shipped_at        >= channel_created_at) AND
    (shipped_at         IS NULL OR delivered_at IS NULL      OR delivered_at      >= shipped_at)         AND
    (shipped_at         IS NULL OR rto_delivered_at IS NULL  OR rto_delivered_at  >= shipped_at)
  )
);

COMMENT ON TABLE  shipments                    IS 'One row per Shiprocket shipment line. '
                                                  'A single WooCommerce order with 2 SKUs = 2 rows sharing shiprocket_order_id. '
                                                  'For order-level metrics use COUNT(DISTINCT orders.woocommerce_order_id). Per BR-011. '
                                                  'Source: Shiprocket yearly CSV exports, ~1,099 total rows.';
COMMENT ON COLUMN shipments.delivered_at       IS 'Revenue recognition date. Revenue recognised when this IS NOT NULL and status=DELIVERED. Per BR-001.';
COMMENT ON COLUMN shipments.shiprocket_order_id IS 'Shared across all SKUs in a multi-item order. NOT unique. Do not use for order counting.';
COMMENT ON COLUMN shipments.cod_crf_id         IS 'Shiprocket CRF batch ID. Matches bank_transactions.extracted_reference for COD reconciliation. Per BR-067.';
COMMENT ON COLUMN shipments.order_total_inr    IS 'Shiprocket display field duplicated across rows in multi-item orders. '
                                                   'Do NOT sum this for revenue — use order_lines.line_total_inr instead.';
COMMENT ON COLUMN shipments.rto_delivered_at   IS 'Populated when status=RTO_DELIVERED. Triggers automatic inventory restock. Per BR-020.';
COMMENT ON COLUMN shipments.freight_total_inr  IS 'Courier cost paid by Kirgo for this shipment. Deducted at Contribution Margin level, not Gross Margin. Per BR-044.';

-- ---------------------------------------------------------------------------
-- returns
-- ---------------------------------------------------------------------------
CREATE TABLE returns (
  id                  serial        NOT NULL,
  shipment_id         int,
  shiprocket_order_id bigint,
  awb_code            text,
  status              text,
  return_reason       text,
  qc_status           text,
  qc_failure_reason   text,
  refund_amount_inr   numeric(10,2),
  refund_status       text,
  refund_mode         text,
  returned_at         timestamptz,
  created_at          timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT returns_pkey              PRIMARY KEY (id),
  CONSTRAINT returns_shipment_fk       FOREIGN KEY (shipment_id) REFERENCES shipments (id),
  CONSTRAINT returns_refund_status_chk CHECK (refund_status IN ('pending','processed') OR refund_status IS NULL),
  CONSTRAINT returns_refund_mode_chk   CHECK (refund_mode IN ('original_payment_method','bank_transfer') OR refund_mode IS NULL),
  CONSTRAINT returns_qc_status_chk     CHECK (qc_status IN ('pass','fail','pending') OR qc_status IS NULL),
  CONSTRAINT returns_refund_pos        CHECK (refund_amount_inr IS NULL OR refund_amount_inr >= 0)
);

COMMENT ON TABLE  returns                  IS 'Customer-initiated returns and courier RTOs. '
                                              'return_reason IS NOT NULL = customer return (product). '
                                              'return_reason IS NULL = typically an RTO entry. '
                                              'Distinguish for Return Rate % (BR-015) vs RTO Rate % (BR-017).';
COMMENT ON COLUMN returns.return_reason    IS 'Customer-stated reason. NULL for RTO rows. IS NOT NULL filter = customer-initiated returns only.';
COMMENT ON COLUMN returns.qc_status        IS 'pass → restock (BR-019) | fail → write-off (BR-035) | pending = awaiting inspection.';
COMMENT ON COLUMN returns.refund_status    IS 'pending = committed, not yet paid | processed = cash has left bank account. '
                                              'Only processed refunds deduct from Net Revenue (BR-016).';

-- =============================================================================
-- DOMAIN 3: FINANCIAL
--
-- CIRCULAR DEPENDENCY: gateway_settlements ←→ bank_transactions
-- Resolution: create gateway_settlements first (without the bank_transaction_id FK),
-- then create bank_transactions with FK → gateway_settlements,
-- then ALTER TABLE gateway_settlements to add the reverse FK.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- gateway_settlements  (bank_transaction_id FK added after bank_transactions)
-- ---------------------------------------------------------------------------
CREATE TABLE gateway_settlements (
  id                    serial        NOT NULL,
  gateway               text          NOT NULL,
  settlement_reference  text,
  amount_inr            numeric(12,2) NOT NULL,
  settled_at            date,
  order_count           int,
  bank_transaction_id   int,          -- FK wired below via ALTER TABLE
  created_at            timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT gateway_settlements_pkey          PRIMARY KEY (id),
  CONSTRAINT gateway_settlements_ref_key       UNIQUE      (settlement_reference),
  CONSTRAINT gateway_settlements_gateway_chk   CHECK (gateway IN ('easebuzz','infibeam','shiprocket_cod')),
  CONSTRAINT gateway_settlements_amount_pos    CHECK (amount_inr > 0)
);

COMMENT ON TABLE  gateway_settlements                  IS 'Batch settlement records from payment gateways and Shiprocket COD. '
                                                          'EaseBuzz: YESB/YESF reference. Infibeam: ICICI nodal UTR. Shiprocket COD: CRF ID. Per BR-066, BR-067.';
COMMENT ON COLUMN gateway_settlements.settlement_reference IS 'Unique identifier: YESF code (EaseBuzz), UTR (Infibeam), or CRF ID (Shiprocket). '
                                                             'Matches bank_transactions.extracted_reference for reconciliation.';
COMMENT ON COLUMN gateway_settlements.bank_transaction_id IS 'FK to matched bank credit entry. NULL until reconciliation is performed.';

-- ---------------------------------------------------------------------------
-- bank_transactions
-- ---------------------------------------------------------------------------
CREATE TABLE bank_transactions (
  id                        serial        NOT NULL,
  transaction_date          date          NOT NULL,
  value_date                date,
  narration_raw             text          NOT NULL,
  reference_number          text,
  withdrawal_inr            numeric(12,2),
  deposit_inr               numeric(12,2),
  closing_balance_inr       numeric(12,2),
  transaction_type          text,
  counterparty              text,
  extracted_reference       text,
  linked_settlement_id      int,
  linked_purchase_order_id  int,          -- FK added after purchase_orders is created
  notes                     text,
  created_at                timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT bank_transactions_pkey           PRIMARY KEY (id),
  CONSTRAINT bank_transactions_settlement_fk  FOREIGN KEY (linked_settlement_id) REFERENCES gateway_settlements (id),
  CONSTRAINT bank_transactions_withdrawal_pos CHECK (withdrawal_inr IS NULL OR withdrawal_inr >= 0),
  CONSTRAINT bank_transactions_deposit_pos    CHECK (deposit_inr    IS NULL OR deposit_inr    >= 0),
  -- A row is either a debit or a credit, never both
  CONSTRAINT bank_transactions_one_direction  CHECK (NOT (withdrawal_inr IS NOT NULL AND deposit_inr IS NOT NULL)),
  CONSTRAINT bank_transactions_type_chk       CHECK (
    transaction_type IN (
      'gateway_settlement','cod_remittance','shiprocket_recharge','courier_payment',
      'ad_spend_meta','ad_spend_google','saas_subscription','customer_refund',
      'bank_charge','supplier_payment','founder_transfer','fx_loss',
      'inventory_write_off','miscellaneous','unclassified'
    ) OR transaction_type IS NULL
  )
);

COMMENT ON TABLE  bank_transactions                   IS 'HDFC bank statement rows. Narration parsed by BR-BANK-01 rules to classify transaction_type. '
                                                         'Source of truth for all cash KPIs (G-01 through G-06). '
                                                         'Currently covers Jan–Jun 2026.';
COMMENT ON COLUMN bank_transactions.narration_raw     IS 'Original HDFC narration string. Input to the narration classifier (BUSINESS_RULES.md §3).';
COMMENT ON COLUMN bank_transactions.transaction_type  IS 'Classified by narration parser. See BR-057 for the full 15-category list.';
COMMENT ON COLUMN bank_transactions.extracted_reference IS 'CRF ID (Shiprocket COD), YESF code (EaseBuzz), or UTR (Infibeam). '
                                                          'Matches gateway_settlements.settlement_reference for COD reconciliation.';
COMMENT ON COLUMN bank_transactions.closing_balance_inr IS 'Running balance after this transaction. '
                                                           'Powers KPI A-06 (Net Cash Position). '
                                                           'Continuity must hold: each row = prior row balance ± this row amount. Per BR-121.';

-- Resolve circular FK: gateway_settlements → bank_transactions
ALTER TABLE gateway_settlements
  ADD CONSTRAINT gateway_settlements_bank_txn_fk
  FOREIGN KEY (bank_transaction_id) REFERENCES bank_transactions (id);

-- ---------------------------------------------------------------------------
-- purchase_orders
-- ---------------------------------------------------------------------------
CREATE TABLE purchase_orders (
  id                    serial        NOT NULL,
  launch_id             int,
  supplier_name         text          NOT NULL,
  invoice_number        text,
  invoice_date          date,
  currency              text          NOT NULL DEFAULT 'USD',
  subtotal_foreign      numeric(12,2),
  shipping_cost_foreign numeric(12,2),
  total_foreign         numeric(12,2),
  fx_rate_inr           numeric(8,4),
  total_inr             numeric(12,2),
  payment_terms         text,
  payment_method        text,
  status                text,
  created_at            timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT purchase_orders_pkey         PRIMARY KEY (id),
  CONSTRAINT purchase_orders_launch_fk    FOREIGN KEY (launch_id) REFERENCES launches (id),
  CONSTRAINT purchase_orders_currency_chk CHECK (currency IN ('USD','INR','EUR','GBP')),
  CONSTRAINT purchase_orders_status_chk   CHECK (status IN ('draft','partial_paid','paid','received') OR status IS NULL),
  CONSTRAINT purchase_orders_payment_chk  CHECK (payment_method IN ('swift','paypal','upi','bank_transfer') OR payment_method IS NULL)
);

COMMENT ON TABLE  purchase_orders          IS 'Supplier purchase orders. CAPEX — stored in launch_expenses, not expenses. '
                                              'Seeded: JSKS-240801 (L2, Jspeed, USD 6,120) and BURN-251006 (L3, Burning Active, USD 4,228.60). Per BR-073.';
COMMENT ON COLUMN purchase_orders.fx_rate_inr IS 'INR per 1 foreign currency unit at payment date. '
                                                  'Derived from bank debit / invoice amount (BR-046).';

-- Add deferred FKs that reference purchase_orders
ALTER TABLE inventory_batches
  ADD CONSTRAINT inventory_batches_po_fk
  FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders (id);

ALTER TABLE bank_transactions
  ADD CONSTRAINT bank_transactions_po_fk
  FOREIGN KEY (linked_purchase_order_id) REFERENCES purchase_orders (id);

-- Seeded purchase orders
INSERT INTO purchase_orders
  (launch_id, supplier_name, invoice_number, currency, total_foreign, payment_method, status)
SELECT l.id, p.supplier, p.invoice, p.currency, p.total, 'paypal', 'received'
FROM (VALUES
  ('L2', 'Shanghai Jspeed Industry Co.', 'JSKS-240801', 'USD', 6120.00),
  ('L3', 'Burning Active Apparel Co.',   'BURN-251006', 'USD', 4228.60)
) AS p (launch_code, supplier, invoice, currency, total)
JOIN launches l ON l.code = p.launch_code;

-- ---------------------------------------------------------------------------
-- purchase_order_lines
-- ---------------------------------------------------------------------------
CREATE TABLE purchase_order_lines (
  id                    serial        NOT NULL,
  purchase_order_id     int           NOT NULL,
  variant_id            int,
  supplier_style_no     text,
  description           text,
  size                  text,
  colour_code           text,
  quantity              int           NOT NULL,
  unit_price_foreign    numeric(8,2),
  line_total_foreign    numeric(12,2),
  created_at            timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT purchase_order_lines_pkey    PRIMARY KEY (id),
  CONSTRAINT purchase_order_lines_po_fk   FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders   (id),
  CONSTRAINT purchase_order_lines_var_fk  FOREIGN KEY (variant_id)        REFERENCES product_variants  (id),
  CONSTRAINT purchase_order_lines_qty_pos CHECK (quantity > 0)
);

COMMENT ON TABLE purchase_order_lines IS 'Line items within a supplier PO. variant_id resolved post-import after product_variants are seeded.';

-- ---------------------------------------------------------------------------
-- launch_expenses
-- v2 change: category_id (FK) replaces v1 free-text category column.
-- ---------------------------------------------------------------------------
CREATE TABLE launch_expenses (
  id                serial        NOT NULL,
  launch_id         int           NOT NULL,
  expense_name      text          NOT NULL,
  category_id       int           NOT NULL,
  amount_inr        numeric(12,2) NOT NULL,
  currency_original text          NOT NULL DEFAULT 'INR',
  amount_foreign    numeric(12,2),
  fx_rate_inr       numeric(8,4),
  paid_at           date,
  status            text,
  notes             text,
  created_at        timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT launch_expenses_pkey        PRIMARY KEY (id),
  CONSTRAINT launch_expenses_launch_fk   FOREIGN KEY (launch_id)   REFERENCES launches            (id),
  CONSTRAINT launch_expenses_cat_fk      FOREIGN KEY (category_id) REFERENCES expense_categories  (id),
  CONSTRAINT launch_expenses_amount_pos  CHECK (amount_inr > 0),
  CONSTRAINT launch_expenses_status_chk  CHECK (status IN ('paid','pending','tbd') OR status IS NULL),
  CONSTRAINT launch_expenses_cur_chk     CHECK (currency_original IN ('INR','USD','EUR','GBP'))
);

COMMENT ON TABLE  launch_expenses             IS 'Pre-launch CAPEX: manufacturing, shoot, import, packaging, legal. '
                                                 'Separate from the expenses table (OPEX). '
                                                 'Totals: L1 ₹6,43,500 · L2 ₹10,37,760 · L3 ₹5,05,000. Per BR-050.';
COMMENT ON COLUMN launch_expenses.category_id IS 'FK to expense_categories. v2 change: replaces the v1 free-text category field.';
COMMENT ON COLUMN launch_expenses.amount_foreign IS 'Original foreign-currency amount. Reconciled against bank debits via fx_rate_inr. Per BR-046.';

-- =============================================================================
-- DOMAIN 4: MARKETING
-- =============================================================================

-- ---------------------------------------------------------------------------
-- ad_campaigns
-- ---------------------------------------------------------------------------
CREATE TABLE ad_campaigns (
  id                    serial      NOT NULL,
  platform              text        NOT NULL,
  platform_account_id   text,
  campaign_name         text,
  campaign_type         text,
  started_at            date,
  ended_at              date,
  is_active             boolean     NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ad_campaigns_pkey         PRIMARY KEY (id),
  CONSTRAINT ad_campaigns_platform_chk CHECK (platform IN ('google','meta')),
  CONSTRAINT ad_campaigns_type_chk     CHECK (
    campaign_type IN ('pmax','search','shopping','advantage_plus','video','display') OR campaign_type IS NULL
  )
);

COMMENT ON TABLE  ad_campaigns                  IS 'Paid advertising campaigns. '
                                                   'Google account: 736-944-6064. Meta account: 729422043560314. Both started May 2026.';
COMMENT ON COLUMN ad_campaigns.platform         IS 'google | meta';
COMMENT ON COLUMN ad_campaigns.ended_at         IS 'NULL = campaign still active.';

INSERT INTO ad_campaigns (platform, platform_account_id, campaign_name, campaign_type, started_at, is_active)
VALUES
  ('google', '736-944-6064',    'Sid - PMAX - 15 May', 'pmax',   '2026-05-15', true),
  ('google', '736-944-6064',    'Kirgo Test 1',         'search', '2026-05-15', true),
  ('meta',   '729422043560314', 'Kirgo Meta May 2026',  NULL,     '2026-05-01', true);

-- ---------------------------------------------------------------------------
-- ad_spend_daily
-- GENERATED column: total_inr = spend_inr + gst_inr
-- ---------------------------------------------------------------------------
CREATE TABLE ad_spend_daily (
  id                serial        NOT NULL,
  campaign_id       int           NOT NULL,
  spend_date        date          NOT NULL,
  impressions       bigint        NOT NULL DEFAULT 0,
  clicks            int           NOT NULL DEFAULT 0,
  spend_inr         numeric(10,2) NOT NULL,
  gst_inr           numeric(10,2) NOT NULL DEFAULT 0,
  total_inr         numeric(10,2) NOT NULL GENERATED ALWAYS AS (spend_inr + gst_inr) STORED,
  invoice_reference text,
  created_at        timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT ad_spend_daily_pkey            PRIMARY KEY (id),
  CONSTRAINT ad_spend_daily_campaign_fk     FOREIGN KEY (campaign_id) REFERENCES ad_campaigns (id),
  CONSTRAINT ad_spend_daily_campaign_date   UNIQUE      (campaign_id, spend_date),
  CONSTRAINT ad_spend_daily_spend_pos       CHECK (spend_inr >= 0),
  CONSTRAINT ad_spend_daily_gst_pos         CHECK (gst_inr   >= 0)
);

COMMENT ON TABLE  ad_spend_daily            IS 'Daily ad spend per campaign. spend_inr is NET (before GST). '
                                               'total_inr is GENERATED = spend_inr + gst_inr. '
                                               'Use spend_inr for all ROAS / MER / CAC denominators — GST is recoverable input tax. Per BR-082.';
COMMENT ON COLUMN ad_spend_daily.spend_inr  IS 'Net spend after overdelivery credits, before GST. Use this for marketing efficiency KPIs.';
COMMENT ON COLUMN ad_spend_daily.total_inr  IS 'GENERATED: spend_inr + gst_inr. Matches total bank debit. Do NOT use for ROAS.';
COMMENT ON COLUMN ad_spend_daily.gst_inr    IS '18% IGST on Google Ads. Zero for Meta. Recoverable input tax — excluded from marketing efficiency denominators.';

-- =============================================================================
-- DOMAIN 6 (continued): OPERATIONAL EXPENSES
-- Created here because expenses references users, expense_categories,
-- bank_transactions, launches, and ad_campaigns — all now available.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- expenses
-- ---------------------------------------------------------------------------
CREATE TABLE expenses (
  id                    serial        NOT NULL,
  expense_date          date          NOT NULL,
  category_id           int           NOT NULL,
  description           text          NOT NULL,
  amount_inr            numeric(12,2) NOT NULL,
  vendor                text,
  payment_method        text,
  bank_transaction_id   int,
  launch_id             int,
  campaign_id           int,
  is_recurring          boolean       NOT NULL DEFAULT false,
  recurrence_period     text,
  notes                 text,
  created_by            int,
  created_at            timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT expenses_pkey              PRIMARY KEY (id),
  CONSTRAINT expenses_category_fk       FOREIGN KEY (category_id)         REFERENCES expense_categories  (id),
  CONSTRAINT expenses_bank_txn_fk       FOREIGN KEY (bank_transaction_id) REFERENCES bank_transactions   (id),
  CONSTRAINT expenses_launch_fk         FOREIGN KEY (launch_id)           REFERENCES launches            (id),
  CONSTRAINT expenses_campaign_fk       FOREIGN KEY (campaign_id)         REFERENCES ad_campaigns        (id),
  CONSTRAINT expenses_created_by_fk     FOREIGN KEY (created_by)          REFERENCES users               (id),
  CONSTRAINT expenses_amount_pos        CHECK (amount_inr > 0),
  CONSTRAINT expenses_payment_chk       CHECK (
    payment_method IN ('upi','bank_transfer','paypal','debit_card','swift','credit_card') OR payment_method IS NULL
  ),
  CONSTRAINT expenses_recurrence_chk    CHECK (
    recurrence_period IN ('weekly','monthly','annual') OR recurrence_period IS NULL
  ),
  CONSTRAINT expenses_recurring_period  CHECK (
    NOT (is_recurring = true AND recurrence_period IS NULL)
  )
);

COMMENT ON TABLE  expenses                      IS 'Operational expense ledger (OPEX). Each row reconciles to bank_transaction_id. '
                                                   'Does NOT include CAPEX (use launch_expenses) or COGS (embedded in products). Per BR-051.';
COMMENT ON COLUMN expenses.bank_transaction_id  IS 'One-to-one link to the corresponding bank debit. Enables cash vs accrual reconciliation (BR-071).';
COMMENT ON COLUMN expenses.campaign_id          IS 'Set when expense is an ad spend aggregate line. '
                                                    'Daily detail lives in ad_spend_daily; this is the monthly summary entry.';

-- =============================================================================
-- DOMAIN 7: INTELLIGENCE
-- =============================================================================

-- ---------------------------------------------------------------------------
-- kpi_daily_snapshot
-- ---------------------------------------------------------------------------
CREATE TABLE kpi_daily_snapshot (
  id                        serial        NOT NULL,
  snapshot_date             date          NOT NULL,
  gross_revenue_inr         numeric(12,2) NOT NULL DEFAULT 0,
  net_revenue_inr           numeric(12,2) NOT NULL DEFAULT 0,
  orders_placed             int           NOT NULL DEFAULT 0,
  orders_delivered          int           NOT NULL DEFAULT 0,
  units_sold                int           NOT NULL DEFAULT 0,
  avg_order_value_inr       numeric(10,2),
  new_customers             int           NOT NULL DEFAULT 0,
  returns_count             int           NOT NULL DEFAULT 0,
  returns_value_inr         numeric(12,2) NOT NULL DEFAULT 0,
  rto_count                 int           NOT NULL DEFAULT 0,
  rto_cost_inr              numeric(12,2) NOT NULL DEFAULT 0,
  cod_orders                int           NOT NULL DEFAULT 0,
  prepaid_orders            int           NOT NULL DEFAULT 0,
  cash_deposited_inr        numeric(12,2) NOT NULL DEFAULT 0,
  cash_withdrawn_inr        numeric(12,2) NOT NULL DEFAULT 0,
  closing_bank_balance_inr  numeric(12,2),
  ad_spend_inr              numeric(10,2) NOT NULL DEFAULT 0,
  computed_at               timestamptz   NOT NULL,
  created_at                timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT kpi_daily_snapshot_pkey     PRIMARY KEY (id),
  CONSTRAINT kpi_daily_snapshot_date_key UNIQUE      (snapshot_date)
);

COMMENT ON TABLE  kpi_daily_snapshot                     IS 'Pre-computed daily KPI aggregate. Powers the Executive Dashboard without real-time joins. '
                                                            'Recomputed nightly and after each data import. Per BR-098, BR-105.';
COMMENT ON COLUMN kpi_daily_snapshot.gross_revenue_inr   IS 'SUM(order_lines.line_total_inr) WHERE shipments.delivered_at = snapshot_date. Per BR-001, BR-002.';
COMMENT ON COLUMN kpi_daily_snapshot.closing_bank_balance_inr IS 'Last closing_balance_inr from bank_transactions on this date. KPI A-06.';
COMMENT ON COLUMN kpi_daily_snapshot.computed_at         IS 'Timestamp of last recomputation. If > 25 hours old, snapshot is stale — fall back to raw tables. Per BR-097.';

-- ---------------------------------------------------------------------------
-- kpi_monthly_snapshot
-- UNIQUE via two partial indexes (see index section): NULL launch_id = aggregate row.
-- ---------------------------------------------------------------------------
CREATE TABLE kpi_monthly_snapshot (
  id                        serial        NOT NULL,
  snapshot_month            date          NOT NULL,
  launch_id                 int,
  gross_revenue_inr         numeric(12,2) NOT NULL DEFAULT 0,
  net_revenue_inr           numeric(12,2) NOT NULL DEFAULT 0,
  orders_delivered          int           NOT NULL DEFAULT 0,
  units_sold                int           NOT NULL DEFAULT 0,
  avg_order_value_inr       numeric(10,2),
  new_customers             int           NOT NULL DEFAULT 0,
  returning_customers       int           NOT NULL DEFAULT 0,
  gross_margin_inr          numeric(12,2) NOT NULL DEFAULT 0,
  gross_margin_pct          numeric(5,2),
  total_shipping_cost_inr   numeric(12,2) NOT NULL DEFAULT 0,
  total_cod_charges_inr     numeric(12,2) NOT NULL DEFAULT 0,
  total_ad_spend_inr        numeric(12,2) NOT NULL DEFAULT 0,
  total_opex_inr            numeric(12,2) NOT NULL DEFAULT 0,
  contribution_margin_inr   numeric(12,2),
  contribution_margin_pct   numeric(5,2),
  rto_count                 int           NOT NULL DEFAULT 0,
  rto_rate_pct              numeric(5,2),
  return_rate_pct           numeric(5,2),
  cod_mix_pct               numeric(5,2),
  roas                      numeric(6,2),
  cash_collected_inr        numeric(12,2) NOT NULL DEFAULT 0,
  computed_at               timestamptz   NOT NULL,
  created_at                timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT kpi_monthly_snapshot_pkey      PRIMARY KEY (id),
  CONSTRAINT kpi_monthly_snapshot_launch_fk FOREIGN KEY (launch_id) REFERENCES launches (id),
  -- snapshot_month must always be the first day of the month
  CONSTRAINT kpi_monthly_snapshot_month_chk CHECK (snapshot_month = date_trunc('month', snapshot_month)::date)
);

COMMENT ON TABLE  kpi_monthly_snapshot                      IS 'Monthly P&L-grade KPI aggregate. '
                                                               'One row per month per launch (launch_id) PLUS one aggregate row per month (launch_id IS NULL). '
                                                               'Uniqueness enforced by two partial indexes.';
COMMENT ON COLUMN kpi_monthly_snapshot.snapshot_month       IS 'Always the first day of the month (e.g., 2026-01-01). Enforced by CHECK.';
COMMENT ON COLUMN kpi_monthly_snapshot.launch_id            IS 'NULL = all-launches aggregate row. NOT NULL = per-launch breakdown.';
COMMENT ON COLUMN kpi_monthly_snapshot.contribution_margin_inr IS 'gross_margin - shipping - COD charges - ad spend. Per BR-044, KPI D-02.';
COMMENT ON COLUMN kpi_monthly_snapshot.roas                 IS 'net_revenue / total_ad_spend. NULL when no ad spend in period. Per BR-080.';

-- ---------------------------------------------------------------------------
-- revenue_forecasts  (LA-WMA model output)
-- ---------------------------------------------------------------------------
CREATE TABLE revenue_forecasts (
  id                          serial        NOT NULL,
  forecast_month              date          NOT NULL,
  launch_id                   int,
  snapshot_date               date          NOT NULL,
  model_version               text          NOT NULL,
  forecast_revenue_inr        numeric(12,2) NOT NULL,
  confidence_low_inr          numeric(12,2),
  confidence_high_inr         numeric(12,2),
  forecast_orders             int,
  forecast_aov_inr            numeric(10,2),
  launch_phase_month          int,
  launch_phase_factor         numeric(4,3),
  stock_availability_factor   numeric(4,3),
  planned_ad_spend_inr        numeric(12,2) NOT NULL DEFAULT 0,
  actual_revenue_inr          numeric(12,2),
  forecast_accuracy_pct       numeric(6,2),
  input_params                jsonb,
  is_current                  boolean       NOT NULL DEFAULT true,
  created_by                  int,
  created_at                  timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT revenue_forecasts_pkey         PRIMARY KEY (id),
  CONSTRAINT revenue_forecasts_launch_fk    FOREIGN KEY (launch_id)   REFERENCES launches (id),
  CONSTRAINT revenue_forecasts_user_fk      FOREIGN KEY (created_by)  REFERENCES users    (id),
  CONSTRAINT revenue_forecasts_month_chk    CHECK (forecast_month = date_trunc('month', forecast_month)::date),
  CONSTRAINT revenue_forecasts_rev_pos      CHECK (forecast_revenue_inr >= 0),
  CONSTRAINT revenue_forecasts_phase_fac    CHECK (launch_phase_factor       IS NULL OR launch_phase_factor       BETWEEN 0 AND 1),
  CONSTRAINT revenue_forecasts_stock_fac    CHECK (stock_availability_factor IS NULL OR stock_availability_factor BETWEEN 0 AND 1)
);

COMMENT ON TABLE  revenue_forecasts                       IS 'LA-WMA model output (FORECASTING_MODEL.md). '
                                                             'Prior forecasts for the same month/launch are marked is_current=false when superseded. '
                                                             'actual_revenue_inr back-filled from kpi_monthly_snapshot after month closes. Per BR-083, KPI H-01.';
COMMENT ON COLUMN revenue_forecasts.launch_phase_factor   IS 'Decay multiplier 0.0–1.0 by months since launch. Per BR-085. Month 1=1.00, Month 10+=0.20.';
COMMENT ON COLUMN revenue_forecasts.stock_availability_factor IS 'Stock gate 0.0–1.0. 0=sold out, 1=≥30 units. Per BR-086.';
COMMENT ON COLUMN revenue_forecasts.is_current            IS 'True = latest active forecast for this month/launch. False = superseded historical snapshot.';
COMMENT ON COLUMN revenue_forecasts.forecast_accuracy_pct IS '1 − |actual − forecast| / actual × 100. Back-filled once actual is available. KPI H-04.';

-- ---------------------------------------------------------------------------
-- cashflow_forecasts
-- ---------------------------------------------------------------------------
CREATE TABLE cashflow_forecasts (
  id                              serial        NOT NULL,
  forecast_month                  date          NOT NULL,
  snapshot_date                   date          NOT NULL,
  model_version                   text          NOT NULL,
  opening_balance_inr             numeric(12,2) NOT NULL,
  expected_prepaid_inflow_inr     numeric(12,2) NOT NULL DEFAULT 0,
  expected_cod_inflow_inr         numeric(12,2) NOT NULL DEFAULT 0,
  expected_total_inflow_inr       numeric(12,2) NOT NULL DEFAULT 0,
  expected_shipping_cost_inr      numeric(12,2) NOT NULL DEFAULT 0,
  expected_ad_spend_inr           numeric(12,2) NOT NULL DEFAULT 0,
  expected_supplier_payment_inr   numeric(12,2) NOT NULL DEFAULT 0,
  expected_saas_cost_inr          numeric(12,2) NOT NULL DEFAULT 0,
  expected_rto_cost_inr           numeric(12,2) NOT NULL DEFAULT 0,
  expected_refund_cost_inr        numeric(12,2) NOT NULL DEFAULT 0,
  expected_other_opex_inr         numeric(12,2) NOT NULL DEFAULT 0,
  expected_total_outflow_inr      numeric(12,2) NOT NULL DEFAULT 0,
  expected_net_cashflow_inr       numeric(12,2),
  expected_closing_balance_inr    numeric(12,2),
  actual_net_cashflow_inr         numeric(12,2),
  actual_closing_balance_inr      numeric(12,2),
  cod_mix_assumption_pct          numeric(5,2),
  rto_rate_assumption_pct         numeric(5,2),
  prepaid_settlement_lag_days     int           NOT NULL DEFAULT 3,
  cod_settlement_lag_days         int           NOT NULL DEFAULT 10,
  input_params                    jsonb,
  is_current                      boolean       NOT NULL DEFAULT true,
  created_by                      int,
  created_at                      timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT cashflow_forecasts_pkey        PRIMARY KEY (id),
  CONSTRAINT cashflow_forecasts_user_fk     FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT cashflow_forecasts_month_chk   CHECK (forecast_month = date_trunc('month', forecast_month)::date),
  CONSTRAINT cashflow_forecasts_prepaid_lag CHECK (prepaid_settlement_lag_days BETWEEN 1 AND 7),
  CONSTRAINT cashflow_forecasts_cod_lag     CHECK (cod_settlement_lag_days     BETWEEN 1 AND 30)
);

COMMENT ON TABLE  cashflow_forecasts                           IS 'Monthly cash position projection. Models settlement lag and planned outflows. '
                                                                  'Answers: will the bank have enough cash to fund the next supplier instalment? '
                                                                  'Per BR-091, BR-092, KPI H-02.';
COMMENT ON COLUMN cashflow_forecasts.prepaid_settlement_lag_days IS 'T+N days for prepaid settlement. Default 3 (conservative). Per BR-068.';
COMMENT ON COLUMN cashflow_forecasts.cod_settlement_lag_days     IS 'T+N days for COD remittance. Default 10 (midpoint of T+7–T+14). Per BR-069.';
COMMENT ON COLUMN cashflow_forecasts.actual_closing_balance_inr  IS 'Back-filled from bank_transactions after month closes. Enables forecast vs actual reconciliation (BR-071).';

-- ---------------------------------------------------------------------------
-- inventory_forecasts
-- ---------------------------------------------------------------------------
CREATE TABLE inventory_forecasts (
  id                        serial      NOT NULL,
  variant_id                int         NOT NULL,
  snapshot_date             date        NOT NULL,
  current_stock             int         NOT NULL,
  daily_velocity_30d        numeric(6,3),
  daily_velocity_7d         numeric(6,3),
  days_to_stockout_30d      int,
  days_to_stockout_7d       int,
  projected_stockout_date   date,
  alert_level               text        NOT NULL,
  reorder_recommended       boolean     NOT NULL DEFAULT false,
  units_to_reorder          int,
  is_current                boolean     NOT NULL DEFAULT true,
  created_at                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT inventory_forecasts_pkey        PRIMARY KEY (id),
  CONSTRAINT inventory_forecasts_variant_fk  FOREIGN KEY (variant_id) REFERENCES product_variants (id),
  CONSTRAINT inventory_forecasts_alert_chk   CHECK (alert_level IN ('ok','watch','warning','critical')),
  CONSTRAINT inventory_forecasts_stock_pos   CHECK (current_stock >= 0),
  CONSTRAINT inventory_forecasts_vel_pos     CHECK (daily_velocity_30d IS NULL OR daily_velocity_30d >= 0),
  CONSTRAINT inventory_forecasts_reorder_pos CHECK (units_to_reorder IS NULL OR units_to_reorder >= 0)
);

COMMENT ON TABLE  inventory_forecasts                     IS 'Per-variant stock depletion projection. '
                                                             'alert_level drives dashboard card colours. '
                                                             'reorder_recommended triggers PO initiation. Per BR-031, BR-032, KPI E-03, H-03.';
COMMENT ON COLUMN inventory_forecasts.alert_level         IS 'ok (>60d) | watch (30–60d) | warning (14–30d) | critical (<14d). Per BR-031.';
COMMENT ON COLUMN inventory_forecasts.daily_velocity_30d  IS 'Units/day over rolling 30 days. NULL if no sales in 30 days (dead stock check — BR-030).';
COMMENT ON COLUMN inventory_forecasts.units_to_reorder    IS 'MAX(0, CEIL(daily_velocity_30d × 90) − current_stock). Per BR-032.';

-- ---------------------------------------------------------------------------
-- insights  (AI-generated and rule-based observations)
-- ---------------------------------------------------------------------------
CREATE TABLE insights (
  id                  serial        NOT NULL,
  insight_date        date          NOT NULL,
  source              text          NOT NULL,
  category            text          NOT NULL,
  severity            text          NOT NULL,
  title               text          NOT NULL,
  body                text          NOT NULL,
  metric_name         text,
  metric_value        numeric(12,2),
  metric_benchmark    numeric(12,2),
  metric_delta_pct    numeric(7,2),
  linked_launch_id    int,
  linked_variant_id   int,
  linked_campaign_id  int,
  is_dismissed        boolean       NOT NULL DEFAULT false,
  dismissed_by        int,
  dismissed_at        timestamptz,
  model_version       text,
  raw_context         jsonb,
  created_at          timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT insights_pkey             PRIMARY KEY (id),
  CONSTRAINT insights_launch_fk        FOREIGN KEY (linked_launch_id)  REFERENCES launches         (id),
  CONSTRAINT insights_variant_fk       FOREIGN KEY (linked_variant_id) REFERENCES product_variants (id),
  CONSTRAINT insights_campaign_fk      FOREIGN KEY (linked_campaign_id)REFERENCES ad_campaigns     (id),
  CONSTRAINT insights_dismissed_by_fk  FOREIGN KEY (dismissed_by)      REFERENCES users            (id),
  CONSTRAINT insights_source_chk       CHECK (source   IN ('ai','rule')),
  CONSTRAINT insights_severity_chk     CHECK (severity IN ('opportunity','info','warning','alert')),
  CONSTRAINT insights_category_chk     CHECK (category IN ('revenue','inventory','cashflow','marketing','operations','forecast')),
  CONSTRAINT insights_title_length     CHECK (char_length(title) <= 80),
  -- dismissed_by and dismissed_at must both be set or both be NULL
  CONSTRAINT insights_dismiss_pair     CHECK (
    (is_dismissed = false AND dismissed_by IS NULL    AND dismissed_at IS NULL) OR
    (is_dismissed = true  AND dismissed_by IS NOT NULL AND dismissed_at IS NOT NULL)
  )
);

COMMENT ON TABLE  insights              IS 'AI-generated and rule-based business observations. '
                                           'source=rule: deterministic threshold alerts (factual). '
                                           'source=ai: probabilistic model observations (labelled on dashboard). Per BR-106–BR-114.';
COMMENT ON COLUMN insights.source       IS 'rule = deterministic threshold trigger | ai = model-generated probabilistic observation. Per BR-114.';
COMMENT ON COLUMN insights.severity     IS 'opportunity | info | warning | alert. Drives dashboard card colour and sort order.';
COMMENT ON COLUMN insights.raw_context  IS 'JSONB snapshot of the data context that triggered this insight. Retained for audit and AI retraining. Per BR-112.';
COMMENT ON COLUMN insights.is_dismissed IS 'True once acknowledged. dismissed_by and dismissed_at are both required when true.';

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Core transaction indexes
CREATE INDEX orders_wc_id_idx           ON orders (woocommerce_order_id);
CREATE INDEX orders_ordered_at_idx      ON orders (ordered_at);
CREATE INDEX orders_customer_id_idx     ON orders (customer_id);
CREATE INDEX orders_status_idx          ON orders (status) WHERE status NOT IN ('cancelled','failed');

CREATE INDEX order_lines_order_id_idx       ON order_lines (order_id);
CREATE INDEX order_lines_variant_id_idx     ON order_lines (variant_id);
CREATE INDEX order_lines_order_variant_idx  ON order_lines (order_id, variant_id);

-- Shipment indexes (delivered_at = revenue recognition date — most queried column)
CREATE INDEX shipments_order_id_idx       ON shipments (order_id);
CREATE INDEX shipments_sr_order_id_idx    ON shipments (shiprocket_order_id);
CREATE UNIQUE INDEX shipments_awb_idx     ON shipments (awb_code) WHERE awb_code IS NOT NULL;
CREATE INDEX shipments_delivered_at_idx   ON shipments (delivered_at)    WHERE delivered_at IS NOT NULL;
CREATE INDEX shipments_status_idx         ON shipments (status);
CREATE INDEX shipments_cod_crf_id_idx     ON shipments (cod_crf_id)      WHERE cod_crf_id IS NOT NULL;
CREATE INDEX shipments_payment_method_idx ON shipments (payment_method);
CREATE INDEX shipments_rto_delivered_idx  ON shipments (rto_delivered_at) WHERE rto_delivered_at IS NOT NULL;

-- Inventory indexes (stock balance = SUM(quantity_delta) per variant)
CREATE INDEX inventory_ledger_variant_id_idx    ON inventory_ledger (variant_id);
CREATE INDEX inventory_ledger_occurred_at_idx   ON inventory_ledger (occurred_at);
CREATE INDEX inventory_ledger_variant_time_idx  ON inventory_ledger (variant_id, occurred_at);
CREATE INDEX inventory_ledger_movement_idx      ON inventory_ledger (movement_type);

-- Product lookup indexes (used during import to resolve raw SKUs)
CREATE INDEX product_variants_product_id_idx    ON product_variants (product_id);
CREATE INDEX product_variants_wc_id_idx         ON product_variants (woocommerce_product_id) WHERE woocommerce_product_id IS NOT NULL;
CREATE INDEX product_variants_channel_sku_idx   ON product_variants (shiprocket_channel_sku) WHERE shiprocket_channel_sku IS NOT NULL;

-- Financial indexes (cash KPI reconciliation)
CREATE INDEX bank_transactions_date_idx         ON bank_transactions (transaction_date);
CREATE INDEX bank_transactions_ref_idx          ON bank_transactions (reference_number);
CREATE INDEX bank_transactions_type_idx         ON bank_transactions (transaction_type);
CREATE INDEX bank_transactions_extracted_idx    ON bank_transactions (extracted_reference) WHERE extracted_reference IS NOT NULL;

-- Gateway settlement reconciliation
CREATE INDEX gateway_settlements_ref_idx        ON gateway_settlements (settlement_reference);
CREATE INDEX gateway_settlements_gateway_idx    ON gateway_settlements (gateway);

-- Marketing indexes (ROAS, campaign performance)
CREATE INDEX ad_spend_daily_date_idx            ON ad_spend_daily (spend_date);

-- Returns indexes
CREATE INDEX returns_shipment_id_idx            ON returns (shipment_id);
CREATE INDEX returns_refund_status_idx          ON returns (refund_status);
CREATE INDEX returns_returned_at_idx            ON returns (returned_at);

-- Expenses P&L period queries
CREATE INDEX expenses_date_category_idx         ON expenses (expense_date, category_id);
CREATE INDEX expenses_launch_id_idx             ON expenses (launch_id) WHERE launch_id IS NOT NULL;

-- Intelligence dashboard indexes
-- kpi_monthly_snapshot: two partial unique indexes to handle NULL launch_id
-- (standard UNIQUE on (snapshot_month, launch_id) cannot enforce uniqueness when launch_id IS NULL)
CREATE UNIQUE INDEX kpi_monthly_non_null_idx
  ON kpi_monthly_snapshot (snapshot_month, launch_id)
  WHERE launch_id IS NOT NULL;

CREATE UNIQUE INDEX kpi_monthly_aggregate_idx
  ON kpi_monthly_snapshot (snapshot_month)
  WHERE launch_id IS NULL;

CREATE INDEX kpi_monthly_launch_id_idx          ON kpi_monthly_snapshot (launch_id);

-- Revenue forecasts: active forecast lookup (most common query pattern)
CREATE INDEX revenue_forecasts_current_idx
  ON revenue_forecasts (forecast_month, launch_id, is_current)
  WHERE is_current = true;

CREATE INDEX revenue_forecasts_month_idx        ON revenue_forecasts (forecast_month);

-- Cashflow forecasts: active lookup
CREATE INDEX cashflow_forecasts_current_idx
  ON cashflow_forecasts (forecast_month, is_current)
  WHERE is_current = true;

-- Inventory forecasts: current alert status per variant (dashboard priority sort)
CREATE INDEX inventory_forecasts_current_idx
  ON inventory_forecasts (variant_id, is_current)
  WHERE is_current = true;

CREATE INDEX inventory_forecasts_alert_idx      ON inventory_forecasts (alert_level);
CREATE INDEX inventory_forecasts_reorder_idx    ON inventory_forecasts (reorder_recommended) WHERE reorder_recommended = true;

-- Insights: active feed (sorted by date desc, severity)
CREATE INDEX insights_active_idx
  ON insights (insight_date DESC, severity)
  WHERE is_dismissed = false;

CREATE INDEX insights_category_active_idx
  ON insights (category, is_dismissed)
  WHERE is_dismissed = false;

-- =============================================================================
-- ROW-LEVEL SECURITY
--
-- Principles:
--   1. No anonymous (unauthenticated) access. Every policy calls
--      public.current_app_role() which returns NULL for unauth sessions → denied.
--   2. The Supabase service role key (used by background jobs and data pipelines)
--      bypasses RLS automatically — no explicit service-role policies needed.
--   3. Write policies on imported tables (orders, shipments, etc.) are admin-only;
--      the data import pipeline must use the service role key.
--   4. inventory_ledger is append-only: INSERT policy only — no UPDATE/DELETE.
-- =============================================================================

ALTER TABLE roles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE launches             ENABLE ROW LEVEL SECURITY;
ALTER TABLE products             ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants     ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_batches    ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_ledger     ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders               ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_lines          ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns              ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transactions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE gateway_settlements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE launch_expenses      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_campaigns         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_spend_daily       ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses             ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_daily_snapshot   ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_monthly_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_forecasts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashflow_forecasts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_forecasts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE insights             ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- roles — admin only
-- ---------------------------------------------------------------------------
CREATE POLICY "roles_select_admin"  ON roles FOR SELECT USING (public.current_app_role() = 'admin');
CREATE POLICY "roles_insert_admin"  ON roles FOR INSERT WITH CHECK (public.current_app_role() = 'admin');
CREATE POLICY "roles_update_admin"  ON roles FOR UPDATE USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- users — admin only
-- ---------------------------------------------------------------------------
CREATE POLICY "users_select_admin"  ON users FOR SELECT USING (public.current_app_role() = 'admin');
CREATE POLICY "users_insert_admin"  ON users FOR INSERT WITH CHECK (public.current_app_role() = 'admin');
CREATE POLICY "users_update_admin"  ON users FOR UPDATE USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');
CREATE POLICY "users_delete_admin"  ON users FOR DELETE USING (public.current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- expense_categories — analyst + admin read; admin write
-- ---------------------------------------------------------------------------
CREATE POLICY "expense_categories_select" ON expense_categories FOR SELECT USING (public.current_app_role() IN ('admin','analyst'));
CREATE POLICY "expense_categories_write"  ON expense_categories FOR ALL    USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- launches — all roles read; admin write
-- ---------------------------------------------------------------------------
CREATE POLICY "launches_select" ON launches FOR SELECT USING (public.current_app_role() IN ('admin','analyst','viewer'));
CREATE POLICY "launches_write"  ON launches FOR ALL    USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- products — all roles read; admin write
-- ---------------------------------------------------------------------------
CREATE POLICY "products_select" ON products FOR SELECT USING (public.current_app_role() IN ('admin','analyst','viewer'));
CREATE POLICY "products_write"  ON products FOR ALL    USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- product_variants — all roles read; admin write
-- ---------------------------------------------------------------------------
CREATE POLICY "product_variants_select" ON product_variants FOR SELECT USING (public.current_app_role() IN ('admin','analyst','viewer'));
CREATE POLICY "product_variants_write"  ON product_variants FOR ALL    USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- inventory_batches — analyst + admin read; admin write
-- ---------------------------------------------------------------------------
CREATE POLICY "inventory_batches_select" ON inventory_batches FOR SELECT USING (public.current_app_role() IN ('admin','analyst'));
CREATE POLICY "inventory_batches_write"  ON inventory_batches FOR ALL    USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- inventory_ledger — analyst + admin read; admin INSERT only (append-only)
-- No UPDATE or DELETE policies — rows must never be modified.
-- ---------------------------------------------------------------------------
CREATE POLICY "inventory_ledger_select" ON inventory_ledger FOR SELECT USING (public.current_app_role() IN ('admin','analyst'));
CREATE POLICY "inventory_ledger_insert" ON inventory_ledger FOR INSERT WITH CHECK (public.current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- customers — admin only (PII: name, email, phone, address)
-- Per BR-128 (PII handling) and BR-129 (financial data restrictions).
-- ---------------------------------------------------------------------------
CREATE POLICY "customers_select" ON customers FOR SELECT USING (public.current_app_role() = 'admin');
CREATE POLICY "customers_write"  ON customers FOR ALL    USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- orders — analyst + admin read; admin write (import pipeline)
-- ---------------------------------------------------------------------------
CREATE POLICY "orders_select" ON orders FOR SELECT USING (public.current_app_role() IN ('admin','analyst'));
CREATE POLICY "orders_write"  ON orders FOR ALL    USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- order_lines — analyst + admin read; admin write
-- ---------------------------------------------------------------------------
CREATE POLICY "order_lines_select" ON order_lines FOR SELECT USING (public.current_app_role() IN ('admin','analyst'));
CREATE POLICY "order_lines_write"  ON order_lines FOR ALL    USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- shipments — analyst + admin read; admin write
-- ---------------------------------------------------------------------------
CREATE POLICY "shipments_select" ON shipments FOR SELECT USING (public.current_app_role() IN ('admin','analyst'));
CREATE POLICY "shipments_write"  ON shipments FOR ALL    USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- returns — analyst + admin read; admin write
-- ---------------------------------------------------------------------------
CREATE POLICY "returns_select" ON returns FOR SELECT USING (public.current_app_role() IN ('admin','analyst'));
CREATE POLICY "returns_write"  ON returns FOR ALL    USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- bank_transactions — admin only
-- Per BR-129 (financial data restrictions): cash position is admin-only.
-- ---------------------------------------------------------------------------
CREATE POLICY "bank_transactions_select" ON bank_transactions FOR SELECT USING (public.current_app_role() = 'admin');
CREATE POLICY "bank_transactions_write"  ON bank_transactions FOR ALL    USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- gateway_settlements — admin only
-- ---------------------------------------------------------------------------
CREATE POLICY "gateway_settlements_select" ON gateway_settlements FOR SELECT USING (public.current_app_role() = 'admin');
CREATE POLICY "gateway_settlements_write"  ON gateway_settlements FOR ALL    USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- purchase_orders, purchase_order_lines — analyst + admin read; admin write
-- ---------------------------------------------------------------------------
CREATE POLICY "purchase_orders_select" ON purchase_orders FOR SELECT USING (public.current_app_role() IN ('admin','analyst'));
CREATE POLICY "purchase_orders_write"  ON purchase_orders FOR ALL    USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');

CREATE POLICY "purchase_order_lines_select" ON purchase_order_lines FOR SELECT USING (public.current_app_role() IN ('admin','analyst'));
CREATE POLICY "purchase_order_lines_write"  ON purchase_order_lines FOR ALL    USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- launch_expenses — analyst + admin read/write
-- Per schema doc: "expenses, launch_expenses — analyst, admin — analyst, admin"
-- ---------------------------------------------------------------------------
CREATE POLICY "launch_expenses_select"       ON launch_expenses FOR SELECT USING  (public.current_app_role() IN ('admin','analyst'));
CREATE POLICY "launch_expenses_insert"       ON launch_expenses FOR INSERT WITH CHECK (public.current_app_role() IN ('admin','analyst'));
CREATE POLICY "launch_expenses_update"       ON launch_expenses FOR UPDATE USING  (public.current_app_role() IN ('admin','analyst')) WITH CHECK (public.current_app_role() IN ('admin','analyst'));
CREATE POLICY "launch_expenses_delete_admin" ON launch_expenses FOR DELETE USING  (public.current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- ad_campaigns — analyst + admin read; admin write
-- ---------------------------------------------------------------------------
CREATE POLICY "ad_campaigns_select" ON ad_campaigns FOR SELECT USING (public.current_app_role() IN ('admin','analyst'));
CREATE POLICY "ad_campaigns_write"  ON ad_campaigns FOR ALL    USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- ad_spend_daily — analyst + admin read; admin write
-- ---------------------------------------------------------------------------
CREATE POLICY "ad_spend_daily_select" ON ad_spend_daily FOR SELECT USING (public.current_app_role() IN ('admin','analyst'));
CREATE POLICY "ad_spend_daily_write"  ON ad_spend_daily FOR ALL    USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- expenses — analyst + admin read/write
-- ---------------------------------------------------------------------------
CREATE POLICY "expenses_select"       ON expenses FOR SELECT USING  (public.current_app_role() IN ('admin','analyst'));
CREATE POLICY "expenses_insert"       ON expenses FOR INSERT WITH CHECK (public.current_app_role() IN ('admin','analyst'));
CREATE POLICY "expenses_update"       ON expenses FOR UPDATE USING  (public.current_app_role() IN ('admin','analyst')) WITH CHECK (public.current_app_role() IN ('admin','analyst'));
CREATE POLICY "expenses_delete_admin" ON expenses FOR DELETE USING  (public.current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- kpi_daily_snapshot — all roles read; no user-facing writes (service role only)
-- ---------------------------------------------------------------------------
CREATE POLICY "kpi_daily_snapshot_select" ON kpi_daily_snapshot FOR SELECT USING (public.current_app_role() IN ('admin','analyst','viewer'));

-- ---------------------------------------------------------------------------
-- kpi_monthly_snapshot — all roles read; no user-facing writes (service role only)
-- ---------------------------------------------------------------------------
CREATE POLICY "kpi_monthly_snapshot_select" ON kpi_monthly_snapshot FOR SELECT USING (public.current_app_role() IN ('admin','analyst','viewer'));

-- ---------------------------------------------------------------------------
-- revenue_forecasts — analyst + admin read/write
-- ---------------------------------------------------------------------------
CREATE POLICY "revenue_forecasts_select" ON revenue_forecasts FOR SELECT USING  (public.current_app_role() IN ('admin','analyst'));
CREATE POLICY "revenue_forecasts_insert" ON revenue_forecasts FOR INSERT WITH CHECK (public.current_app_role() IN ('admin','analyst'));
CREATE POLICY "revenue_forecasts_update" ON revenue_forecasts FOR UPDATE USING  (public.current_app_role() IN ('admin','analyst')) WITH CHECK (public.current_app_role() IN ('admin','analyst'));

-- ---------------------------------------------------------------------------
-- cashflow_forecasts — analyst + admin read/write
-- ---------------------------------------------------------------------------
CREATE POLICY "cashflow_forecasts_select" ON cashflow_forecasts FOR SELECT USING  (public.current_app_role() IN ('admin','analyst'));
CREATE POLICY "cashflow_forecasts_insert" ON cashflow_forecasts FOR INSERT WITH CHECK (public.current_app_role() IN ('admin','analyst'));
CREATE POLICY "cashflow_forecasts_update" ON cashflow_forecasts FOR UPDATE USING  (public.current_app_role() IN ('admin','analyst')) WITH CHECK (public.current_app_role() IN ('admin','analyst'));

-- ---------------------------------------------------------------------------
-- inventory_forecasts — analyst + admin read/write
-- ---------------------------------------------------------------------------
CREATE POLICY "inventory_forecasts_select" ON inventory_forecasts FOR SELECT USING  (public.current_app_role() IN ('admin','analyst'));
CREATE POLICY "inventory_forecasts_insert" ON inventory_forecasts FOR INSERT WITH CHECK (public.current_app_role() IN ('admin','analyst'));
CREATE POLICY "inventory_forecasts_update" ON inventory_forecasts FOR UPDATE USING  (public.current_app_role() IN ('admin','analyst')) WITH CHECK (public.current_app_role() IN ('admin','analyst'));

-- ---------------------------------------------------------------------------
-- insights — all roles read; analyst + admin can dismiss; system inserts
-- ---------------------------------------------------------------------------
CREATE POLICY "insights_select"        ON insights FOR SELECT USING  (public.current_app_role() IN ('admin','analyst','viewer'));
CREATE POLICY "insights_update_dismiss"ON insights FOR UPDATE USING  (public.current_app_role() IN ('admin','analyst')) WITH CHECK (public.current_app_role() IN ('admin','analyst'));
CREATE POLICY "insights_delete_admin"  ON insights FOR DELETE USING  (public.current_app_role() = 'admin');

-- =============================================================================
-- END OF SCHEMA
-- =============================================================================
