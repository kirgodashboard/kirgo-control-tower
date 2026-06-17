-- =============================================================================
-- Migration: import_runs + import_errors (Domain 8 — Import Tracking)
-- Schema version: v2.2
-- Safe to run against the current database; uses IF NOT EXISTS throughout.
-- Does NOT touch any existing table.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. import_runs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS import_runs (
  id                      serial        NOT NULL,
  source                  text          NOT NULL,
  source_file             text,
  source_sheet            text,
  run_started_at          timestamptz   NOT NULL DEFAULT now(),
  run_completed_at        timestamptz,
  status                  text          NOT NULL DEFAULT 'running',
  rows_in_source          int,
  rows_imported           int           NOT NULL DEFAULT 0,
  rows_skipped_duplicate  int           NOT NULL DEFAULT 0,
  rows_failed             int           NOT NULL DEFAULT 0,
  rows_warnings           int           NOT NULL DEFAULT 0,
  reconciliation_status   text          NOT NULL DEFAULT 'pending',
  reconciliation_run_at   timestamptz,
  reconciliation_notes    text,
  hard_checks_passed      int,
  hard_checks_failed      int,
  soft_checks_passed      int,
  soft_checks_warned      int,
  triggered_by            int,
  error_summary           text,
  notes                   text,
  created_at              timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT import_runs_pkey        PRIMARY KEY (id),
  CONSTRAINT import_runs_user_fk     FOREIGN KEY (triggered_by) REFERENCES users (id),
  CONSTRAINT import_runs_status_chk  CHECK (status IN ('running','completed','failed','partial')),
  CONSTRAINT import_runs_recon_chk   CHECK (reconciliation_status IN ('pending','passed','failed','flagged','skipped')),
  CONSTRAINT import_runs_source_chk  CHECK (source IN (
    'woocommerce','shiprocket','returns','purchase_invoices','bank_statement','marketing_spend'
  )),
  CONSTRAINT import_runs_counts_pos  CHECK (
    rows_imported >= 0 AND rows_skipped_duplicate >= 0 AND rows_failed >= 0 AND rows_warnings >= 0
  )
);

COMMENT ON TABLE  import_runs IS 'One row per import pipeline execution. '
                                  'Tracks row counts (imported / skipped / failed / warned) and reconciliation outcome. '
                                  'Admin-only read; service role key writes during pipeline execution.';
COMMENT ON COLUMN import_runs.source IS 'woocommerce | shiprocket | returns | purchase_invoices | bank_statement | marketing_spend';
COMMENT ON COLUMN import_runs.status IS 'running → completed | partial | failed. '
                                        'partial = some rows failed; others imported. '
                                        'failed = fatal error; no rows written.';
COMMENT ON COLUMN import_runs.reconciliation_status IS 'pending → passed | flagged | failed | skipped. '
                                                       'failed blocks KPI snapshot computation. '
                                                       'flagged = SOFT warns present; HARD checks passed; KPI compute allowed.';
COMMENT ON COLUMN import_runs.rows_skipped_duplicate IS 'Rows that matched an existing dedup key and were intentionally skipped — not an error.';
COMMENT ON COLUMN import_runs.rows_warnings IS 'Rows imported but written to import_errors with severity = warning.';

-- ---------------------------------------------------------------------------
-- 2. import_errors
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS import_errors (
  id                    serial        NOT NULL,
  import_run_id         int           NOT NULL,
  row_number            int,
  source_row_snapshot   jsonb,
  error_code            text          NOT NULL,
  error_message         text          NOT NULL,
  severity              text          NOT NULL DEFAULT 'error',
  field_name            text,
  field_value_raw       text,
  resolution_status     text          NOT NULL DEFAULT 'unresolved',
  resolved_by           int,
  resolved_at           timestamptz,
  resolution_notes      text,
  created_at            timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT import_errors_pkey         PRIMARY KEY (id),
  CONSTRAINT import_errors_run_fk       FOREIGN KEY (import_run_id) REFERENCES import_runs (id),
  CONSTRAINT import_errors_user_fk      FOREIGN KEY (resolved_by)   REFERENCES users        (id),
  CONSTRAINT import_errors_severity_chk CHECK (severity IN ('error','warning','info')),
  CONSTRAINT import_errors_status_chk   CHECK (resolution_status IN ('unresolved','resolved','ignored','deferred')),
  CONSTRAINT import_errors_resolve_pair CHECK (
    (resolution_status IN ('unresolved','deferred'))
    OR (resolution_status IN ('resolved','ignored') AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)
  )
);

COMMENT ON TABLE  import_errors IS 'One row per rejected or flagged source row from any import run. '
                                    'source_row_snapshot preserves the full original row as JSON for re-import after fix. '
                                    'Admin-only read; service role key writes during pipeline execution.';
COMMENT ON COLUMN import_errors.error_code IS 'Machine-readable code. 24 codes defined in IMPORT_STATUS_TRACKING.md §Error Code Reference.';
COMMENT ON COLUMN import_errors.source_row_snapshot IS 'Full JSON copy of the source row at the time of import. Never modified after insert.';
COMMENT ON COLUMN import_errors.severity IS 'error = row excluded from DB. warning = row imported with DQ flag. info = expected skip (duplicate).';

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS import_runs_source_idx       ON import_runs (source);
CREATE INDEX IF NOT EXISTS import_runs_status_idx       ON import_runs (status);
CREATE INDEX IF NOT EXISTS import_runs_started_at_idx   ON import_runs (run_started_at DESC);
CREATE INDEX IF NOT EXISTS import_runs_recon_status_idx ON import_runs (reconciliation_status);
CREATE INDEX IF NOT EXISTS import_runs_triggered_by_idx ON import_runs (triggered_by);

CREATE INDEX IF NOT EXISTS import_errors_run_id_idx     ON import_errors (import_run_id);
CREATE INDEX IF NOT EXISTS import_errors_error_code_idx ON import_errors (error_code);
CREATE INDEX IF NOT EXISTS import_errors_severity_idx   ON import_errors (severity);
CREATE INDEX IF NOT EXISTS import_errors_resolution_idx ON import_errors (resolution_status);
CREATE INDEX IF NOT EXISTS import_errors_unresolved_idx ON import_errors (import_run_id, error_code)
  WHERE resolution_status = 'unresolved';

-- ---------------------------------------------------------------------------
-- 4. Row-Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE import_runs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_errors ENABLE ROW LEVEL SECURITY;

-- import_runs: admin only (service role bypasses RLS for pipeline writes)
CREATE POLICY "import_runs_select_admin" ON import_runs
  FOR SELECT USING  (public.current_app_role() = 'admin');
CREATE POLICY "import_runs_insert_admin" ON import_runs
  FOR INSERT WITH CHECK (public.current_app_role() = 'admin');
CREATE POLICY "import_runs_update_admin" ON import_runs
  FOR UPDATE USING  (public.current_app_role() = 'admin')
             WITH CHECK (public.current_app_role() = 'admin');
CREATE POLICY "import_runs_delete_admin" ON import_runs
  FOR DELETE USING  (public.current_app_role() = 'admin');

-- import_errors: admin only
CREATE POLICY "import_errors_select_admin" ON import_errors
  FOR SELECT USING  (public.current_app_role() = 'admin');
CREATE POLICY "import_errors_insert_admin" ON import_errors
  FOR INSERT WITH CHECK (public.current_app_role() = 'admin');
CREATE POLICY "import_errors_update_admin" ON import_errors
  FOR UPDATE USING  (public.current_app_role() = 'admin')
             WITH CHECK (public.current_app_role() = 'admin');
CREATE POLICY "import_errors_delete_admin" ON import_errors
  FOR DELETE USING  (public.current_app_role() = 'admin');
