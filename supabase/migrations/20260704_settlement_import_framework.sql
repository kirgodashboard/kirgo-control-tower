-- Settlement Import Framework
-- Mirrors the bank-feed upload/run pattern for GoKwik and CCAvenue file imports.
-- Supports both manual drag-drop and email auto-ingest (Postmark webhook).

CREATE TABLE IF NOT EXISTS settlement_imports (
  id               SERIAL PRIMARY KEY,
  gateway          TEXT NOT NULL CHECK (gateway IN ('gokwik', 'ccavenue', 'razorpay')),
  company_id       INT  NOT NULL DEFAULT 1,
  file_name        TEXT NOT NULL,
  file_size_bytes  INT,
  source           TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'email')),
  email_from       TEXT,
  email_subject    TEXT,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','success','partial','failed')),
  row_count        INT  DEFAULT 0,
  imported_rows    INT  DEFAULT 0,
  duplicate_rows   INT  DEFAULT 0,
  failed_rows      INT  DEFAULT 0,
  error_summary    TEXT,
  raw_rows         JSONB,
  uploaded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ
);

ALTER TABLE settlement_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY settlement_imports_select ON settlement_imports FOR SELECT USING (true);
CREATE POLICY settlement_imports_write   ON settlement_imports FOR ALL    USING (current_app_role() = 'admin');
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE settlement_imports TO service_role;
GRANT USAGE, SELECT ON SEQUENCE settlement_imports_id_seq TO service_role;

-- GoKwik settlement import RPC
CREATE OR REPLACE FUNCTION import_gokwik_settlements(
  p_import_id    INT,
  p_rows         JSONB,
  p_company_id   INT DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_inserted   INT := 0;
  v_duplicates INT := 0;
  v_failed     INT := 0;
  v_row        JSONB;
  v_ref        TEXT;
  v_amount     NUMERIC;
  v_date       DATE;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    BEGIN
      v_ref    := v_row->>'gokwik_order_id';
      v_amount := (v_row->>'amount_inr')::NUMERIC;
      v_date   := (v_row->>'settlement_date')::DATE;

      IF v_ref IS NULL OR v_date IS NULL THEN
        v_failed := v_failed + 1; CONTINUE;
      END IF;

      INSERT INTO gateway_settlements (gateway, settlement_reference, amount_inr, settled_at, order_count, created_at)
        VALUES ('gokwik', v_ref, v_amount, v_date, 1, NOW())
        ON CONFLICT DO NOTHING;

      IF FOUND THEN v_inserted := v_inserted + 1;
      ELSE          v_duplicates := v_duplicates + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
    END;
  END LOOP;

  UPDATE settlement_imports SET
    status        = CASE WHEN v_failed = 0 THEN 'success' WHEN v_inserted > 0 THEN 'partial' ELSE 'failed' END,
    imported_rows = v_inserted, duplicate_rows = v_duplicates, failed_rows = v_failed, completed_at = NOW()
  WHERE id = p_import_id;

  RETURN jsonb_build_object('imported', v_inserted, 'duplicates', v_duplicates, 'failed', v_failed);
END;
$$;

-- CCAvenue settlement import RPC
CREATE OR REPLACE FUNCTION import_ccavenue_settlements(
  p_import_id    INT,
  p_rows         JSONB,
  p_company_id   INT DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_inserted   INT := 0;
  v_duplicates INT := 0;
  v_failed     INT := 0;
  v_row        JSONB;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    BEGIN
      IF (v_row->>'crf_id') IS NULL OR (v_row->>'settlement_date') IS NULL THEN
        v_failed := v_failed + 1; CONTINUE;
      END IF;

      INSERT INTO ccavenue_settlements (crf_id, settlement_date, utr_number, bank_amount_inr, order_count, synced_at, created_at)
        VALUES (v_row->>'crf_id', (v_row->>'settlement_date')::DATE, v_row->>'utr_number',
                (v_row->>'bank_amount_inr')::NUMERIC, COALESCE((v_row->>'order_count')::INT, 0), NOW(), NOW())
        ON CONFLICT (crf_id) DO UPDATE SET
          settlement_date = EXCLUDED.settlement_date, utr_number = EXCLUDED.utr_number,
          bank_amount_inr = EXCLUDED.bank_amount_inr, order_count = EXCLUDED.order_count, synced_at = NOW();

      v_inserted := v_inserted + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
    END;
  END LOOP;

  UPDATE settlement_imports SET
    status        = CASE WHEN v_failed = 0 THEN 'success' WHEN v_inserted > 0 THEN 'partial' ELSE 'failed' END,
    imported_rows = v_inserted, duplicate_rows = v_duplicates, failed_rows = v_failed, completed_at = NOW()
  WHERE id = p_import_id;

  RETURN jsonb_build_object('imported', v_inserted, 'duplicates', v_duplicates, 'failed', v_failed);
END;
$$;

-- Import history RPC
CREATE OR REPLACE FUNCTION get_settlement_import_history(
  p_gateway TEXT, p_company_id INT DEFAULT 1, p_limit INT DEFAULT 20
)
RETURNS TABLE (
  id INT, gateway TEXT, file_name TEXT, source TEXT, status TEXT,
  row_count INT, imported_rows INT, duplicate_rows INT, failed_rows INT,
  error_summary TEXT, uploaded_at TIMESTAMPTZ, completed_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT id, gateway, file_name, source, status, row_count, imported_rows,
         duplicate_rows, failed_rows, error_summary, uploaded_at, completed_at
  FROM settlement_imports
  WHERE gateway = p_gateway AND company_id = p_company_id
  ORDER BY uploaded_at DESC LIMIT p_limit;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ccavenue_settlements_crf_id_key') THEN
    ALTER TABLE ccavenue_settlements ADD CONSTRAINT ccavenue_settlements_crf_id_key UNIQUE (crf_id);
  END IF;
END $$;
