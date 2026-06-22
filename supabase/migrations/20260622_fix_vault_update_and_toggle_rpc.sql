-- Fix 1: store_integration_secret — replace direct UPDATE vault.secrets
-- (permission denied) with vault.update_secret()
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

  SELECT id INTO v_existing
  FROM vault.secrets
  WHERE name = v_secret_name
  LIMIT 1;

  IF v_existing IS NULL THEN
    PERFORM vault.create_secret(
      p_credentials_json::text,
      v_secret_name,
      format('Credentials for %s (company_id=%s)', p_integration_key, p_company_id)
    );
  ELSE
    -- Use vault.update_secret instead of direct table write (avoids permission denied)
    PERFORM vault.update_secret(
      v_existing,
      p_credentials_json::text,
      v_secret_name,
      format('Credentials for %s (company_id=%s)', p_integration_key, p_company_id)
    );
  END IF;

  UPDATE integration_settings
  SET    secret_ref  = v_secret_name,
         updated_at  = now()
  WHERE  integration_key = p_integration_key
    AND  company_id = p_company_id;

  RETURN v_secret_name;
END;
$$;

GRANT EXECUTE ON FUNCTION store_integration_secret(text, jsonb, int) TO authenticated;
GRANT EXECUTE ON FUNCTION store_integration_secret(text, jsonb, int) TO service_role;

-- Fix 2: toggle_integration_enabled — was missing entirely
CREATE OR REPLACE FUNCTION toggle_integration_enabled(
  p_integration_key text,
  p_is_enabled      boolean,
  p_company_id      int DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE integration_settings
  SET    is_enabled = p_is_enabled,
         updated_at = now()
  WHERE  integration_key = p_integration_key
    AND  company_id      = p_company_id;
END;
$$;

GRANT EXECUTE ON FUNCTION toggle_integration_enabled(text, boolean, int) TO authenticated;
GRANT EXECUTE ON FUNCTION toggle_integration_enabled(text, boolean, int) TO service_role;
