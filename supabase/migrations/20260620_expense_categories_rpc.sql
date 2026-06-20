-- =============================================================================
-- Add insert_expense_category RPC
-- Allows the UI to create new expense heads without direct table access.
-- =============================================================================

CREATE OR REPLACE FUNCTION insert_expense_category(
  p_name           text,
  p_category_group text DEFAULT 'Operating'
)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_code text;
  v_id   int;
BEGIN
  -- Slugify name → code
  v_code := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '_', 'g'));

  INSERT INTO expense_categories (code, name, category_group, applies_to)
  VALUES (v_code, trim(p_name), p_category_group, 'both')
  ON CONFLICT (code) DO UPDATE
    SET name           = trim(p_name),
        category_group = p_category_group
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
