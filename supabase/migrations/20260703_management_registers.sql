-- Management Registers: Sales, Purchases, Expenses, Receipts, Payments + WC Sync Audit
-- Phase 1 + Phase 2 (Data Audit WC Sync Status)

-- ─── 1. Sales Register ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_sales_register(
  p_start          date    DEFAULT NULL,
  p_end            date    DEFAULT NULL,
  p_order_status   text    DEFAULT NULL,
  p_payment_method text    DEFAULT NULL,
  p_city           text    DEFAULT NULL,
  p_limit          int     DEFAULT 200,
  p_offset         int     DEFAULT 0
)
RETURNS TABLE (
  order_id          int,
  wc_order_id       int,
  order_number      text,
  ordered_at        timestamptz,
  customer_name     text,
  customer_email    text,
  city              text,
  state             text,
  products          text,
  total_qty         int,
  subtotal_inr      numeric,
  discount_inr      numeric,
  shipping_inr      numeric,
  order_total_inr   numeric,
  payment_method    text,
  order_status      text,
  classification    text,
  shipment_status   text,
  delivered_at      date,
  revenue_recognized boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    o.id                                                         AS order_id,
    o.woocommerce_order_id                                       AS wc_order_id,
    COALESCE(o.woocommerce_order_number, o.woocommerce_order_id::text) AS order_number,
    o.ordered_at,
    TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) AS customer_name,
    c.email                                                      AS customer_email,
    o.billing_city                                               AS city,
    o.billing_state                                              AS state,
    agg.products,
    agg.total_qty,
    o.subtotal_inr,
    o.discount_inr,
    o.shipping_charged_inr                                       AS shipping_inr,
    o.order_total_inr,
    COALESCE(o.payment_method_title, o.payment_method)          AS payment_method,
    o.status                                                     AS order_status,
    COALESCE(oc.classification::text, 'unclassified')            AS classification,
    s.status                                                     AS shipment_status,
    s.delivered_at::date                                         AS delivered_at,
    (s.status = 'DELIVERED' AND s.delivered_at IS NOT NULL)      AS revenue_recognized
  FROM orders o
  LEFT JOIN customers c ON c.id = o.customer_id
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  LEFT JOIN LATERAL (
    SELECT
      STRING_AGG(DISTINCT ol.product_name_raw, ', ' ORDER BY ol.product_name_raw) AS products,
      SUM(ol.quantity)::int AS total_qty
    FROM order_lines ol
    WHERE ol.order_id = o.id
  ) agg ON true
  LEFT JOIN LATERAL (
    SELECT status, delivered_at
    FROM shipments
    WHERE order_id = o.id
    ORDER BY created_at DESC
    LIMIT 1
  ) s ON true
  WHERE (p_start IS NULL OR o.ordered_at::date >= p_start)
    AND (p_end   IS NULL OR o.ordered_at::date <= p_end)
    AND (p_order_status   IS NULL OR o.status = p_order_status)
    AND (p_payment_method IS NULL OR LOWER(o.payment_method) = LOWER(p_payment_method))
    AND (p_city           IS NULL OR LOWER(o.billing_city)   ILIKE '%' || LOWER(p_city) || '%')
  ORDER BY o.ordered_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;

-- ─── 2. Purchase Register ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_purchase_register(
  p_start    date DEFAULT NULL,
  p_end      date DEFAULT NULL,
  p_supplier text DEFAULT NULL,
  p_status   text DEFAULT NULL,
  p_limit    int  DEFAULT 200,
  p_offset   int  DEFAULT 0
)
RETURNS TABLE (
  po_id            int,
  invoice_number   text,
  invoice_date     date,
  supplier_name    text,
  currency         text,
  fx_rate_inr      numeric,
  subtotal_foreign numeric,
  total_foreign    numeric,
  total_inr        numeric,
  payment_terms    text,
  payment_method   text,
  status           text,
  line_count       int,
  total_qty        int,
  items_summary    text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    po.id                                            AS po_id,
    po.invoice_number,
    po.invoice_date,
    po.supplier_name,
    po.currency,
    po.fx_rate_inr,
    po.subtotal_foreign,
    po.total_foreign,
    po.total_inr,
    po.payment_terms,
    po.payment_method,
    po.status,
    agg.line_count,
    agg.total_qty,
    agg.items_summary
  FROM purchase_orders po
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::int                                      AS line_count,
      SUM(pol.quantity)::int                             AS total_qty,
      STRING_AGG(
        COALESCE(pol.description, pol.supplier_style_no, '?') || ' ×' || pol.quantity::text,
        '; ' ORDER BY pol.id
      )                                                  AS items_summary
    FROM purchase_order_lines pol
    WHERE pol.purchase_order_id = po.id
  ) agg ON true
  WHERE (p_start    IS NULL OR po.invoice_date >= p_start)
    AND (p_end      IS NULL OR po.invoice_date <= p_end)
    AND (p_supplier IS NULL OR LOWER(po.supplier_name) ILIKE '%' || LOWER(p_supplier) || '%')
    AND (p_status   IS NULL OR po.status = p_status)
  ORDER BY po.invoice_date DESC NULLS LAST, po.id DESC
  LIMIT p_limit OFFSET p_offset;
$$;

-- ─── 3. Expenses Register ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_expenses_register(
  p_start          date    DEFAULT NULL,
  p_end            date    DEFAULT NULL,
  p_category_id    int     DEFAULT NULL,
  p_vendor         text    DEFAULT NULL,
  p_bank_account_id int    DEFAULT NULL,
  p_limit          int     DEFAULT 200,
  p_offset         int     DEFAULT 0
)
RETURNS TABLE (
  expense_id       int,
  expense_date     date,
  vendor           text,
  description      text,
  category_name    text,
  category_group   text,
  amount_inr       numeric,
  payment_method   text,
  bank_account     text,
  bank_account_id  int,
  bank_tx_date     date,
  bank_narration   text,
  status           text,
  is_classified    boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    e.id                  AS expense_id,
    e.expense_date,
    e.vendor,
    e.description,
    ec.name               AS category_name,
    ec.category_group,
    e.amount_inr,
    e.payment_method,
    CASE WHEN ba.id IS NOT NULL
      THEN ba.bank_name || ' · ' || ba.account_name
      ELSE NULL
    END                   AS bank_account,
    bt.bank_account_id,
    bt.transaction_date   AS bank_tx_date,
    bt.narration_raw      AS bank_narration,
    e.status,
    (e.bank_transaction_id IS NOT NULL) AS is_classified
  FROM expenses e
  LEFT JOIN expense_categories ec ON ec.id = e.category_id
  LEFT JOIN bank_transactions bt  ON bt.id = e.bank_transaction_id
  LEFT JOIN bank_accounts ba      ON ba.id = bt.bank_account_id
  WHERE (p_start         IS NULL OR e.expense_date >= p_start)
    AND (p_end           IS NULL OR e.expense_date <= p_end)
    AND (p_category_id   IS NULL OR e.category_id = p_category_id)
    AND (p_vendor        IS NULL OR LOWER(e.vendor) ILIKE '%' || LOWER(p_vendor) || '%')
    AND (p_bank_account_id IS NULL OR bt.bank_account_id = p_bank_account_id)
  ORDER BY e.expense_date DESC, e.id DESC
  LIMIT p_limit OFFSET p_offset;
$$;

-- ─── 4. Receipts Register ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_receipts_register(
  p_start           date DEFAULT NULL,
  p_end             date DEFAULT NULL,
  p_bank_account_id int  DEFAULT NULL,
  p_type            text DEFAULT NULL,
  p_limit           int  DEFAULT 200,
  p_offset          int  DEFAULT 0
)
RETURNS TABLE (
  tx_id              int,
  transaction_date   date,
  bank_account       text,
  bank_account_id    int,
  narration          text,
  counterparty       text,
  reference_number   text,
  amount_inr         numeric,
  closing_balance    numeric,
  transaction_type   text,
  value_date         date
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    bt.id                  AS tx_id,
    bt.transaction_date,
    ba.bank_name || ' · ' || ba.account_name AS bank_account,
    bt.bank_account_id,
    bt.narration_raw       AS narration,
    bt.counterparty,
    COALESCE(bt.reference_number, bt.extracted_reference) AS reference_number,
    bt.deposit_inr         AS amount_inr,
    bt.closing_balance_inr AS closing_balance,
    bt.transaction_type,
    bt.value_date
  FROM bank_transactions bt
  JOIN bank_accounts ba ON ba.id = bt.bank_account_id
  WHERE bt.deposit_inr > 0
    AND (p_start           IS NULL OR bt.transaction_date >= p_start)
    AND (p_end             IS NULL OR bt.transaction_date <= p_end)
    AND (p_bank_account_id IS NULL OR bt.bank_account_id = p_bank_account_id)
    AND (p_type            IS NULL OR bt.transaction_type = p_type)
  ORDER BY bt.transaction_date DESC, bt.id DESC
  LIMIT p_limit OFFSET p_offset;
$$;

-- ─── 5. Payments Register ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_payments_register(
  p_start           date DEFAULT NULL,
  p_end             date DEFAULT NULL,
  p_bank_account_id int  DEFAULT NULL,
  p_type            text DEFAULT NULL,
  p_limit           int  DEFAULT 200,
  p_offset          int  DEFAULT 0
)
RETURNS TABLE (
  tx_id              int,
  transaction_date   date,
  bank_account       text,
  bank_account_id    int,
  narration          text,
  counterparty       text,
  reference_number   text,
  amount_inr         numeric,
  closing_balance    numeric,
  transaction_type   text,
  value_date         date
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    bt.id                  AS tx_id,
    bt.transaction_date,
    ba.bank_name || ' · ' || ba.account_name AS bank_account,
    bt.bank_account_id,
    bt.narration_raw       AS narration,
    bt.counterparty,
    COALESCE(bt.reference_number, bt.extracted_reference) AS reference_number,
    bt.withdrawal_inr      AS amount_inr,
    bt.closing_balance_inr AS closing_balance,
    bt.transaction_type,
    bt.value_date
  FROM bank_transactions bt
  JOIN bank_accounts ba ON ba.id = bt.bank_account_id
  WHERE bt.withdrawal_inr > 0
    AND (p_start           IS NULL OR bt.transaction_date >= p_start)
    AND (p_end             IS NULL OR bt.transaction_date <= p_end)
    AND (p_bank_account_id IS NULL OR bt.bank_account_id = p_bank_account_id)
    AND (p_type            IS NULL OR bt.transaction_type = p_type)
  ORDER BY bt.transaction_date DESC, bt.id DESC
  LIMIT p_limit OFFSET p_offset;
$$;

-- ─── 6. WC Sync Status (Phase 2 Data Audit) ──────────────────────────────────

CREATE OR REPLACE FUNCTION get_wc_sync_status()
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT json_build_object(
    'latest_order_in_db',    (SELECT MAX(ordered_at) FROM orders),
    'latest_order_date',     (SELECT MAX(ordered_at)::date FROM orders),
    'latest_wc_order_id',    (SELECT MAX(woocommerce_order_id) FROM orders),
    'total_orders_in_db',    (SELECT COUNT(*) FROM orders),
    'orders_last_30_days',   (SELECT COUNT(*) FROM orders WHERE ordered_at >= NOW() - INTERVAL '30 days'),
    'orders_last_7_days',    (SELECT COUNT(*) FROM orders WHERE ordered_at >= NOW() - INTERVAL '7 days'),
    'last_sync_at',          (SELECT MAX(completed_at) FROM sync_runs WHERE sync_type = 'woocommerce' AND status = 'success'),
    'last_sync_run_status',  (SELECT status FROM sync_runs WHERE sync_type = 'woocommerce' ORDER BY started_at DESC LIMIT 1),
    'last_sync_fetched',     (SELECT records_fetched FROM sync_runs WHERE sync_type = 'woocommerce' AND status = 'success' ORDER BY completed_at DESC LIMIT 1),
    'last_sync_inserted',    (SELECT records_inserted FROM sync_runs WHERE sync_type = 'woocommerce' AND status = 'success' ORDER BY completed_at DESC LIMIT 1),
    'sync_lag_hours',        EXTRACT(EPOCH FROM (NOW() - (SELECT MAX(completed_at) FROM sync_runs WHERE sync_type = 'woocommerce' AND status = 'success'))) / 3600,
    'failed_sync_runs_24h',  (SELECT COUNT(*) FROM sync_runs WHERE sync_type = 'woocommerce' AND status = 'error' AND started_at >= NOW() - INTERVAL '24 hours'),
    'recent_sync_errors',    (
      SELECT json_agg(json_build_object(
        'error_code', se.error_code,
        'message', se.message,
        'created_at', se.created_at
      ) ORDER BY se.created_at DESC)
      FROM sync_errors se
      JOIN sync_runs sr ON sr.id = se.sync_run_id
      WHERE sr.sync_type = 'woocommerce'
        AND se.created_at >= NOW() - INTERVAL '7 days'
      LIMIT 5
    )
  );
$$;
