-- Fix get_data_quality_summary: COD variance used cod_payable_inr (Shiprocket service fee,
-- ₹46-115) instead of the actual COD outstanding. Use cod_receivable_inr() which is the
-- canonical function already used by Operations and Receivables dashboards.
-- cod_receivable_inr() = 0 when all COD is settled (which is the current state).

CREATE OR REPLACE FUNCTION get_data_quality_summary()
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_unclassified_bank_count     int;
  v_missing_expense_count       int;
  v_cod_outstanding_inr         numeric;
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

  -- COD outstanding (canonical function, already used in Operations + Receivables)
  v_cod_outstanding_inr := cod_receivable_inr();
  -- For display compatibility keep old field names, repurposed:
  -- cod_delivered_inr = outstanding to be received
  -- cod_received_inr  = 0 (no longer relevant here)
  -- cod_variance_inr  = outstanding (positive = money still owed to us)
  v_cod_delivered_inr  := v_cod_outstanding_inr;
  v_cod_received_inr   := 0;
  v_cod_variance_inr   := v_cod_outstanding_inr;

  -- Orders: no classification record
  SELECT COUNT(*) INTO v_unclassified_order_count
  FROM orders o
  WHERE NOT EXISTS (SELECT 1 FROM order_classifications oc WHERE oc.order_id = o.id);

  -- Orders: lines with no variant mapping (unresolved SKU)
  SELECT COUNT(*) INTO v_unmapped_lines_count
  FROM order_lines WHERE variant_id IS NULL;

  -- Inventory: out of stock (was ever stocked)
  SELECT COUNT(*) FILTER (WHERE current_stock = 0 AND max_stock > 0)
  INTO v_out_of_stock_count
  FROM inventory_items;

  -- Inventory: low stock (≤ reorder_level but > 0)
  SELECT COUNT(*) FILTER (WHERE current_stock > 0 AND current_stock <= reorder_level AND reorder_level > 0)
  INTO v_low_stock_count
  FROM inventory_items;

  -- Inventory: SKUs with no inventory record at all
  SELECT COUNT(DISTINCT ol.sku_raw)
  INTO v_skus_no_inventory_count
  FROM order_lines ol
  WHERE ol.sku_raw IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM inventory_items ii WHERE ii.sku = ol.sku_raw);

  -- Sync: unresolved errors
  SELECT COUNT(*) INTO v_unresolved_errors_count
  FROM sync_errors WHERE resolved_at IS NULL;

  -- Sync: failures in last 7 days
  SELECT COUNT(*) INTO v_sync_failures_7d
  FROM sync_runs
  WHERE status = 'failed' AND started_at > NOW() - INTERVAL '7 days';

  -- Sync: last successful sync
  SELECT MAX(completed_at) INTO v_last_sync_at
  FROM sync_runs WHERE status = 'success';

  RETURN json_build_object(
    'unclassified_bank_count',  v_unclassified_bank_count,
    'missing_expense_count',    v_missing_expense_count,
    'cod_delivered_inr',        ROUND(v_cod_delivered_inr, 2),
    'cod_received_inr',         ROUND(v_cod_received_inr, 2),
    'cod_variance_inr',         ROUND(v_cod_variance_inr, 2),
    'unclassified_order_count', v_unclassified_order_count,
    'unmapped_lines_count',     v_unmapped_lines_count,
    'unresolved_errors_count',  v_unresolved_errors_count,
    'sync_failures_7d',         v_sync_failures_7d,
    'last_sync_at',             v_last_sync_at,
    'low_stock_count',          v_low_stock_count,
    'out_of_stock_count',       v_out_of_stock_count,
    'skus_no_inventory_count',  v_skus_no_inventory_count
  );
END;
$$;
