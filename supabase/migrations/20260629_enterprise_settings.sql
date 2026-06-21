-- =============================================================================
-- Enterprise Settings Platform — Schema
-- Migration: 20260629_enterprise_settings.sql
-- Adds: company_settings, user_roles, notification_preferences tables
-- Adds: RPCs for company settings, user management, system info, notifications
-- Guardrails: Never DROP existing tables; only ADD new tables and RPCs
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. company_settings
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_settings (
  id                    serial       PRIMARY KEY,
  company_id            int          NOT NULL DEFAULT 1 REFERENCES companies(id),
  company_name          text         NOT NULL DEFAULT 'My Company',
  brand_name            text,
  logo_url              text,
  gst_number            text,
  pan_number            text,
  financial_year_start  int          NOT NULL DEFAULT 4,  -- 1–12, month number
  currency              text         NOT NULL DEFAULT 'INR',
  timezone              text         NOT NULL DEFAULT 'Asia/Kolkata',
  address_line1         text,
  address_line2         text,
  city                  text,
  state                 text,
  pincode               text,
  country               text         NOT NULL DEFAULT 'India',
  support_email         text,
  created_at            timestamptz  NOT NULL DEFAULT now(),
  updated_at            timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (company_id)
);

ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_settings_authenticated_select" ON company_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "company_settings_service_role_all" ON company_settings
  FOR ALL TO service_role USING (true);

-- Seed default row
INSERT INTO company_settings
  (company_id, company_name, brand_name, currency, timezone, support_email)
VALUES
  (1, 'Kirgo', 'Kirgo', 'INR', 'Asia/Kolkata', 'hello@kirgo.in')
ON CONFLICT (company_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. user_roles
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_roles (
  id           serial       PRIMARY KEY,
  company_id   int          NOT NULL DEFAULT 1 REFERENCES companies(id),
  email        text         NOT NULL,
  full_name    text,
  role         text         NOT NULL DEFAULT 'viewer'
    CHECK (role IN ('super_admin','admin','finance','operations','viewer')),
  is_active    boolean      NOT NULL DEFAULT true,
  invited_by   text,
  invited_at   timestamptz  NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  created_at   timestamptz  NOT NULL DEFAULT now(),
  updated_at   timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (company_id, email)
);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles_authenticated_select" ON user_roles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "user_roles_service_role_all" ON user_roles
  FOR ALL TO service_role USING (true);

-- Seed default admin user
INSERT INTO user_roles (company_id, email, full_name, role, is_active, invited_by)
VALUES (1, 'jiten65.b@gmail.com', 'Jiten Bajpai', 'super_admin', true, 'system')
ON CONFLICT (company_id, email) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. notification_preferences
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_preferences (
  id                serial       PRIMARY KEY,
  company_id        int          NOT NULL DEFAULT 1 REFERENCES companies(id),
  notification_type text         NOT NULL,
  label             text         NOT NULL,
  channel           text         NOT NULL DEFAULT 'email'
    CHECK (channel IN ('email','slack','webhook')),
  is_enabled        boolean      NOT NULL DEFAULT true,
  threshold_value   numeric,
  recipients        text[],
  webhook_url       text,
  created_at        timestamptz  NOT NULL DEFAULT now(),
  updated_at        timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (company_id, notification_type, channel)
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification_prefs_authenticated_select" ON notification_preferences
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "notification_prefs_service_role_all" ON notification_preferences
  FOR ALL TO service_role USING (true);

-- Seed default notification preferences
INSERT INTO notification_preferences
  (company_id, notification_type, label, channel, is_enabled, recipients)
VALUES
  (1, 'sync_failed',           'Sync Failure Alert',           'email', true,  ARRAY['jiten65.b@gmail.com']),
  (1, 'revenue_variance',      'Revenue Variance Alert',       'email', true,  ARRAY['jiten65.b@gmail.com']),
  (1, 'cod_variance',          'COD Variance Alert',           'email', true,  ARRAY['jiten65.b@gmail.com']),
  (1, 'unclassified_expenses', 'Unclassified Expenses Digest', 'email', false, ARRAY['jiten65.b@gmail.com']),
  (1, 'low_stock',             'Low Stock Warning',            'email', false, ARRAY['jiten65.b@gmail.com']),
  (1, 'daily_summary',         'Daily P&L Summary',            'email', true,  ARRAY['jiten65.b@gmail.com'])
ON CONFLICT (company_id, notification_type, channel) DO NOTHING;


-- =============================================================================
-- RPCs
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- get_company_settings
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_company_settings(p_company_id int DEFAULT 1)
RETURNS SETOF company_settings
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM company_settings WHERE company_id = p_company_id LIMIT 1;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- upsert_company_settings
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION upsert_company_settings(
  p_company_id           int     DEFAULT 1,
  p_company_name         text    DEFAULT NULL,
  p_brand_name           text    DEFAULT NULL,
  p_logo_url             text    DEFAULT NULL,
  p_gst_number           text    DEFAULT NULL,
  p_pan_number           text    DEFAULT NULL,
  p_financial_year_start int     DEFAULT NULL,
  p_currency             text    DEFAULT NULL,
  p_timezone             text    DEFAULT NULL,
  p_address_line1        text    DEFAULT NULL,
  p_address_line2        text    DEFAULT NULL,
  p_city                 text    DEFAULT NULL,
  p_state                text    DEFAULT NULL,
  p_pincode              text    DEFAULT NULL,
  p_country              text    DEFAULT NULL,
  p_support_email        text    DEFAULT NULL
)
RETURNS SETOF company_settings
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO company_settings
    (company_id, company_name, brand_name, logo_url, gst_number, pan_number,
     financial_year_start, currency, timezone,
     address_line1, address_line2, city, state, pincode, country, support_email, updated_at)
  VALUES
    (p_company_id,
     COALESCE(p_company_name,         'My Company'),
     p_brand_name, p_logo_url,
     p_gst_number, p_pan_number,
     COALESCE(p_financial_year_start, 4),
     COALESCE(p_currency,             'INR'),
     COALESCE(p_timezone,             'Asia/Kolkata'),
     p_address_line1, p_address_line2, p_city, p_state, p_pincode,
     COALESCE(p_country, 'India'),
     p_support_email,
     now())
  ON CONFLICT (company_id) DO UPDATE SET
    company_name         = COALESCE(EXCLUDED.company_name,         company_settings.company_name),
    brand_name           = COALESCE(EXCLUDED.brand_name,           company_settings.brand_name),
    logo_url             = COALESCE(EXCLUDED.logo_url,             company_settings.logo_url),
    gst_number           = EXCLUDED.gst_number,
    pan_number           = EXCLUDED.pan_number,
    financial_year_start = COALESCE(EXCLUDED.financial_year_start, company_settings.financial_year_start),
    currency             = COALESCE(EXCLUDED.currency,             company_settings.currency),
    timezone             = COALESCE(EXCLUDED.timezone,             company_settings.timezone),
    address_line1        = EXCLUDED.address_line1,
    address_line2        = EXCLUDED.address_line2,
    city                 = EXCLUDED.city,
    state                = EXCLUDED.state,
    pincode              = EXCLUDED.pincode,
    country              = COALESCE(EXCLUDED.country,              company_settings.country),
    support_email        = EXCLUDED.support_email,
    updated_at           = now();

  RETURN QUERY SELECT * FROM company_settings WHERE company_id = p_company_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_user_roles
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_user_roles(p_company_id int DEFAULT 1)
RETURNS SETOF user_roles
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM user_roles WHERE company_id = p_company_id ORDER BY created_at;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- upsert_user_role
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION upsert_user_role(
  p_company_id int     DEFAULT 1,
  p_email      text    DEFAULT NULL,
  p_full_name  text    DEFAULT NULL,
  p_role       text    DEFAULT 'viewer',
  p_is_active  boolean DEFAULT true
)
RETURNS SETOF user_roles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO user_roles (company_id, email, full_name, role, is_active, invited_at)
  VALUES (p_company_id, p_email, p_full_name, p_role, p_is_active, now())
  ON CONFLICT (company_id, email) DO UPDATE SET
    full_name  = COALESCE(EXCLUDED.full_name, user_roles.full_name),
    role       = EXCLUDED.role,
    is_active  = EXCLUDED.is_active,
    updated_at = now();

  RETURN QUERY SELECT * FROM user_roles WHERE company_id = p_company_id AND email = p_email;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_notification_preferences
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_notification_preferences(p_company_id int DEFAULT 1)
RETURNS SETOF notification_preferences
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM notification_preferences WHERE company_id = p_company_id ORDER BY notification_type;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- upsert_notification_preference
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION upsert_notification_preference(
  p_company_id        int       DEFAULT 1,
  p_notification_type text      DEFAULT NULL,
  p_channel           text      DEFAULT 'email',
  p_is_enabled        boolean   DEFAULT true,
  p_threshold_value   numeric   DEFAULT NULL,
  p_recipients        text[]    DEFAULT NULL,
  p_webhook_url       text      DEFAULT NULL
)
RETURNS SETOF notification_preferences
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE notification_preferences SET
    is_enabled      = p_is_enabled,
    threshold_value = COALESCE(p_threshold_value, threshold_value),
    recipients      = COALESCE(p_recipients,      recipients),
    webhook_url     = COALESCE(p_webhook_url,      webhook_url),
    updated_at      = now()
  WHERE company_id = p_company_id
    AND notification_type = p_notification_type
    AND channel = p_channel;

  RETURN QUERY SELECT * FROM notification_preferences
    WHERE company_id = p_company_id
      AND notification_type = p_notification_type
      AND channel = p_channel;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_system_info
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_system_info()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_table_count  int;
  v_active_jobs  int;
  v_running_jobs int;
  v_db_size      text;
BEGIN
  SELECT COUNT(*) INTO v_table_count
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

  SELECT COUNT(*) INTO v_active_jobs FROM sync_jobs WHERE is_active = true;

  SELECT COUNT(*) INTO v_running_jobs FROM sync_runs
    WHERE status = 'running' AND started_at > now() - interval '1 hour';

  v_db_size := pg_size_pretty(pg_database_size(current_database()));

  RETURN jsonb_build_object(
    'app_version',   '1.0.0',
    'db_version',    current_setting('server_version'),
    'table_count',   v_table_count,
    'active_jobs',   v_active_jobs,
    'running_jobs',  v_running_jobs,
    'db_size',       v_db_size,
    'server_time',   now()
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_settings_data_quality  — action-item view for the settings page
-- Returns counts of things that need attention
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_settings_data_quality(p_company_id int DEFAULT 1)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_unclassified_bank   int := 0;
  v_unclassified_exp    int := 0;
  v_failed_syncs        int := 0;
  v_missing_cost        int := 0;
  v_no_shipment_orders  int := 0;
BEGIN
  -- Unclassified bank transactions (withdrawals with no expense)
  SELECT COUNT(*) INTO v_unclassified_bank
    FROM bank_transactions
    WHERE expense_id IS NULL AND withdrawal_inr > 0;

  -- Unclassified expenses (no head assigned)
  SELECT COUNT(*) INTO v_unclassified_exp
    FROM expenses
    WHERE expense_head IS NULL OR expense_head = '';

  -- Failed syncs in last 7 days
  SELECT COUNT(*) INTO v_failed_syncs
    FROM sync_runs
    WHERE status = 'failed' AND started_at > now() - interval '7 days';

  -- Products with no cost price
  SELECT COUNT(*) INTO v_missing_cost
    FROM products p
    LEFT JOIN product_costs pc ON pc.product_id = p.id
    WHERE pc.id IS NULL;

  -- Orders with no shipment (shipped orders without AWB)
  SELECT COUNT(*) INTO v_no_shipment_orders
    FROM orders o
    LEFT JOIN shipments s ON s.order_id = o.id
    WHERE o.status IN ('processing','on-hold') AND s.id IS NULL
      AND o.ordered_at > now() - interval '30 days';

  RETURN jsonb_build_object(
    'unclassified_bank_tx',    v_unclassified_bank,
    'unclassified_expenses',   v_unclassified_exp,
    'failed_syncs_7d',         v_failed_syncs,
    'products_missing_cost',   v_missing_cost,
    'orders_without_shipment', v_no_shipment_orders
  );
END;
$$;
