-- =============================================================================
-- Data Quality RPC
-- get_data_quality_summary() → json
-- Covers: bank, orders, inventory, sync health
-- =============================================================================

CREATE OR REPLACE FUNCTION get_data_quality_summary()
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_unclassified_bank_count     int;
  v_missing_expense_count       int;
  v_cod_delivered_inr           numeric;
  v_cod_received_inr            numeric;
  v_cod_variance_inr            numeric;
  v_unclassified_order_count    int;
  v_unmapped_lines_count        int;
  v_unresolved_errors_count     int;
  v_sync_failures_7d            int;
  v_last_sync_at                timestamptz;
  v_low_stock_count             int;
  v_out_of_stock_count          int;
  v_skus_no_inventory_count     int;
BEGIN
  -- Bank: unclassified debits
  SELECT COUNT(*) INTO v_unclassified_bank_count
  FROM bank_transactions WHERE transaction_type = 'unclassified';

  -- Bank: debits >= 500 with no linked expense record
  SELECT COUNT(*) INTO v_missing_expense_count
  FROM bank_transactions bt
  WHERE bt.withdrawal_inr >= 500
    AND bt.transaction_type != 'unclassified'
    AND NOT EXISTS (SELECT 1 FROM expenses e WHERE e.bank_transaction_id = bt.id);

  -- Bank: COD variance — delivered COD vs bank remittances received
  -- Uses shipments.payment_method = 'cod' (lowercase) + delivered_at IS NOT NULL
  SELECT COALESCE(SUM(s.cod_payable_inr), 0) INTO v_cod_delivered_inr
  FROM shipments s
  WHERE LOWER(s.payment_method) = 'cod' AND s.delivered_at IS NOT NULL;

  SELECT COALESCE(SUM(bt.deposit_inr), 0) INTO v_cod_received_inr
  FROM bank_transactions bt WHERE bt.transaction_type = 'cod_remittance';

  v_cod_variance_inr := v_cod_delivered_inr - v_cod_received_inr;

  -- Orders: no classification record
  SELECT COUNT(*) INTO v_unclassified_order_count
  FROM orders o
  WHERE NOT EXISTS (SELECT 1 FROM order_classifications oc WHERE oc.order_id = o.id);

  -- Orders: lines with no variant mapping (unresolved SKU)
  SELECT COUNT(*) INTO v_unmapped_lines_count
  FROM order_lines WHERE variant_id IS NULL;

  -- Inventory: out of stock (was ever stocked)
  SELECT COUNT(*) INTO v_out_of_stock_count
  FROM inventory_items
  WHERE is_active = true AND current_stock = 0 AND opening_stock > 0;

  -- Inventory: at or below reorder point
  SELECT COUNT(*) INTO v_low_stock_count
  FROM inventory_items
  WHERE is_active = true AND current_stock > 0 AND current_stock <= reorder_point;

  -- Inventory: product_variants with no inventory_item row
  SELECT COUNT(*) INTO v_skus_no_inventory_count
  FROM product_variants pv
  WHERE NOT EXISTS (SELECT 1 FROM inventory_items ii WHERE ii.variant_id = pv.id);

  -- Sync: unresolved import errors (severity = error)
  SELECT COUNT(*) INTO v_unresolved_errors_count
  FROM import_errors WHERE severity = 'error' AND resolution_status = 'unresolved';

  -- Sync: failed runs in last 7 days
  SELECT COUNT(*) INTO v_sync_failures_7d
  FROM import_runs WHERE status = 'failed' AND run_started_at >= NOW() - INTERVAL '7 days';

  -- Sync: last successful run timestamp
  SELECT MAX(run_completed_at) INTO v_last_sync_at
  FROM import_runs WHERE status = 'completed';

  RETURN json_build_object(
    'unclassified_bank_count',   v_unclassified_bank_count,
    'missing_expense_count',     v_missing_expense_count,
    'cod_delivered_inr',         v_cod_delivered_inr,
    'cod_received_inr',          v_cod_received_inr,
    'cod_variance_inr',          v_cod_variance_inr,
    'unclassified_order_count',  v_unclassified_order_count,
    'unmapped_lines_count',      v_unmapped_lines_count,
    'unresolved_errors_count',   v_unresolved_errors_count,
    'sync_failures_7d',          v_sync_failures_7d,
    'last_sync_at',              v_last_sync_at,
    'low_stock_count',           v_low_stock_count,
    'out_of_stock_count',        v_out_of_stock_count,
    'skus_no_inventory_count',   v_skus_no_inventory_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_data_quality_summary() TO anon, authenticated;
