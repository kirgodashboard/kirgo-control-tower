-- =============================================================================
-- Dynamic Integration Architecture — Phase 1 Schema
-- Migration: 20260620_integrations_schema.sql
-- Adds: integration_settings, sync_jobs, sync_runs, sync_errors
-- Adds: 3 read RPCs for the integration dashboard
-- Adds: seed data for 5 integrations + 9 sync jobs
--
-- Guardrails:
--   • No existing tables modified
--   • No existing RPCs modified
--   • All operations use IF NOT EXISTS / CREATE OR REPLACE
--   • Rollback procedure at bottom of file
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. integration_settings
--    One row per integration. Stores display config and connection state.
--    Credentials are NEVER stored here — secret_ref points to Supabase Vault.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS integration_settings (
  id                 serial       PRIMARY KEY,
  integration_key    text         NOT NULL UNIQUE
    CONSTRAINT integration_key_chk
      CHECK (integration_key IN ('woocommerce','shiprocket','razorpay','gokwik','bank_feed')),
  display_name       text         NOT NULL,
  description        text,
  logo_key           text,                        -- slug for frontend icon lookup
  is_enabled         boolean      NOT NULL DEFAULT false,
  base_url           text,                        -- source system base URL
  config             jsonb        NOT NULL DEFAULT '{}',
    -- non-sensitive: pagination_size, timezone, full_pull_from, etc.
  secret_ref         text,
    -- Supabase Vault secret name — raw keys NEVER stored in this column
  connection_status  text         NOT NULL DEFAULT 'unconfigured'
    CONSTRAINT integration_status_chk
      CHECK (connection_status IN ('unconfigured','ok','error','rate_limited')),
  last_tested_at     timestamptz,
  test_error         text,
  created_at         timestamptz  NOT NULL DEFAULT now(),
  updated_at         timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON TABLE  integration_settings IS 'One row per live API integration. Credentials stored in Supabase Vault only — secret_ref holds the vault key name.';
COMMENT ON COLUMN integration_settings.secret_ref IS 'Vault secret name. Edge function calls vault.decrypted_secrets at runtime. Never contains a raw API key.';
COMMENT ON COLUMN integration_settings.config IS 'Non-sensitive config: {"full_pull_from":"2023-01-01","pagination_size":100,"timezone":"Asia/Kolkata"}';


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. sync_jobs
--    One row per integration × entity_type.
--    Carries the incremental watermark. Updated only on success/partial runs.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_jobs (
  id              serial       PRIMARY KEY,
  integration_key text         NOT NULL
    REFERENCES integration_settings(integration_key) ON DELETE CASCADE,
  entity_type     text         NOT NULL,
    -- woocommerce: orders | products | customers
    -- shiprocket:  shipments | shipments_repair
    -- razorpay:    payments | settlements | refunds
    -- gokwik:      orders
    -- bank_feed:   transactions
  display_label   text         NOT NULL,           -- human-readable e.g. "Orders"
  is_active       boolean      NOT NULL DEFAULT true,
  sync_mode       text         NOT NULL DEFAULT 'incremental'
    CONSTRAINT sync_mode_chk CHECK (sync_mode IN ('incremental','full')),
  cron_schedule   text,                            -- null = manual only
  schedule_label  text,                            -- human-readable e.g. "Every 30 min"
  watermark_field text,                            -- API field used for incremental filter
  watermark_value text,                            -- last successfully synced value (ISO 8601 or ID)
  overlap_minutes int          NOT NULL DEFAULT 15, -- minutes to subtract from watermark on each run
  batch_size      int          NOT NULL DEFAULT 100,
  edge_fn_name    text         NOT NULL,           -- Supabase Edge Function to invoke
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),

  UNIQUE (integration_key, entity_type)
);

COMMENT ON TABLE  sync_jobs IS 'One row per integration × entity type. watermark_value advances only after a successful/partial run.';
COMMENT ON COLUMN sync_jobs.watermark_value IS 'NULL = never synced; triggers full historical pull from config.full_pull_from.';
COMMENT ON COLUMN sync_jobs.overlap_minutes IS 'Subtracted from watermark to handle API eventual consistency. Default 15 min.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. sync_runs
--    One row per execution of a sync_job. Full audit trail.
--    Watermark in sync_jobs advances only after this row reaches success/partial.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_runs (
  id                serial       PRIMARY KEY,
  sync_job_id       int          NOT NULL REFERENCES sync_jobs(id),
  integration_key   text         NOT NULL,
  entity_type       text         NOT NULL,
  triggered_by      text         NOT NULL DEFAULT 'schedule'
    CONSTRAINT triggered_by_chk
      CHECK (triggered_by IN ('schedule','manual','webhook')),
  status            text         NOT NULL DEFAULT 'running'
    CONSTRAINT sync_run_status_chk
      CHECK (status IN ('running','success','partial','failed')),
  started_at        timestamptz  NOT NULL DEFAULT now(),
  completed_at      timestamptz,
  duration_secs     numeric(10,2)
    GENERATED ALWAYS AS (
      EXTRACT(EPOCH FROM (completed_at - started_at))
    ) STORED,
  watermark_from    text,        -- watermark value at run start
  watermark_to      text,        -- watermark value at run end (written on success/partial)
  records_fetched   int          NOT NULL DEFAULT 0,
  records_inserted  int          NOT NULL DEFAULT 0,
  records_updated   int          NOT NULL DEFAULT 0,
  records_skipped   int          NOT NULL DEFAULT 0,  -- duplicates safely ignored
  records_failed    int          NOT NULL DEFAULT 0,
  error_summary     text,
  metadata          jsonb        NOT NULL DEFAULT '{}'
    -- {"api_calls":4,"page_count":4,"rate_limit_hits":0}
);

COMMENT ON TABLE  sync_runs IS 'Audit trail for every sync execution. Never modified after completion — immutable append-only log.';
COMMENT ON COLUMN sync_runs.duration_secs IS 'Computed: EXTRACT(EPOCH FROM completed_at - started_at). NULL while running.';
COMMENT ON COLUMN sync_runs.watermark_to IS 'Written when status transitions to success/partial. Copied to sync_jobs.watermark_value by the edge function.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. sync_errors
--    One row per record-level failure within a sync_run.
--    raw_payload preserved for manual retry or root-cause investigation.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_errors (
  id               serial       PRIMARY KEY,
  sync_run_id      int          NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
  integration_key  text         NOT NULL,
  entity_type      text         NOT NULL,
  source_id        text,        -- record ID in source system (order_id, awb_code, etc.)
  error_code       text         NOT NULL
    CONSTRAINT error_code_chk CHECK (error_code IN (
      'DUPLICATE_KEY','VALIDATION_FAILED','MISSING_REQUIRED_FIELD',
      'FOREIGN_KEY_MISS','RATE_LIMIT','AUTH_ERROR',
      'NETWORK_TIMEOUT','MAPPING_ERROR','UNKNOWN'
    )),
  error_message    text         NOT NULL,
  raw_payload      jsonb,       -- source record at time of failure (truncated >64 KB)
  resolved         boolean      NOT NULL DEFAULT false,
  created_at       timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON TABLE  sync_errors IS 'Per-record errors within a sync_run. raw_payload preserved for retry. Cascades delete when parent run deleted.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS sync_runs_job_id_idx       ON sync_runs (sync_job_id);
CREATE INDEX IF NOT EXISTS sync_runs_integration_idx  ON sync_runs (integration_key, started_at DESC);
CREATE INDEX IF NOT EXISTS sync_runs_status_idx       ON sync_runs (status);
CREATE INDEX IF NOT EXISTS sync_runs_started_at_idx   ON sync_runs (started_at DESC);

CREATE INDEX IF NOT EXISTS sync_errors_run_id_idx     ON sync_errors (sync_run_id);
CREATE INDEX IF NOT EXISTS sync_errors_source_id_idx  ON sync_errors (integration_key, source_id);
CREATE INDEX IF NOT EXISTS sync_errors_unresolved_idx ON sync_errors (sync_run_id) WHERE resolved = false;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Row-Level Security
--    Read: admin role via current_app_role()
--    Write: service role key (bypasses RLS) — used by Edge Functions and API routes
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE integration_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_jobs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_runs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_errors           ENABLE ROW LEVEL SECURITY;

-- integration_settings: admin read, no client writes
CREATE POLICY "integration_settings_select"
  ON integration_settings FOR SELECT
  USING (public.current_app_role() = 'admin');

-- sync_jobs: admin read only
CREATE POLICY "sync_jobs_select"
  ON sync_jobs FOR SELECT
  USING (public.current_app_role() = 'admin');

-- sync_runs: admin read only
CREATE POLICY "sync_runs_select"
  ON sync_runs FOR SELECT
  USING (public.current_app_role() = 'admin');

-- sync_errors: admin read only
CREATE POLICY "sync_errors_select"
  ON sync_errors FOR SELECT
  USING (public.current_app_role() = 'admin');


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Seed: integration_settings
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO integration_settings
  (integration_key, display_name, description, logo_key, is_enabled, config)
VALUES
  ('woocommerce', 'WooCommerce',
   'Pull orders, products, and customers from the WooCommerce store REST API',
   'woocommerce', false,
   '{"full_pull_from":"2023-01-01","pagination_size":100,"timezone":"Asia/Kolkata"}'::jsonb),

  ('shiprocket', 'Shiprocket',
   'Sync shipment status, AWB tracking, COD remittances, and RTO events',
   'shiprocket', false,
   '{"full_pull_from":"2023-01-01","pagination_size":50}'::jsonb),

  ('razorpay', 'Razorpay',
   'Sync prepaid payment records and settlement batches from Razorpay',
   'razorpay', false,
   '{"full_pull_from":"2023-01-01","pagination_size":100}'::jsonb),

  ('gokwik', 'GoKwik',
   'Sync GoKwik prepaid orders and gateway settlements',
   'gokwik', false,
   '{"full_pull_from":"2023-01-01","pagination_size":100}'::jsonb),

  ('bank_feed', 'Bank Feed',
   'Ingest HDFC bank transactions via Account Aggregator or statement upload',
   'bank', false,
   '{"full_pull_from":"2023-01-01","statement_format":"hdfc_csv"}'::jsonb)
ON CONFLICT (integration_key) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Seed: sync_jobs
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO sync_jobs
  (integration_key, entity_type, display_label, sync_mode,
   cron_schedule, schedule_label, watermark_field, overlap_minutes,
   batch_size, edge_fn_name)
VALUES
  -- WooCommerce
  ('woocommerce','orders','Orders','incremental',
   '*/30 * * * *','Every 30 min','date_modified',15,100,'sync-woocommerce'),

  ('woocommerce','products','Products','incremental',
   '0 2 * * *','Daily at 2 AM','date_modified',60,100,'sync-woocommerce'),

  ('woocommerce','customers','Customers','incremental',
   '0 3 * * *','Daily at 3 AM','date_modified',60,100,'sync-woocommerce'),

  -- Shiprocket
  ('shiprocket','shipments','Shipments','incremental',
   '*/30 * * * *','Every 30 min','updated_at',15,50,'sync-shiprocket'),

  ('shiprocket','shipments_repair','Shipments (30-day repair)','full',
   '0 1 * * 0','Weekly Sun 1 AM',NULL,0,50,'sync-shiprocket'),

  -- Razorpay
  ('razorpay','payments','Payments','incremental',
   '*/30 * * * *','Every 30 min','created_at',15,100,'sync-razorpay'),

  ('razorpay','settlements','Settlements','incremental',
   '0 6 * * *','Daily at 6 AM','created_at',60,100,'sync-razorpay'),

  -- GoKwik
  ('gokwik','orders','Orders','incremental',
   '*/30 * * * *','Every 30 min','created_at',15,100,'sync-gokwik'),

  -- Bank Feed (manual only — no automated ingestion until AA is configured)
  ('bank_feed','transactions','Bank Transactions','incremental',
   NULL,'Manual only','transaction_date',1440,500,'sync-bank-feed')
ON CONFLICT (integration_key, entity_type) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- 9. RPC: get_integration_summary
--    Returns one row per integration with aggregated sync run stats.
--    Used by /dashboard/integrations for the traffic-light status cards.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_integration_summary()
RETURNS TABLE (
  integration_key        text,
  display_name           text,
  description            text,
  is_enabled             boolean,
  connection_status      text,
  last_tested_at         timestamptz,
  active_job_count       bigint,
  -- last successful run
  last_success_at        timestamptz,
  last_success_inserted  bigint,
  last_success_updated   bigint,
  -- last failed run
  last_failure_at        timestamptz,
  last_failure_error     text,
  -- lifetime totals (all completed runs)
  total_records_inserted bigint,
  total_records_updated  bigint,
  total_records_failed   bigint,
  avg_duration_secs      numeric,
  -- latest run (any status)
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
    FROM   sync_jobs
    GROUP  BY integration_key
  ),
  run_agg AS (
    SELECT
      sr.integration_key,
      -- last success / failure timestamps
      MAX(sr.completed_at) FILTER (WHERE sr.status = 'success') AS last_success_at,
      MAX(sr.completed_at) FILTER (WHERE sr.status = 'failed')  AS last_failure_at,
      -- lifetime totals
      COALESCE(SUM(sr.records_inserted), 0) AS total_inserted,
      COALESCE(SUM(sr.records_updated),  0) AS total_updated,
      COALESCE(SUM(sr.records_failed),   0) AS total_failed,
      ROUND(
        AVG(sr.duration_secs) FILTER (WHERE sr.completed_at IS NOT NULL)::numeric, 1
      )                                                          AS avg_duration_secs
    FROM sync_runs sr
    GROUP BY sr.integration_key
  ),
  -- records from the single most-recent successful run (can't nest aggregates in FILTER)
  last_success AS (
    SELECT DISTINCT ON (integration_key)
      integration_key,
      records_inserted AS last_success_inserted,
      records_updated  AS last_success_updated
    FROM  sync_runs
    WHERE status = 'success'
    ORDER BY integration_key, completed_at DESC
  ),
  last_failure AS (
    SELECT DISTINCT ON (integration_key)
      integration_key,
      error_summary
    FROM  sync_runs
    WHERE status = 'failed'
    ORDER BY integration_key, started_at DESC
  ),
  latest_run AS (
    SELECT DISTINCT ON (integration_key)
      integration_key,
      id          AS latest_run_id,
      status      AS latest_run_status,
      started_at  AS latest_run_started,
      entity_type AS latest_run_entity
    FROM  sync_runs
    ORDER BY integration_key, started_at DESC
  )
  SELECT
    i.integration_key,
    i.display_name,
    i.description,
    i.is_enabled,
    i.connection_status,
    i.last_tested_at,
    COALESCE(jc.active_jobs, 0)            AS active_job_count,
    ra.last_success_at,
    COALESCE(ls.last_success_inserted, 0)  AS last_success_inserted,
    COALESCE(ls.last_success_updated,  0)  AS last_success_updated,
    ra.last_failure_at,
    lf.error_summary                       AS last_failure_error,
    COALESCE(ra.total_inserted, 0)         AS total_records_inserted,
    COALESCE(ra.total_updated,  0)         AS total_records_updated,
    COALESCE(ra.total_failed,   0)         AS total_records_failed,
    ra.avg_duration_secs,
    lr.latest_run_id,
    lr.latest_run_status,
    lr.latest_run_started,
    lr.latest_run_entity,
    (lr.latest_run_status = 'running')     AS latest_is_running
  FROM  integration_settings i
  LEFT  JOIN job_counts   jc ON jc.integration_key = i.integration_key
  LEFT  JOIN run_agg      ra ON ra.integration_key = i.integration_key
  LEFT  JOIN last_success ls ON ls.integration_key = i.integration_key
  LEFT  JOIN last_failure lf ON lf.integration_key = i.integration_key
  LEFT  JOIN latest_run   lr ON lr.integration_key = i.integration_key
  ORDER BY i.id;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 10. RPC: get_recent_sync_runs
--     Returns recent runs for the audit table on the integrations page.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_recent_sync_runs(
  p_integration_key text DEFAULT NULL,
  p_limit           int  DEFAULT 25
)
RETURNS TABLE (
  id               int,
  integration_key  text,
  display_name     text,
  entity_type      text,
  triggered_by     text,
  status           text,
  started_at       timestamptz,
  completed_at     timestamptz,
  duration_secs    numeric,
  records_fetched  int,
  records_inserted int,
  records_updated  int,
  records_skipped  int,
  records_failed   int,
  error_summary    text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
STABLE
AS $$
  SELECT
    sr.id,
    sr.integration_key,
    i.display_name,
    sr.entity_type,
    sr.triggered_by,
    sr.status,
    sr.started_at,
    sr.completed_at,
    sr.duration_secs,
    sr.records_fetched,
    sr.records_inserted,
    sr.records_updated,
    sr.records_skipped,
    sr.records_failed,
    sr.error_summary
  FROM  sync_runs sr
  JOIN  integration_settings i USING (integration_key)
  WHERE (p_integration_key IS NULL OR sr.integration_key = p_integration_key)
  ORDER BY sr.started_at DESC
  LIMIT p_limit;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 11. RPC: get_sync_jobs
--     Returns active sync jobs per integration for the manual trigger UI.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_sync_jobs(
  p_integration_key text DEFAULT NULL
)
RETURNS TABLE (
  id              int,
  integration_key text,
  entity_type     text,
  display_label   text,
  is_active       boolean,
  sync_mode       text,
  cron_schedule   text,
  schedule_label  text,
  watermark_value text,
  edge_fn_name    text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
STABLE
AS $$
  SELECT
    id, integration_key, entity_type, display_label,
    is_active, sync_mode, cron_schedule, schedule_label,
    watermark_value, edge_fn_name
  FROM  sync_jobs
  WHERE (p_integration_key IS NULL OR integration_key = p_integration_key)
    AND is_active = true
  ORDER BY integration_key, id;
$$;


-- =============================================================================
-- ROLLBACK PROCEDURE (run manually if needed — do NOT run automatically)
-- =============================================================================
-- DROP FUNCTION IF EXISTS get_sync_jobs(text);
-- DROP FUNCTION IF EXISTS get_recent_sync_runs(text, int);
-- DROP FUNCTION IF EXISTS get_integration_summary();
-- DROP TABLE IF EXISTS sync_errors          CASCADE;
-- DROP TABLE IF EXISTS sync_runs            CASCADE;
-- DROP TABLE IF EXISTS sync_jobs            CASCADE;
-- DROP TABLE IF EXISTS integration_settings CASCADE;
-- =============================================================================
