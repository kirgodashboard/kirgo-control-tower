-- ════════════════════════════════════════════════════════════════════
-- EMAIL IMPORT FRAMEWORK (Part D5/D6) — multi-tenant, idempotent
-- email_imports → email_attachments → import_batches
-- Reuses existing import_errors + settlement_imports.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS email_imports (
  id                SERIAL PRIMARY KEY,
  company_id        INT  NOT NULL DEFAULT 1,
  email_message_id  TEXT NOT NULL,
  sender            TEXT,
  subject           TEXT,
  received_at       TIMESTAMPTZ,
  detected_source   TEXT,
  status            TEXT NOT NULL DEFAULT 'received'
                      CHECK (status IN ('received','processing','processed','failed','ignored','archived')),
  attachment_count  INT DEFAULT 0,
  error_summary     TEXT,
  raw_headers       JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at      TIMESTAMPTZ,
  UNIQUE (company_id, email_message_id)
);

CREATE TABLE IF NOT EXISTS email_attachments (
  id              SERIAL PRIMARY KEY,
  email_import_id INT  NOT NULL REFERENCES email_imports(id) ON DELETE CASCADE,
  company_id      INT  NOT NULL DEFAULT 1,
  filename        TEXT NOT NULL,
  content_type    TEXT,
  size_bytes      INT,
  content_hash    TEXT NOT NULL,
  detected_source TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','parsed','imported','duplicate','failed','skipped')),
  storage_path    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, content_hash)
);

CREATE TABLE IF NOT EXISTS import_batches (
  id                    SERIAL PRIMARY KEY,
  company_id            INT  NOT NULL DEFAULT 1,
  source                TEXT NOT NULL,
  origin                TEXT NOT NULL DEFAULT 'email' CHECK (origin IN ('email','manual','api')),
  email_attachment_id   INT REFERENCES email_attachments(id) ON DELETE SET NULL,
  settlement_import_id  INT REFERENCES settlement_imports(id) ON DELETE SET NULL,
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','validating','importing','reconciling','completed','failed')),
  records_total         INT DEFAULT 0,
  records_imported      INT DEFAULT 0,
  records_duplicate     INT DEFAULT 0,
  records_failed        INT DEFAULT 0,
  reconciliation_status TEXT,
  reconciliation_summary JSONB,
  error_summary         TEXT,
  started_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_email_attachments_import ON email_attachments(email_import_id);
CREATE INDEX IF NOT EXISTS idx_import_batches_source ON import_batches(company_id, source, started_at DESC);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['email_imports','email_attachments','import_batches'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write  ON %I', t, t);
    EXECUTE format('CREATE POLICY %I_select ON %I FOR SELECT USING (true)', t, t);
    EXECUTE format('CREATE POLICY %I_write  ON %I FOR ALL USING (current_app_role() = ''admin'')', t, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO service_role', t);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %I_id_seq TO service_role', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION get_import_center_history(p_company_id INT DEFAULT 1, p_limit INT DEFAULT 50)
RETURNS TABLE (
  batch_id INT, source TEXT, origin TEXT, filename TEXT, status TEXT,
  records_imported INT, records_duplicate INT, records_failed INT,
  reconciliation_status TEXT, started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ,
  email_sender TEXT, email_subject TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT b.id, b.source, b.origin, a.filename, b.status,
         b.records_imported, b.records_duplicate, b.records_failed,
         b.reconciliation_status, b.started_at, b.completed_at,
         e.sender, e.subject
  FROM import_batches b
  LEFT JOIN email_attachments a ON a.id = b.email_attachment_id
  LEFT JOIN email_imports e ON e.id = a.email_import_id
  WHERE b.company_id = p_company_id
  ORDER BY b.started_at DESC
  LIMIT p_limit;
$$;
