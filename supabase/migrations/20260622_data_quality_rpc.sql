-- =============================================================================
-- Data Quality RPC
-- get_data_quality_summary() → jsonb
-- Covers: bank, orders, inventory, sync health
-- =============================================================================

CREATE OR REPLACE FUNCTION get_data_quality_summary()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_unclassified_bank     bigint;
  v_missing_expenses      bigint;
  v_cod_delivered_inr     numeric;
  v_cod_received_inr      numeric;
  v_unclassified_orders   bigint;
  v_unmapped_lines        bigint;
  v_unresolved_errors     bigint;
  v_sync_failures_7d      bigint;
  v_last_sync_at          timestamptz;
  v_low_stock             bigint;
  v_out_of_stock          bigint;
  v_skus_no_inventory     bigint;
BEGIN
  -- Bank: unclassified debits
  SELECT COUNT(*) INTO v_unclassified_bank
  FROM bank_transactions
  WHERE transaction_type = 'unclassified'
    AND withdrawal_inr IS NOT NULL AND withdrawal_inr > 0;

  -- Bank: debits ≥ ₹500 with no linked expense record
  SELECT COUNT(*) INTO v_missing_expenses
  FROM bank_transactions bt
  WHERE bt.withdrawal_inr >= 500
    AND bt.transaction_type NOT IN (
      'gateway_settlement','cod_remittance','shiprocket_recharge',
      'customer_refund','bank_charge','founder_transfer',
      'fx_loss','inventory_write_off','unclassified'
    )
    AND NOT EXISTS (
      SELECT 1 FROM expenses e WHERE e.bank_transaction_id = bt.id
    );

  -- Bank: COD delivered vs remitted
  SELECT COALESCE(SUM(o.order_total_inr), 0) INTO v_cod_delivered_inr
  FROM orders o
  WHERE o.payment_method ILIKE '%cod%'
    AND o.status = 'completed';

  SELECT COALESCE(SUM(bt.deposit_inr), 0) INTO v_cod_received_inr
  FROM bank_transactions bt
  WHERE bt.transaction_type = 'cod_remittance';

  -- Orders: no classification record
  SELECT COUNT(*) INTO v_unclassified_orders
  FROM orders o
  WHERE NOT EXISTS (
    SELECT 1 FROM order_classifications oc WHERE oc.order_id = o.id
  );

  -- Orders: lines with no variant mapping (unresolved SKU)
  SELECT COUNT(*) INTO v_unmapped_lines
  FROM order_lines
  WHERE variant_id IS NULL;

  -- Sync: unresolved import errors (severity = error)
  SELECT COUNT(*) INTO v_unresolved_errors
  FROM import_errors
  WHERE severity = 'error'
    AND resolution_status = 'unresolved';

  -- Sync: failed runs last 7 days
  SELECT COUNT(*) INTO v_sync_failures_7d
  FROM import_runs
  WHERE status = 'failed'
    AND run_started_at > now() - interval '7 days';

  -- Sync: last successful run
  SELECT MAX(run_completed_at) INTO v_last_sync_at
  FROM import_runs
  WHERE status IN ('completed','partial');

  -- Inventory: low stock (at or below reorder point)
  SELECT COUNT(*) INTO v_low_stock
  FROM inventory_items
  WHERE is_active
    AND current_stock > 0
    AND reorder_point > 0
    AND current_stock <= reorder_point;

  -- Inventory: out of stock (was ever stocked)
  SELECT COUNT(*) INTO v_out_of_stock
  FROM inventory_items
  WHERE is_active
    AND current_stock = 0
    AND opening_stock > 0;

  -- Inventory: product_variants with no inventory_item row
  SELECT COUNT(*) INTO v_skus_no_inventory
  FROM product_variants pv
  WHERE NOT EXISTS (
    SELECT 1 FROM inventory_items ii WHERE ii.variant_id = pv.id
  );

  RETURN jsonb_build_object(
    'unclassified_bank_count',  v_unclassified_bank,
    'missing_expense_count',    v_missing_expenses,
    'cod_delivered_inr',        ROUND(COALESCE(v_cod_delivered_inr, 0), 2),
    'cod_received_inr',         ROUND(COALESCE(v_cod_received_inr, 0), 2),
    'cod_variance_inr',         ROUND(COALESCE(v_cod_delivered_inr, 0) - COALESCE(v_cod_received_inr, 0), 2),
    'unclassified_order_count', v_unclassified_orders,
    'unmapped_lines_count',     v_unmapped_lines,
    'unresolved_errors_count',  v_unresolved_errors,
    'sync_failures_7d',         v_sync_failures_7d,
    'last_sync_at',             v_last_sync_at,
    'low_stock_count',          v_low_stock,
    'out_of_stock_count',       v_out_of_stock,
    'skus_no_inventory_count',  v_skus_no_inventory
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_data_quality_summary() TO anon, authenticated;
