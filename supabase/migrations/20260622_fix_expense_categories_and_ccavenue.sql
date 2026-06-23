-- ── 1. Mark stuck CCavenue sync run as failed ─────────────────────────────────
UPDATE sync_runs
SET status        = 'failed',
    completed_at  = NOW(),
    error_summary = 'Sync timed out — no sync-ccavenue edge function deployed.'
WHERE integration_key = 'ccavenue'
  AND status = 'running'
  AND completed_at IS NULL;


-- ── 2. Create insert_expense_category RPC ─────────────────────────────────────
-- Maps display group labels → DB values, auto-generates code, applies_to='both'
-- so the category always appears in all dropdowns.
CREATE OR REPLACE FUNCTION insert_expense_category(
  p_name           text,
  p_category_group text
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_code  text;
  v_group text;
  v_id    integer;
BEGIN
  v_group := CASE LOWER(TRIM(p_category_group))
    WHEN 'operating'  THEN 'opex'
    WHEN 'finance'    THEN 'financing'
    WHEN 'capital'    THEN 'capex'
    WHEN 'other'      THEN 'opex'
    WHEN 'marketing'  THEN 'marketing'
    WHEN 'cogs'       THEN 'cogs'
    ELSE LOWER(TRIM(p_category_group))
  END;

  v_code := LOWER(REGEXP_REPLACE(TRIM(p_name), '[^a-zA-Z0-9]+', '_', 'g'));
  v_code := TRIM(BOTH '_' FROM v_code);

  IF EXISTS (SELECT 1 FROM expense_categories WHERE code = v_code) THEN
    v_code := v_code || '_' || EXTRACT(EPOCH FROM NOW())::bigint::text;
  END IF;

  INSERT INTO expense_categories (code, name, category_group, applies_to)
  VALUES (v_code, TRIM(p_name), v_group, 'both')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION insert_expense_category(text, text) TO authenticated;


-- ── 3. Fix get_expense_categories — return ALL active categories ──────────────
-- Old filter: applies_to IN ('operations','both') silently excluded capex rows.
CREATE OR REPLACE FUNCTION get_expense_categories()
RETURNS TABLE (id integer, code text, name text, category_group text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, code, name, category_group
  FROM   expense_categories
  WHERE  is_active = true
  ORDER  BY category_group, name;
$$;

GRANT EXECUTE ON FUNCTION get_expense_categories() TO authenticated;
