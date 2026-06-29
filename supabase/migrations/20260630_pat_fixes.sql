-- PAT Fix 1 (P0): cod_receivable_inr() was querying order_classifications
-- WHERE classification='cod_pending' — that classification is never set (0 rows).
-- Real COD outstanding = delivered COD shipments whose CRF ID hasn't been
-- matched to a bank cod_remittance transaction.
-- This function is used by Director Snapshot and get_data_quality_summary().
CREATE OR REPLACE FUNCTION cod_receivable_inr()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(SUM(o.order_total_inr), 0)
  FROM shipments s
  LEFT JOIN orders o ON o.id = s.order_id
  WHERE s.payment_method = 'cod'
    AND s.status = 'DELIVERED'
    AND (
      s.cod_crf_id IS NULL
      OR s.cod_crf_id NOT IN (
        SELECT extracted_reference
        FROM bank_transactions
        WHERE transaction_type = 'cod_remittance'
          AND extracted_reference IS NOT NULL
      )
    );
$$;

-- PAT Fix 2: get_system_health() lateral picked the most recent sync_run
-- per integration_key regardless of entity_type. For Shiprocket, the most
-- recent run is always shipments_repair (runs every cycle), so the dashboard
-- showed "Shiprocket · success · 17 records" (the repair job, not the main
-- shipments sync). Exclude _repair entity types from the "last run" display.
CREATE OR REPLACE FUNCTION get_system_health()
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_result json;
BEGIN
  SELECT json_build_object(
    'integrations', (
      SELECT json_agg(json_build_object(
        'key',             sj.integration_key,
        'name',            is2.display_name,
        'is_enabled',      is2.is_enabled,
        'last_run_at',     sr.started_at,
        'last_status',     sr.status,
        'error_summary',   sr.error_summary,
        'records_fetched', sr.records_fetched
      ) ORDER BY sj.integration_key)
      FROM (SELECT DISTINCT ON (integration_key) integration_key FROM sync_jobs ORDER BY integration_key) sj
      JOIN integration_settings is2 ON is2.integration_key = sj.integration_key
      LEFT JOIN LATERAL (
        SELECT sr2.started_at, sr2.status, sr2.error_summary, sr2.records_fetched
        FROM sync_runs sr2
        JOIN sync_jobs sj2 ON sj2.id = sr2.sync_job_id
        WHERE sj2.integration_key = sj.integration_key
          AND sj2.entity_type NOT LIKE '%\_repair'  -- exclude repair jobs
        ORDER BY sr2.id DESC LIMIT 1
      ) sr ON true
    ),
    'latest_order_at',    (SELECT MAX(ordered_at) FROM orders),
    'total_orders',       (SELECT COUNT(*) FROM orders),
    'latest_shipment_at', (SELECT MAX(created_at) FROM shipments),
    'total_shipments',    (SELECT COUNT(*) FROM shipments),
    'total_customers',    (SELECT COUNT(*) FROM customers),
    'unclassified_orders',(SELECT COUNT(*) FROM orders o WHERE NOT EXISTS (
                            SELECT 1 FROM order_classifications oc WHERE oc.order_id = o.id)),
    'unclassified_bank',  (SELECT COUNT(*) FROM bank_transactions WHERE transaction_type IS NULL
                            OR transaction_type = 'unclassified'),
    'data_quality_score', GREATEST(0, 100
      - LEAST(40, (SELECT COUNT(*) FROM orders o WHERE NOT EXISTS (
                    SELECT 1 FROM order_classifications oc WHERE oc.order_id = o.id)) * 2)
      - LEAST(20, (SELECT COUNT(*) FROM bank_transactions WHERE transaction_type IS NULL
                    OR transaction_type = 'unclassified') * 1)
      - LEAST(30, (SELECT COUNT(*) FROM sync_runs WHERE status = 'failed'
                    AND started_at > now() - interval '7 days') * 5)
    ),
    'sync_failures_7d', (SELECT COUNT(*) FROM sync_runs WHERE status = 'failed'
                          AND started_at > now() - interval '7 days'),
    'cod_outstanding_inr',   cod_receivable_inr(),
    'cod_outstanding_count', (
      SELECT COUNT(*)
      FROM shipments s
      WHERE s.payment_method = 'cod'
        AND s.status = 'DELIVERED'
        AND (
          s.cod_crf_id IS NULL
          OR s.cod_crf_id NOT IN (
            SELECT extracted_reference FROM bank_transactions
            WHERE transaction_type = 'cod_remittance'
              AND extracted_reference IS NOT NULL
          )
        )
    )
  ) INTO v_result;
  RETURN v_result;
END;
$$;
