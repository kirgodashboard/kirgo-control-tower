-- Fix 1: get_data_quality_summary crashed with "column max_stock does not exist"
--   inventory_items uses: current_stock, opening_stock, reorder_point (not max_stock/reorder_level)
--   This caused the entire RPC to error, making data quality page blank and refresh broken.
--
-- Fix 2: get_classification_summary used FROM order_classifications JOIN orders
--   so orders with NO classification record were invisible (2 new orders: 2061, 2062)
--   → changed to FROM orders LEFT JOIN to capture all orders
--
-- Fix 3: get_orders_by_classification WHERE clause
--   oc.classification = 'unclassified' never matched because unclassified orders have
--   oc IS NULL (no record), not a literal 'unclassified' enum value.

-- ─── Fix 1: data quality summary ───────────────────────────────────────────

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

  -- COD outstanding (canonical function, 0 when all settled)
  v_cod_delivered_inr := cod_receivable_inr();
  v_cod_received_inr  := 0;
  v_cod_variance_inr  := v_cod_delivered_inr;

  -- Orders: no classification record at all
  SELECT COUNT(*) INTO v_unclassified_order_count
  FROM orders o
  WHERE NOT EXISTS (SELECT 1 FROM order_classifications oc WHERE oc.order_id = o.id);

  -- Orders: lines with no variant mapping
  SELECT COUNT(*) INTO v_unmapped_lines_count
  FROM order_lines WHERE variant_id IS NULL;

  -- Inventory: out of stock (was ever stocked = opening_stock > 0, now 0)
  SELECT COUNT(*) FILTER (WHERE current_stock = 0 AND opening_stock > 0)
  INTO v_out_of_stock_count
  FROM inventory_items;

  -- Inventory: low stock (> 0 but at or below reorder_point)
  SELECT COUNT(*) FILTER (WHERE current_stock > 0 AND reorder_point > 0 AND current_stock <= reorder_point)
  INTO v_low_stock_count
  FROM inventory_items;

  -- Inventory: SKUs used in orders with no inventory record
  SELECT COUNT(DISTINCT ol.sku_raw)
  INTO v_skus_no_inventory_count
  FROM order_lines ol
  WHERE ol.sku_raw IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM inventory_items ii WHERE ii.sku = ol.sku_raw);

  -- Sync: unresolved errors (column is `resolved` boolean, not resolved_at)
  SELECT COUNT(*) INTO v_unresolved_errors_count
  FROM sync_errors WHERE resolved = false;

  -- Sync: failures in last 7 days
  SELECT COUNT(*) INTO v_sync_failures_7d
  FROM sync_runs
  WHERE status = 'failed' AND started_at > NOW() - INTERVAL '7 days';

  -- Sync: last successful
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


-- ─── Fix 2: classification summary includes orders with no record ───────────

CREATE OR REPLACE FUNCTION get_classification_summary()
RETURNS TABLE (
  classification  text,
  order_count     bigint,
  total_value_inr numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE(oc.classification::text, 'unclassified') AS classification,
    COUNT(*)                                           AS order_count,
    COALESCE(SUM(o.order_total_inr), 0)               AS total_value_inr
  FROM orders o
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  GROUP BY COALESCE(oc.classification::text, 'unclassified')
  ORDER BY order_count DESC;
$$;


-- ─── Fix 3: orders-by-classification handles NULL (no record) correctly ──────

CREATE OR REPLACE FUNCTION get_orders_by_classification(
  p_classification text    DEFAULT NULL,
  p_limit          int     DEFAULT 100,
  p_offset         int     DEFAULT 0
)
RETURNS TABLE (
  id                  int,
  woocommerce_order_id int,
  customer_name       text,
  ordered_at          date,
  order_total_inr     numeric,
  payment_method      text,
  status              text,
  billing_city        text,
  classification      text,
  is_manual           boolean,
  notes               text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    o.id,
    o.woocommerce_order_id,
    COALESCE(
      NULLIF(TRIM(
        COALESCE(o.billing_first_name, c.first_name, '') || ' ' ||
        COALESCE(o.billing_last_name,  c.last_name,  '')
      ), ''),
      c.email,
      'Unknown'
    )                                                   AS customer_name,
    o.ordered_at::date,
    o.order_total_inr,
    COALESCE(o.payment_method_title, o.payment_method)  AS payment_method,
    o.status,
    o.billing_city,
    COALESCE(oc.classification::text, 'unclassified')   AS classification,
    COALESCE(oc.is_manual, false)                        AS is_manual,
    oc.notes
  FROM orders o
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  LEFT JOIN customers c ON c.id = o.customer_id
  WHERE
    p_classification IS NULL
    OR (p_classification = 'unclassified' AND oc.order_id IS NULL)
    OR (p_classification != 'unclassified' AND oc.classification::text = p_classification)
  ORDER BY o.ordered_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;
