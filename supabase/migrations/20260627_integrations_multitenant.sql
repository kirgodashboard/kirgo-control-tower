-- ============================================================
-- Multi-tenant Integration Settings — Phase 2
--
-- 1. companies        — multi-tenant foundation (one row = Kirgo for now)
-- 2. company_id       — added to integration_settings + sync_jobs
-- 3. CCAvenue         — added to integration_key CHECK + seeded
-- 4. Multi-tenant UNIQUE constraint (company_id, integration_key)
-- 5. store_integration_secret()   — writes credentials to Vault
-- 6. get_integration_secret()     — reads decrypted creds from Vault
-- 7. toggle_integration_enabled() — enable / disable an integration
-- 8. update_integration_status()  — sets connection_status + last_tested_at
-- 9. get_integration_summary()    — updated for company_id filter
--
-- Non-destructive: no existing rows, tables, or functions removed.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. companies — multi-tenant root
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS companies (
  id         serial      PRIMARY KEY,
  name       text        NOT NULL,
  slug       text        NOT NULL UNIQUE,
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "companies_authenticated_select"
  ON companies FOR SELECT TO authenticated USING (true);
CREATE POLICY "companies_service_full"
  ON companies FOR ALL TO service_role USING (true);

INSERT INTO companies (id, name, slug)
VALUES (1, 'Kirgo', 'kirgo')
ON CONFLICT (id) DO NOTHING;


-- ─────────────────────────────────────────────────────────────
-- 2. Add company_id to integration_settings
-- ─────────────────────────────────────────────────────────────
ALTER TABLE integration_settings
  ADD COLUMN IF NOT EXISTS company_id int REFERENCES companies(id) DEFAULT 1;

-- Backfill existing rows
UPDATE integration_settings SET company_id = 1 WHERE company_id IS NULL;

-- Make NOT NULL after backfill
ALTER TABLE integration_settings
  ALTER COLUMN company_id SET NOT NULL,
  ALTER COLUMN company_id SET DEFAULT 1;

-- 3. Extend CHECK constraint to include 'ccavenue'
ALTER TABLE integration_settings
  DROP CONSTRAINT IF EXISTS integration_key_chk;
ALTER TABLE integration_settings
  ADD CONSTRAINT integration_key_chk
    CHECK (integration_key IN ('woocommerce','shiprocket','razorpay','gokwik','bank_feed','ccavenue'));

-- 4. Replace UNIQUE(integration_key) with UNIQUE(company_id, integration_key)
ALTER TABLE integration_settings
  DROP CONSTRAINT IF EXISTS integration_settings_integration_key_key;
ALTER TABLE integration_settings
  ADD CONSTRAINT integration_settings_company_key_unique
    UNIQUE (company_id, integration_key);


-- ─────────────────────────────────────────────────────────────
-- 5. Add company_id to sync_jobs
-- ─────────────────────────────────────────────────────────────
ALTER TABLE sync_jobs
  ADD COLUMN IF NOT EXISTS company_id int REFERENCES companies(id) DEFAULT 1;
UPDATE sync_jobs SET company_id = 1 WHERE company_id IS NULL;
ALTER TABLE sync_jobs ALTER COLUMN company_id SET NOT NULL, ALTER COLUMN company_id SET DEFAULT 1;


-- ─────────────────────────────────────────────────────────────
-- 6. Seed CCAvenue integration
-- ─────────────────────────────────────────────────────────────
INSERT INTO integration_settings
  (integration_key, display_name, description, logo_key, is_enabled, company_id, config)
VALUES
  ('ccavenue', 'CCAvenue',
   'Sync CCAvenue payment gateway transactions and settlements',
   'ccavenue', false, 1,
   '{"full_pull_from":"2023-01-01","pagination_size":100}'::jsonb)
ON CONFLICT (company_id, integration_key) DO NOTHING;

INSERT INTO sync_jobs
  (integration_key, entity_type, display_label, sync_mode,
   cron_schedule, schedule_label, watermark_field, overlap_minutes,
   batch_size, edge_fn_name, company_id)
VALUES
  ('ccavenue', 'transactions', 'Transactions', 'incremental',
   '*/30 * * * *', 'Every 30 min', 'created_at', 15, 100, 'sync-ccavenue', 1)
ON CONFLICT (integration_key, entity_type) DO NOTHING;


-- ─────────────────────────────────────────────────────────────
-- 7. store_integration_secret()
--    Writes credentials JSON to Supabase Vault.
--    Returns the secret name used as secret_ref.
--    Safe to call multiple times — updates existing secret if present.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION store_integration_secret(
  p_integration_key text,
  p_credentials_json jsonb,
  p_company_id int DEFAULT 1
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault
AS $$
DECLARE
  v_secret_name text;
  v_existing    uuid;
BEGIN
  v_secret_name := format('integration_%s_c%s', p_integration_key, p_company_id);

  -- Check if a vault secret already exists with this name
  SELECT id INTO v_existing
  FROM vault.secrets
  WHERE name = v_secret_name
  LIMIT 1;

  IF v_existing IS NULL THEN
    -- Create new vault secret
    PERFORM vault.create_secret(
      p_credentials_json::text,
      v_secret_name,
      format('Credentials for %s (company_id=%s)', p_integration_key, p_company_id)
    );
  ELSE
    -- Update existing vault secret
    UPDATE vault.secrets
    SET    secret = p_credentials_json::text
    WHERE  id = v_existing;
  END IF;

  -- Record the secret_ref in integration_settings
  UPDATE integration_settings
  SET    secret_ref  = v_secret_name,
         updated_at  = now()
  WHERE  integration_key = p_integration_key
    AND  company_id = p_company_id;

  RETURN v_secret_name;
END;
$$;

GRANT EXECUTE ON FUNCTION store_integration_secret(text, jsonb, int) TO authenticated;


-- ─────────────────────────────────────────────────────────────
-- 8. get_integration_secret()
--    Reads decrypted credentials from Vault.
--    Returns NULL if secret_ref not set or secret not found.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_integration_secret(
  p_integration_key text,
  p_company_id int DEFAULT 1
)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public, vault
STABLE
AS $$
  SELECT ds.decrypted_secret::jsonb
  FROM   vault.decrypted_secrets ds
  JOIN   integration_settings   i
         ON i.secret_ref = ds.name
  WHERE  i.integration_key = p_integration_key
    AND  i.company_id = p_company_id
  LIMIT  1;
$$;

GRANT EXECUTE ON FUNCTION get_integration_secret(text, int) TO authenticated;


-- ─────────────────────────────────────────────────────────────
-- 9. toggle_integration_enabled()
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION toggle_integration_enabled(
  p_integration_key text,
  p_is_enabled boolean,
  p_company_id int DEFAULT 1
)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  UPDATE integration_settings
  SET    is_enabled = p_is_enabled,
         updated_at = now()
  WHERE  integration_key = p_integration_key
    AND  company_id = p_company_id;
$$;

GRANT EXECUTE ON FUNCTION toggle_integration_enabled(text, boolean, int) TO authenticated;


-- ─────────────────────────────────────────────────────────────
-- 10. update_integration_status()
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_integration_status(
  p_integration_key text,
  p_status text,
  p_error text DEFAULT NULL,
  p_company_id int DEFAULT 1
)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  UPDATE integration_settings
  SET    connection_status = p_status,
         last_tested_at   = now(),
         test_error       = p_error,
         updated_at       = now()
  WHERE  integration_key  = p_integration_key
    AND  company_id       = p_company_id;
$$;

GRANT EXECUTE ON FUNCTION update_integration_status(text, text, text, int) TO authenticated;


-- ─────────────────────────────────────────────────────────────
-- 11. get_integration_summary() — updated with company_id filter
--     Default p_company_id = 1 keeps existing callers working.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_integration_summary(
  p_company_id int DEFAULT 1
)
RETURNS TABLE (
  integration_key        text,
  display_name           text,
  description            text,
  is_enabled             boolean,
  connection_status      text,
  last_tested_at         timestamptz,
  secret_configured      boolean,
  active_job_count       bigint,
  last_success_at        timestamptz,
  last_success_inserted  bigint,
  last_success_updated   bigint,
  last_failure_at        timestamptz,
  last_failure_error     text,
  total_records_inserted bigint,
  total_records_updated  bigint,
  total_records_failed   bigint,
  avg_duration_secs      numeric,
  latest_run_id          int,
  latest_run_status      text,
  latest_run_started     timestamptz,
  latest_run_entity      text,
  latest_is_running      boolean
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
STABLE
AS $$
  WITH job_counts AS (
    SELECT integration_key, COUNT(*) FILTER (WHERE is_active) AS active_jobs
    FROM   sync_jobs WHERE company_id = p_company_id
    GROUP  BY integration_key
  ),
  run_agg AS (
    SELECT
      sr.integration_key,
      MAX(sr.completed_at) FILTER (WHERE sr.status = 'success') AS last_success_at,
      MAX(sr.completed_at) FILTER (WHERE sr.status = 'failed')  AS last_failure_at,
      COALESCE(SUM(sr.records_inserted), 0) AS total_inserted,
      COALESCE(SUM(sr.records_updated),  0) AS total_updated,
      COALESCE(SUM(sr.records_failed),   0) AS total_failed,
      ROUND(AVG(sr.duration_secs) FILTER (WHERE sr.completed_at IS NOT NULL)::numeric, 1) AS avg_duration_secs
    FROM sync_runs sr
    JOIN integration_settings i ON i.integration_key = sr.integration_key AND i.company_id = p_company_id
    GROUP BY sr.integration_key
  ),
  last_success AS (
    SELECT DISTINCT ON (sr.integration_key)
      sr.integration_key, sr.records_inserted AS last_success_inserted, sr.records_updated AS last_success_updated
    FROM  sync_runs sr
    JOIN  integration_settings i ON i.integration_key = sr.integration_key AND i.company_id = p_company_id
    WHERE sr.status = 'success'
    ORDER BY sr.integration_key, sr.completed_at DESC
  ),
  last_failure AS (
    SELECT DISTINCT ON (sr.integration_key)
      sr.integration_key, sr.error_summary
    FROM  sync_runs sr
    JOIN  integration_settings i ON i.integration_key = sr.integration_key AND i.company_id = p_company_id
    WHERE sr.status = 'failed'
    ORDER BY sr.integration_key, sr.started_at DESC
  ),
  latest_run AS (
    SELECT DISTINCT ON (sr.integration_key)
      sr.integration_key, sr.id AS latest_run_id, sr.status AS latest_run_status,
      sr.started_at AS latest_run_started, sr.entity_type AS latest_run_entity
    FROM  sync_runs sr
    JOIN  integration_settings i ON i.integration_key = sr.integration_key AND i.company_id = p_company_id
    ORDER BY sr.integration_key, sr.started_at DESC
  )
  SELECT
    i.integration_key,
    i.display_name,
    i.description,
    i.is_enabled,
    i.connection_status,
    i.last_tested_at,
    (i.secret_ref IS NOT NULL)               AS secret_configured,
    COALESCE(jc.active_jobs, 0)              AS active_job_count,
    ra.last_success_at,
    COALESCE(ls.last_success_inserted, 0)    AS last_success_inserted,
    COALESCE(ls.last_success_updated,  0)    AS last_success_updated,
    ra.last_failure_at,
    lf.error_summary                         AS last_failure_error,
    COALESCE(ra.total_inserted, 0)           AS total_records_inserted,
    COALESCE(ra.total_updated,  0)           AS total_records_updated,
    COALESCE(ra.total_failed,   0)           AS total_records_failed,
    ra.avg_duration_secs,
    lr.latest_run_id,
    lr.latest_run_status,
    lr.latest_run_started,
    lr.latest_run_entity,
    (lr.latest_run_status = 'running')       AS latest_is_running
  FROM  integration_settings i
  LEFT  JOIN job_counts   jc ON jc.integration_key = i.integration_key
  LEFT  JOIN run_agg      ra ON ra.integration_key = i.integration_key
  LEFT  JOIN last_success ls ON ls.integration_key = i.integration_key
  LEFT  JOIN last_failure lf ON lf.integration_key = i.integration_key
  LEFT  JOIN latest_run   lr ON lr.integration_key = i.integration_key
  WHERE i.company_id = p_company_id
  ORDER BY i.id;
$$;

GRANT EXECUTE ON FUNCTION get_integration_summary(int) TO anon, authenticated;
