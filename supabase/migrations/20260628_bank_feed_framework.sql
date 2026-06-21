-- =============================================================================
-- Bank Feed Framework — SaaS-ready multi-bank import infrastructure
-- Applied: 2026-06-28
-- Tables: bank_accounts, bank_import_profiles, bank_statement_uploads,
--         bank_feed_runs, bank_classification_rules
-- Extends: bank_transactions (ADD COLUMN only — never DROP/ALTER)
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. bank_accounts
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_accounts (
  id                    serial PRIMARY KEY,
  company_id            int NOT NULL DEFAULT 1 REFERENCES companies(id),
  bank_name             text NOT NULL
    CHECK (bank_name IN ('HDFC','ICICI','AXIS','SBI','KOTAK','INDUSIND','OTHER')),
  account_name          text NOT NULL,
  account_number_masked text,
  currency              text NOT NULL DEFAULT 'INR',
  opening_balance_inr   numeric(14,2) NOT NULL DEFAULT 0,
  is_active             boolean NOT NULL DEFAULT true,
  notes                 text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bank_accounts_auth_select" ON bank_accounts FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "bank_accounts_svc_all"     ON bank_accounts USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS bank_accounts_company_idx  ON bank_accounts(company_id);
CREATE INDEX IF NOT EXISTS bank_accounts_active_idx   ON bank_accounts(company_id, is_active);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. bank_import_profiles
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_import_profiles (
  id                  serial PRIMARY KEY,
  bank_account_id     int NOT NULL REFERENCES bank_accounts(id),
  company_id          int NOT NULL DEFAULT 1 REFERENCES companies(id),
  profile_name        text NOT NULL,
  date_column         text NOT NULL,
  description_column  text NOT NULL,
  debit_column        text,
  credit_column       text,
  amount_column       text,
  balance_column      text,
  date_format         text DEFAULT 'DD/MM/YYYY',
  delimiter           text DEFAULT ',',
  skip_rows           int DEFAULT 0,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE bank_import_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bank_import_profiles_auth_select" ON bank_import_profiles FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "bank_import_profiles_svc_all"     ON bank_import_profiles USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. bank_statement_uploads
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_statement_uploads (
  id                serial PRIMARY KEY,
  bank_account_id   int NOT NULL REFERENCES bank_accounts(id),
  company_id        int NOT NULL DEFAULT 1 REFERENCES companies(id),
  file_name         text NOT NULL,
  file_size_bytes   int,
  uploaded_at       timestamptz DEFAULT now(),
  status            text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','failed')),
  row_count         int DEFAULT 0,
  imported_rows     int DEFAULT 0,
  duplicate_rows    int DEFAULT 0,
  failed_rows       int DEFAULT 0,
  error_summary     text,
  profile_id        int REFERENCES bank_import_profiles(id),
  raw_rows          jsonb
);

ALTER TABLE bank_statement_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bank_stmt_uploads_auth_select" ON bank_statement_uploads FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "bank_stmt_uploads_svc_all"     ON bank_statement_uploads USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS bank_uploads_account_idx ON bank_statement_uploads(bank_account_id, uploaded_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. bank_feed_runs
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_feed_runs (
  id                serial PRIMARY KEY,
  upload_id         int NOT NULL REFERENCES bank_statement_uploads(id),
  bank_account_id   int NOT NULL REFERENCES bank_accounts(id),
  imported_rows     int DEFAULT 0,
  duplicate_rows    int DEFAULT 0,
  failed_rows       int DEFAULT 0,
  started_at        timestamptz DEFAULT now(),
  completed_at      timestamptz,
  triggered_by      text DEFAULT 'manual'
);

ALTER TABLE bank_feed_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bank_feed_runs_auth_select" ON bank_feed_runs FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "bank_feed_runs_svc_all"     ON bank_feed_runs USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. bank_classification_rules
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_classification_rules (
  id            serial PRIMARY KEY,
  company_id    int NOT NULL DEFAULT 1 REFERENCES companies(id),
  pattern       text NOT NULL,
  category_id   int REFERENCES expense_categories(id),
  expense_head  text,
  priority      int NOT NULL DEFAULT 100,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE bank_classification_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bank_class_rules_auth_select" ON bank_classification_rules FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "bank_class_rules_svc_all"     ON bank_classification_rules USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS bank_class_rules_company_idx ON bank_classification_rules(company_id, is_active, priority);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Extend bank_transactions (ADD COLUMN only)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS bank_account_id int REFERENCES bank_accounts(id),
  ADD COLUMN IF NOT EXISTS upload_id       int REFERENCES bank_statement_uploads(id),
  ADD COLUMN IF NOT EXISTS dedup_hash      text;

CREATE UNIQUE INDEX IF NOT EXISTS bank_txn_dedup_idx
  ON bank_transactions(dedup_hash) WHERE dedup_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS bank_txn_account_date_idx
  ON bank_transactions(bank_account_id, transaction_date DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Seed: default account + link legacy transactions
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_acct_id int;
BEGIN
  SELECT id INTO v_acct_id
  FROM   bank_accounts
  WHERE  company_id = 1
  LIMIT  1;

  IF NOT FOUND THEN
    INSERT INTO bank_accounts (
      company_id, bank_name, account_name, account_number_masked,
      currency, opening_balance_inr, notes
    ) VALUES (
      1, 'HDFC', 'HDFC Current Account', 'XXXX0001',
      'INR', 0, 'Auto-created to hold pre-existing bank imports'
    )
    RETURNING id INTO v_acct_id;
  END IF;

  -- Link any existing bank_transactions that have no account
  UPDATE bank_transactions
  SET    bank_account_id = v_acct_id
  WHERE  bank_account_id IS NULL;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Seed: default classification rules
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO bank_classification_rules (company_id, pattern, expense_head, category_id, priority)
SELECT
  1,
  p.pattern,
  p.expense_head,
  (SELECT id FROM expense_categories WHERE LOWER(name) LIKE LOWER(p.match_cat) LIMIT 1),
  p.priority
FROM (VALUES
  ('%SWIGGY%',          'Food',             '%food%',         60),
  ('%ZOMATO%',          'Food',             '%food%',         60),
  ('%GOOGLE ADS%',      'Advertising',      '%advert%',       50),
  ('%FACEBOOK%',        'Advertising',      '%advert%',       50),
  ('%META%',            'Advertising',      '%advert%',       50),
  ('%SHIPROCKET%',      'Courier',          '%courier%',      50),
  ('%DELHIVERY%',       'Courier',          '%courier%',      50),
  ('%BLUEDART%',        'Courier',          '%courier%',      50),
  ('%ECOM EXPRESS%',    'Courier',          '%courier%',      50),
  ('%DTDC%',            'Courier',          '%courier%',      50),
  ('%XPRESSBEES%',      'Courier',          '%courier%',      50),
  ('%SALARY%',          'Salary',           '%salary%',       50),
  ('%WAGES%',           'Salary',           '%salary%',       50),
  ('%GST%',             'GST',              '%gst%',          40),
  ('%INCOME TAX%',      'TDS',              '%tds%',          40),
  ('%TDS%',             'TDS',              '%tds%',          40),
  ('%NSDL%',            'TDS',              '%tds%',          40),
  ('%BANK CHARGES%',    'Bank Charges',     '%bank charg%',   40),
  ('%SERVICE CHARGE%',  'Bank Charges',     '%bank charg%',   40),
  ('%INTEREST CHARGED%','Bank Charges',     '%bank charg%',   40),
  ('%RENT%',            'Rent',             '%rent%',         50),
  ('%RAZORPAY%',        'Bank Charges',     '%bank charg%',   50),
  ('%GOKWIK%',          'Bank Charges',     '%bank charg%',   50),
  ('%CCAVENUE%',        'Bank Charges',     '%bank charg%',   50),
  ('%PACKAGING%',       'Packaging',        '%packaging%',    50),
  ('%AMAZON%',          'Packaging',        '%packaging%',    100),
  ('%FLIPKART%',        'Packaging',        '%packaging%',    100)
) AS p(pattern, expense_head, match_cat, priority)
WHERE NOT EXISTS (
  SELECT 1 FROM bank_classification_rules
  WHERE  company_id = 1 AND pattern = p.pattern
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. RPCs
-- ─────────────────────────────────────────────────────────────────────────────

-- get_bank_accounts
CREATE OR REPLACE FUNCTION get_bank_accounts(p_company_id int DEFAULT 1)
RETURNS TABLE (
  id                    int,
  bank_name             text,
  account_name          text,
  account_number_masked text,
  currency              text,
  opening_balance_inr   numeric,
  is_active             boolean,
  notes                 text,
  transaction_count     bigint,
  latest_date           date,
  closing_balance_inr   numeric,
  unclassified_count    bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    ba.id,
    ba.bank_name,
    ba.account_name,
    ba.account_number_masked,
    ba.currency,
    ba.opening_balance_inr,
    ba.is_active,
    ba.notes,
    COUNT(bt.id)                                              AS transaction_count,
    MAX(bt.transaction_date)                                  AS latest_date,
    (
      SELECT bt2.closing_balance_inr
      FROM   bank_transactions bt2
      WHERE  bt2.bank_account_id = ba.id
        AND  bt2.closing_balance_inr IS NOT NULL
      ORDER  BY bt2.transaction_date DESC, bt2.id DESC
      LIMIT  1
    )                                                         AS closing_balance_inr,
    COUNT(bt.id) FILTER (WHERE bt.transaction_type = 'unclassified') AS unclassified_count
  FROM  bank_accounts ba
  LEFT  JOIN bank_transactions bt ON bt.bank_account_id = ba.id
  WHERE ba.company_id = p_company_id
  GROUP BY ba.id
  ORDER BY ba.is_active DESC, ba.created_at ASC;
$$;

-- get_bank_kpis
CREATE OR REPLACE FUNCTION get_bank_kpis(
  p_account_id int     DEFAULT NULL,
  p_company_id int     DEFAULT 1,
  p_from       date    DEFAULT NULL,
  p_to         date    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'total_receipts',      COALESCE(SUM(bt.deposit_inr),    0),
    'total_payments',      COALESCE(SUM(bt.withdrawal_inr), 0),
    'net_flow',            COALESCE(SUM(bt.deposit_inr) - SUM(bt.withdrawal_inr), 0),
    'unclassified_count',  COUNT(*) FILTER (WHERE bt.transaction_type = 'unclassified'),
    'unclassified_amount', COALESCE(SUM(bt.withdrawal_inr) FILTER (WHERE bt.transaction_type = 'unclassified'), 0),
    'total_transactions',  COUNT(*),
    'classified_count',    COUNT(*) FILTER (WHERE bt.transaction_type != 'unclassified'),
    'reconciliation_pct',  CASE WHEN COUNT(*) = 0 THEN 0
                                ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE bt.transaction_type != 'unclassified') / COUNT(*), 1)
                           END,
    'latest_balance',      (
      SELECT bt2.closing_balance_inr
      FROM   bank_transactions bt2
      WHERE  (p_account_id IS NULL OR bt2.bank_account_id = p_account_id)
        AND  bt2.closing_balance_inr IS NOT NULL
      ORDER  BY bt2.transaction_date DESC, bt2.id DESC
      LIMIT  1
    )
  )
  FROM bank_transactions bt
  WHERE (p_account_id IS NULL OR bt.bank_account_id = p_account_id)
    AND (p_from IS NULL OR bt.transaction_date >= p_from)
    AND (p_to   IS NULL OR bt.transaction_date <= p_to)
$$;

-- get_bank_daily_cashflow
CREATE OR REPLACE FUNCTION get_bank_daily_cashflow(
  p_account_id int DEFAULT NULL,
  p_days       int DEFAULT 30
)
RETURNS TABLE (
  day           date,
  receipts_inr  numeric,
  payments_inr  numeric,
  net_inr       numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    bt.transaction_date                                    AS day,
    COALESCE(SUM(bt.deposit_inr),    0)                   AS receipts_inr,
    COALESCE(SUM(bt.withdrawal_inr), 0)                   AS payments_inr,
    COALESCE(SUM(bt.deposit_inr) - SUM(bt.withdrawal_inr), 0) AS net_inr
  FROM bank_transactions bt
  WHERE (p_account_id IS NULL OR bt.bank_account_id = p_account_id)
    AND bt.transaction_date >= CURRENT_DATE - p_days
  GROUP BY bt.transaction_date
  ORDER BY bt.transaction_date ASC;
$$;

-- get_bank_category_breakdown
CREATE OR REPLACE FUNCTION get_bank_category_breakdown(
  p_account_id int DEFAULT NULL
)
RETURNS TABLE (
  category_name      text,
  total_inr          numeric,
  transaction_count  bigint,
  pct_of_total       numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH classified AS (
    SELECT
      ec.name       AS category_name,
      SUM(e.amount_inr) AS total_inr,
      COUNT(*)          AS cnt
    FROM expenses e
    JOIN expense_categories ec ON ec.id = e.category_id
    WHERE e.bank_transaction_id IN (
      SELECT id FROM bank_transactions bt
      WHERE (p_account_id IS NULL OR bt.bank_account_id = p_account_id)
        AND bt.transaction_type != 'unclassified'
    )
    GROUP BY ec.name
  ),
  grand AS (SELECT COALESCE(SUM(total_inr), 0) AS g FROM classified)
  SELECT
    c.category_name,
    c.total_inr,
    c.cnt,
    CASE WHEN g.g > 0 THEN ROUND(c.total_inr / g.g * 100, 1) ELSE 0 END
  FROM classified c, grand g
  ORDER BY c.total_inr DESC;
$$;

-- get_bank_transactions_list
CREATE OR REPLACE FUNCTION get_bank_transactions_list(
  p_account_id int    DEFAULT NULL,
  p_filter     text   DEFAULT NULL,
  p_limit      int    DEFAULT 50,
  p_offset     int    DEFAULT 0
)
RETURNS TABLE (
  id                  int,
  transaction_date    date,
  narration_raw       text,
  counterparty        text,
  deposit_inr         numeric,
  withdrawal_inr      numeric,
  closing_balance_inr numeric,
  transaction_type    text,
  bank_account_id     int,
  bank_name           text,
  account_name        text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    bt.id,
    bt.transaction_date,
    bt.narration_raw,
    bt.counterparty,
    bt.deposit_inr,
    bt.withdrawal_inr,
    bt.closing_balance_inr,
    bt.transaction_type,
    bt.bank_account_id,
    ba.bank_name,
    ba.account_name
  FROM  bank_transactions bt
  LEFT  JOIN bank_accounts ba ON ba.id = bt.bank_account_id
  WHERE (p_account_id IS NULL OR bt.bank_account_id = p_account_id)
    AND (
      p_filter IS NULL
      OR (p_filter = 'unclassified' AND bt.transaction_type = 'unclassified')
      OR (p_filter = 'classified'   AND bt.transaction_type != 'unclassified')
    )
  ORDER BY bt.transaction_date DESC, bt.id DESC
  LIMIT  p_limit OFFSET p_offset;
$$;

-- get_bank_import_history
CREATE OR REPLACE FUNCTION get_bank_import_history(
  p_account_id int,
  p_limit      int DEFAULT 10
)
RETURNS TABLE (
  id             int,
  file_name      text,
  uploaded_at    timestamptz,
  status         text,
  row_count      int,
  imported_rows  int,
  duplicate_rows int,
  failed_rows    int,
  profile_name   text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    u.id,
    u.file_name,
    u.uploaded_at,
    u.status,
    u.row_count,
    u.imported_rows,
    u.duplicate_rows,
    u.failed_rows,
    p.profile_name
  FROM  bank_statement_uploads u
  LEFT  JOIN bank_import_profiles p ON p.id = u.profile_id
  WHERE u.bank_account_id = p_account_id
  ORDER BY u.uploaded_at DESC
  LIMIT p_limit;
$$;

-- get_bank_classification_rules
CREATE OR REPLACE FUNCTION get_bank_classification_rules(p_company_id int DEFAULT 1)
RETURNS TABLE (
  id            int,
  pattern       text,
  expense_head  text,
  category_id   int,
  category_name text,
  priority      int,
  is_active     boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    r.id,
    r.pattern,
    r.expense_head,
    r.category_id,
    ec.name   AS category_name,
    r.priority,
    r.is_active
  FROM  bank_classification_rules r
  LEFT  JOIN expense_categories ec ON ec.id = r.category_id
  WHERE r.company_id = p_company_id
  ORDER BY r.priority ASC, r.pattern ASC;
$$;

-- upsert_bank_account
CREATE OR REPLACE FUNCTION upsert_bank_account(
  p_bank_name             text,
  p_account_name          text,
  p_account_number_masked text    DEFAULT NULL,
  p_currency              text    DEFAULT 'INR',
  p_opening_balance_inr   numeric DEFAULT 0,
  p_notes                 text    DEFAULT NULL,
  p_company_id            int     DEFAULT 1,
  p_id                    int     DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id int;
BEGIN
  IF p_id IS NOT NULL THEN
    UPDATE bank_accounts SET
      bank_name             = p_bank_name,
      account_name          = p_account_name,
      account_number_masked = p_account_number_masked,
      currency              = p_currency,
      opening_balance_inr   = p_opening_balance_inr,
      notes                 = p_notes,
      updated_at            = now()
    WHERE id = p_id AND company_id = p_company_id
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO bank_accounts (
      company_id, bank_name, account_name, account_number_masked,
      currency, opening_balance_inr, notes
    ) VALUES (
      p_company_id, p_bank_name, p_account_name, p_account_number_masked,
      p_currency, p_opening_balance_inr, p_notes
    )
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

-- toggle_bank_account
CREATE OR REPLACE FUNCTION toggle_bank_account(
  p_id         int,
  p_is_active  boolean,
  p_company_id int DEFAULT 1
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE bank_accounts
  SET    is_active  = p_is_active,
         updated_at = now()
  WHERE  id = p_id AND company_id = p_company_id;
  RETURN FOUND;
END;
$$;

-- import_bank_transactions (bulk insert with dedup)
CREATE OR REPLACE FUNCTION import_bank_transactions(
  p_account_id    int,
  p_upload_id     int,
  p_transactions  jsonb,
  p_company_id    int DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tx         jsonb;
  v_hash       text;
  v_imported   int := 0;
  v_duplicates int := 0;
  v_failed     int := 0;
  v_date       date;
  v_narration  text;
  v_debit      numeric;
  v_credit     numeric;
  v_balance    numeric;
BEGIN
  FOR v_tx IN SELECT * FROM jsonb_array_elements(p_transactions)
  LOOP
    BEGIN
      v_date      := (v_tx->>'date')::date;
      v_narration := TRIM(v_tx->>'narration');
      v_debit     := COALESCE((v_tx->>'debit')::numeric, 0);
      v_credit    := COALESCE((v_tx->>'credit')::numeric, 0);
      v_balance   := NULLIF(v_tx->>'balance', '')::numeric;

      IF v_date IS NULL OR v_narration IS NULL OR v_narration = '' THEN
        v_failed := v_failed + 1;
        CONTINUE;
      END IF;

      v_hash := md5(
        p_account_id::text || '|' ||
        v_date::text || '|' ||
        v_narration   || '|' ||
        v_debit::text || '|' ||
        v_credit::text
      );

      IF EXISTS (SELECT 1 FROM bank_transactions WHERE dedup_hash = v_hash) THEN
        v_duplicates := v_duplicates + 1;
        CONTINUE;
      END IF;

      INSERT INTO bank_transactions (
        bank_account_id, upload_id, transaction_date, narration_raw,
        withdrawal_inr, deposit_inr, closing_balance_inr,
        transaction_type, dedup_hash
      ) VALUES (
        p_account_id, p_upload_id, v_date, v_narration,
        NULLIF(v_debit,  0),
        NULLIF(v_credit, 0),
        v_balance,
        'unclassified',
        v_hash
      );

      v_imported := v_imported + 1;

    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
    END;
  END LOOP;

  UPDATE bank_statement_uploads SET
    status         = 'completed',
    imported_rows  = v_imported,
    duplicate_rows = v_duplicates,
    failed_rows    = v_failed,
    row_count      = v_imported + v_duplicates + v_failed,
    raw_rows       = NULL
  WHERE id = p_upload_id;

  INSERT INTO bank_feed_runs (upload_id, bank_account_id, imported_rows, duplicate_rows, failed_rows, completed_at)
  VALUES (p_upload_id, p_account_id, v_imported, v_duplicates, v_failed, now());

  RETURN jsonb_build_object(
    'imported',    v_imported,
    'duplicates',  v_duplicates,
    'failed',      v_failed,
    'total',       v_imported + v_duplicates + v_failed
  );
END;
$$;

-- apply_bank_classification_rules
CREATE OR REPLACE FUNCTION apply_bank_classification_rules(
  p_account_id int DEFAULT NULL,
  p_company_id int DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tx         RECORD;
  v_rule       RECORD;
  v_classified int := 0;
  v_skipped    int := 0;
BEGIN
  FOR v_tx IN
    SELECT id, narration_raw, withdrawal_inr, transaction_date
    FROM   bank_transactions
    WHERE  (p_account_id IS NULL OR bank_account_id = p_account_id)
      AND  transaction_type = 'unclassified'
      AND  withdrawal_inr IS NOT NULL
      AND  withdrawal_inr > 0
  LOOP
    SELECT *
    INTO   v_rule
    FROM   bank_classification_rules
    WHERE  company_id = p_company_id
      AND  is_active  = true
      AND  category_id IS NOT NULL
      AND  v_tx.narration_raw ILIKE pattern
    ORDER  BY priority ASC
    LIMIT  1;

    IF FOUND THEN
      INSERT INTO expenses (
        expense_date, category_id, description, amount_inr,
        bank_transaction_id, status, payment_method
      ) VALUES (
        v_tx.transaction_date,
        v_rule.category_id,
        v_tx.narration_raw,
        v_tx.withdrawal_inr,
        v_tx.id,
        'approved',
        'bank_transfer'
      )
      ON CONFLICT DO NOTHING;

      UPDATE bank_transactions
      SET    transaction_type = 'miscellaneous'
      WHERE  id = v_tx.id;

      v_classified := v_classified + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'classified', v_classified,
    'skipped',    v_skipped
  );
END;
$$;

-- upsert_bank_classification_rule
CREATE OR REPLACE FUNCTION upsert_bank_classification_rule(
  p_pattern      text,
  p_expense_head text,
  p_category_id  int     DEFAULT NULL,
  p_priority     int     DEFAULT 100,
  p_company_id   int     DEFAULT 1,
  p_id           int     DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id int;
BEGIN
  IF p_id IS NOT NULL THEN
    UPDATE bank_classification_rules SET
      pattern      = p_pattern,
      expense_head = p_expense_head,
      category_id  = p_category_id,
      priority     = p_priority
    WHERE id = p_id AND company_id = p_company_id
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO bank_classification_rules (company_id, pattern, expense_head, category_id, priority)
    VALUES (p_company_id, p_pattern, p_expense_head, p_category_id, p_priority)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;
