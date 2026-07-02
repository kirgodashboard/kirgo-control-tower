-- bank_credit_types — user-managed list of credit/receipt type labels
-- The value (slug) is what gets stored in bank_transactions.transaction_type.
-- Pre-populated with the 9 types that were previously hardcoded in the frontend.

CREATE TABLE IF NOT EXISTS bank_credit_types (
  id          serial PRIMARY KEY,
  company_id  int  NOT NULL DEFAULT 1,
  value       text NOT NULL,             -- slug stored in bank_transactions
  label       text NOT NULL,             -- display name
  is_default  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, value)
);

ALTER TABLE bank_credit_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated select" ON bank_credit_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "service full"         ON bank_credit_types FOR ALL    TO service_role  USING (true);

INSERT INTO bank_credit_types (company_id, value, label, is_default) VALUES
  (1, 'gateway_settlement', 'Gateway Settlement (Razorpay / CCAvenue)', true),
  (1, 'gokwik_settlement',  'GoKwik Settlement',                         true),
  (1, 'cod_remittance',     'COD Remittance (Shiprocket)',                true),
  (1, 'founder_transfer',   'Founder / Investor Transfer',                true),
  (1, 'advance_received',   'Advance / Loan Received',                    true),
  (1, 'customer_refund',    'Customer Refund Received',                   true),
  (1, 'bank_interest',      'Bank Interest / FD Returns',                 true),
  (1, 'tax_refund',         'GST / Tax Refund',                           true),
  (1, 'miscellaneous',      'Other / Miscellaneous Income',               true)
ON CONFLICT (company_id, value) DO NOTHING;

-- RPC: get all credit types for a company
CREATE OR REPLACE FUNCTION get_bank_credit_types(p_company_id int DEFAULT 1)
RETURNS TABLE(id int, value text, label text, is_default boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, value, label, is_default
  FROM   bank_credit_types
  WHERE  company_id = p_company_id
  ORDER  BY is_default DESC, label;
$$;

-- RPC: add a custom credit type
CREATE OR REPLACE FUNCTION add_bank_credit_type(
  p_value      text,
  p_label      text,
  p_company_id int DEFAULT 1
)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id int;
BEGIN
  INSERT INTO bank_credit_types (company_id, value, label, is_default)
  VALUES (p_company_id, lower(regexp_replace(p_value, '[^a-z0-9]+', '_', 'g')), p_label, false)
  ON CONFLICT (company_id, value) DO UPDATE SET label = EXCLUDED.label
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_bank_credit_types(int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION add_bank_credit_type(text, text, int) TO authenticated;
