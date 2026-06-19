-- =============================================================================
-- Finance Intelligence Sprint — Expense Intelligence RPCs
-- Applied: 2026-06-20
-- =============================================================================

-- ── 1. Extend expenses table ────────────────────────────────────────────────
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS status         text DEFAULT 'draft'
    CONSTRAINT expenses_status_chk CHECK (status IN ('draft','approved','rejected')),
  ADD COLUMN IF NOT EXISTS attachment_url text;

-- ── 2. get_expense_kpis ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_expense_kpis(p_start date, p_end date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_total        numeric := 0;
  v_days         int;
  v_run_rate     numeric := 0;
  v_head_name    text;
  v_head_amt     numeric := 0;
  v_vendor       text;
  v_vendor_amt   numeric := 0;
  v_prev_total   numeric := 0;
  v_growth_pct   numeric;
  v_unclassified bigint  := 0;
BEGIN
  SELECT COALESCE(SUM(amount_inr), 0)
  INTO   v_total
  FROM   expenses
  WHERE  expense_date BETWEEN p_start AND p_end;

  v_days     := GREATEST((p_end - p_start + 1), 1);
  v_run_rate := v_total / v_days * 30;

  SELECT ec.name, SUM(e.amount_inr)
  INTO   v_head_name, v_head_amt
  FROM   expenses e
  JOIN   expense_categories ec ON ec.id = e.category_id
  WHERE  e.expense_date BETWEEN p_start AND p_end
  GROUP  BY ec.name
  ORDER  BY 2 DESC
  LIMIT  1;

  SELECT e.vendor, SUM(e.amount_inr)
  INTO   v_vendor, v_vendor_amt
  FROM   expenses e
  WHERE  e.expense_date BETWEEN p_start AND p_end
    AND  e.vendor IS NOT NULL AND e.vendor <> ''
  GROUP  BY e.vendor
  ORDER  BY 2 DESC
  LIMIT  1;

  SELECT COALESCE(SUM(amount_inr), 0)
  INTO   v_prev_total
  FROM   expenses
  WHERE  expense_date BETWEEN (p_start - v_days) AND (p_start - 1);

  v_growth_pct := CASE
    WHEN v_prev_total > 0
      THEN ROUND(((v_total - v_prev_total) / v_prev_total * 100)::numeric, 1)
    ELSE NULL
  END;

  SELECT COUNT(*) INTO v_unclassified
  FROM   bank_transactions
  WHERE  transaction_type = 'unclassified';

  RETURN jsonb_build_object(
    'total_expense_inr',         v_total,
    'monthly_run_rate_inr',      ROUND(v_run_rate::numeric, 2),
    'largest_head_name',         COALESCE(v_head_name,   'N/A'),
    'largest_head_amount_inr',   COALESCE(v_head_amt,    0),
    'largest_vendor',            COALESCE(v_vendor,      'N/A'),
    'largest_vendor_amount_inr', COALESCE(v_vendor_amt,  0),
    'expense_growth_pct',        v_growth_pct,
    'unclassified_count',        v_unclassified
  );
END;
$$;

-- ── 3. get_expense_list ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_expense_list(
  p_start       date,
  p_end         date,
  p_category_id int  DEFAULT NULL,
  p_vendor      text DEFAULT NULL
)
RETURNS TABLE (
  id                  int,
  expense_date        date,
  category_name       text,
  category_id         int,
  description         text,
  amount_inr          numeric,
  vendor              text,
  payment_method      text,
  notes               text,
  status              text,
  attachment_url      text,
  bank_transaction_id int
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.expense_date,
    ec.name            AS category_name,
    e.category_id,
    e.description,
    e.amount_inr,
    e.vendor,
    e.payment_method,
    e.notes,
    e.status,
    e.attachment_url,
    e.bank_transaction_id
  FROM   expenses e
  LEFT   JOIN expense_categories ec ON ec.id = e.category_id
  WHERE  e.expense_date BETWEEN p_start AND p_end
    AND  (p_category_id IS NULL OR e.category_id = p_category_id)
    AND  (p_vendor IS NULL OR p_vendor = ''
          OR LOWER(COALESCE(e.vendor, '')) LIKE '%' || LOWER(p_vendor) || '%')
  ORDER  BY e.expense_date DESC, e.created_at DESC;
END;
$$;

-- ── 4. get_expense_by_category ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_expense_by_category(p_start date, p_end date)
RETURNS TABLE (
  category_name     text,
  category_id       int,
  total_inr         numeric,
  transaction_count bigint,
  pct_of_total      numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_total numeric;
BEGIN
  SELECT COALESCE(SUM(amount_inr), 0) INTO v_total
  FROM   expenses WHERE expense_date BETWEEN p_start AND p_end;

  RETURN QUERY
  SELECT
    ec.name                                                  AS category_name,
    e.category_id,
    SUM(e.amount_inr)                                        AS total_inr,
    COUNT(*)                                                 AS transaction_count,
    CASE WHEN v_total > 0
      THEN ROUND((SUM(e.amount_inr) / v_total * 100)::numeric, 1)
      ELSE 0::numeric
    END                                                      AS pct_of_total
  FROM   expenses e
  JOIN   expense_categories ec ON ec.id = e.category_id
  WHERE  e.expense_date BETWEEN p_start AND p_end
  GROUP  BY ec.name, e.category_id
  ORDER  BY total_inr DESC;
END;
$$;

-- ── 5. get_expense_trend ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_expense_trend(p_start date, p_end date)
RETURNS TABLE (
  period            text,
  total_inr         numeric,
  transaction_count bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    to_char(
      CASE WHEN (p_end - p_start) <= 90
        THEN date_trunc('week',  e.expense_date)
        ELSE date_trunc('month', e.expense_date)
      END,
      CASE WHEN (p_end - p_start) <= 90 THEN 'Mon DD' ELSE 'Mon YYYY' END
    )                   AS period,
    SUM(e.amount_inr)   AS total_inr,
    COUNT(*)            AS transaction_count
  FROM   expenses e
  WHERE  e.expense_date BETWEEN p_start AND p_end
  GROUP  BY 1
  ORDER  BY MIN(e.expense_date);
END;
$$;

-- ── 6. get_top_vendors ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_top_vendors(
  p_start date,
  p_end   date,
  p_limit int DEFAULT 10
)
RETURNS TABLE (
  vendor            text,
  total_inr         numeric,
  transaction_count bigint,
  last_expense_date date
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.vendor,
    SUM(e.amount_inr)       AS total_inr,
    COUNT(*)                AS transaction_count,
    MAX(e.expense_date)     AS last_expense_date
  FROM   expenses e
  WHERE  e.expense_date BETWEEN p_start AND p_end
    AND  e.vendor IS NOT NULL AND e.vendor <> ''
  GROUP  BY e.vendor
  ORDER  BY total_inr DESC
  LIMIT  p_limit;
END;
$$;

-- ── 7. get_expense_categories ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_expense_categories()
RETURNS TABLE (
  id             int,
  code           text,
  name           text,
  category_group text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, code, name, category_group
  FROM   expense_categories
  WHERE  applies_to IN ('operations', 'both')
  ORDER  BY name;
$$;

-- ── 8. insert_expense ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION insert_expense(
  p_expense_date   date,
  p_category_id    int,
  p_description    text,
  p_amount_inr     numeric,
  p_vendor         text    DEFAULT NULL,
  p_payment_method text    DEFAULT NULL,
  p_notes          text    DEFAULT NULL,
  p_attachment_url text    DEFAULT NULL,
  p_bank_txn_id    int     DEFAULT NULL,
  p_status         text    DEFAULT 'draft'
)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id int;
BEGIN
  INSERT INTO expenses (
    expense_date, category_id, description, amount_inr,
    vendor, payment_method, notes, attachment_url,
    bank_transaction_id, status
  ) VALUES (
    p_expense_date, p_category_id, p_description, p_amount_inr,
    p_vendor, p_payment_method, p_notes, p_attachment_url,
    p_bank_txn_id, p_status
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ── 9. get_unclassified_transactions ───────────────────────────────────────
CREATE OR REPLACE FUNCTION get_unclassified_transactions(p_limit int DEFAULT 50)
RETURNS TABLE (
  id                  int,
  transaction_date    date,
  narration_raw       text,
  withdrawal_inr      numeric,
  closing_balance_inr numeric,
  counterparty        text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    bt.id,
    bt.transaction_date,
    bt.narration_raw,
    bt.withdrawal_inr,
    bt.closing_balance_inr,
    bt.counterparty
  FROM   bank_transactions bt
  WHERE  bt.transaction_type = 'unclassified'
    AND  bt.withdrawal_inr IS NOT NULL
  ORDER  BY bt.transaction_date DESC
  LIMIT  p_limit;
END;
$$;

-- ── 10. classify_bank_transaction ───────────────────────────────────────────
-- Creates an approved expense from a bank debit and marks the transaction type.
CREATE OR REPLACE FUNCTION classify_bank_transaction(
  p_transaction_id int,
  p_category_id    int,
  p_vendor         text DEFAULT NULL,
  p_description    text DEFAULT NULL,
  p_notes          text DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tx bank_transactions%ROWTYPE;
  v_id int;
BEGIN
  SELECT * INTO v_tx FROM bank_transactions WHERE id = p_transaction_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'bank_transaction % not found', p_transaction_id;
  END IF;

  INSERT INTO expenses (
    expense_date, category_id, description, amount_inr,
    vendor, notes, bank_transaction_id, status, payment_method
  ) VALUES (
    v_tx.transaction_date,
    p_category_id,
    COALESCE(p_description, v_tx.narration_raw),
    v_tx.withdrawal_inr,
    p_vendor,
    p_notes,
    p_transaction_id,
    'approved',
    'bank_transfer'
  )
  RETURNING id INTO v_id;

  UPDATE bank_transactions
  SET    transaction_type = 'miscellaneous'
  WHERE  id = p_transaction_id;

  RETURN v_id;
END;
$$;
