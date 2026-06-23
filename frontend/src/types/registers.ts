export interface OrderLineItem {
  line_item_id: number;
  product_name: string | null;
  sku: string | null;
  quantity: number;
  unit_price_inr: number;
  line_subtotal: number;
  line_total: number;
}

export interface OrderDetail {
  order_id: number;
  wc_order_id: number;
  order_number: string;
  ordered_at: string;
  paid_at: string | null;
  status: string;
  payment_method: string | null;
  transaction_id: string | null;
  subtotal_inr: number;
  discount_inr: number;
  shipping_inr: number;
  order_total_inr: number;
  billing_city: string | null;
  billing_state: string | null;
  billing_pincode: string | null;
  attribution_source: string | null;
  attribution_medium: string | null;
  attribution_campaign: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  classification: string;
  shipment_status: string | null;
  delivered_at: string | null;
  cod_payable_inr: number | null;
  cod_remittance_date: string | null;
  freight_inr: number | null;
  revenue_recognized: boolean;
  line_items: OrderLineItem[];
}

export interface SalesRegisterRow {
  order_id: number;
  wc_order_id: number;
  order_number: string;
  ordered_at: string;
  customer_name: string | null;
  customer_email: string | null;
  city: string | null;
  state: string | null;
  products: string | null;
  total_qty: number | null;
  subtotal_inr: number;
  discount_inr: number;
  shipping_inr: number;
  order_total_inr: number;
  payment_method: string | null;
  order_status: string;
  classification: string;
  shipment_status: string | null;
  delivered_at: string | null;
  revenue_recognized: boolean;
}

export interface PurchaseRegisterRow {
  po_id: number;
  invoice_number: string | null;
  invoice_date: string | null;
  supplier_name: string;
  currency: string;
  fx_rate_inr: number | null;
  subtotal_foreign: number | null;
  total_foreign: number | null;
  total_inr: number | null;
  payment_terms: string | null;
  payment_method: string | null;
  status: string | null;
  line_count: number;
  total_qty: number;
  items_summary: string | null;
}

export interface ExpensesRegisterRow {
  expense_id: number;
  expense_date: string;
  vendor: string | null;
  description: string;
  category_name: string | null;
  category_group: string | null;
  amount_inr: number;
  payment_method: string | null;
  bank_account: string | null;
  bank_account_id: number | null;
  bank_tx_date: string | null;
  bank_narration: string | null;
  status: string;
  is_classified: boolean;
}

export interface ReceiptRow {
  tx_id: number;
  transaction_date: string;
  bank_account: string;
  bank_account_id: number;
  narration: string;
  counterparty: string | null;
  reference_number: string | null;
  amount_inr: number;
  closing_balance: number | null;
  transaction_type: string;
  value_date: string | null;
}

export interface PaymentRow {
  tx_id: number;
  transaction_date: string;
  bank_account: string;
  bank_account_id: number;
  narration: string;
  counterparty: string | null;
  reference_number: string | null;
  amount_inr: number;
  closing_balance: number | null;
  transaction_type: string;
  value_date: string | null;
}

export interface CustomerOrderRow {
  order_id: number;
  wc_order_id: number;
  order_number: string;
  ordered_at: string;
  order_status: string;
  payment_method: string | null;
  order_total_inr: number;
  shipment_status: string | null;
  delivered_at: string | null;
  classification: string;
  revenue_recognized: boolean;
}

export interface CustomerRegisterRow {
  customer_id: number;
  customer_name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  acquisition_source: string | null;
  first_order_at: string | null;
  last_order_at: string | null;
  days_since_last_order: number | null;
  total_orders: number;
  total_revenue_inr: number;
  avg_order_value_inr: number;
  payment_preference: string | null;
  is_repeat: boolean;
  segment: "new" | "repeat" | "high_value";
}

export interface LogisticsRegisterRow {
  shipment_id: number;
  order_id: number;
  wc_order_id: number;
  order_number: string;
  awb_code: string | null;
  courier_company: string | null;
  channel: string | null;
  zone: string | null;
  status: string | null;
  payment_method: string | null;
  customer_name: string | null;
  customer_city: string | null;
  customer_state: string | null;
  customer_pincode: string | null;
  sku: string | null;
  product_qty: number | null;
  order_total_inr: number;
  freight_inr: number | null;
  cod_charges_inr: number | null;
  cod_payable_inr: number | null;
  cod_remittance_date: string | null;
  cod_crf_id: string | null;
  utr_number: string | null;
  ndr_attempts: number | null;
  latest_ndr_reason: string | null;
  rto_risk: string | null;
  edd: string | null;
  shiprocket_created_at: string | null;
  picked_up_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  rto_initiated_at: string | null;
  rto_delivered_at: string | null;
  days_to_deliver: number | null;
  is_cod_remitted: boolean;
}

export interface WcSyncStatus {
  latest_order_in_db: string | null;
  latest_order_date: string | null;
  latest_wc_order_id: number | null;
  total_orders_in_db: number;
  orders_last_30_days: number;
  orders_last_7_days: number;
  last_sync_at: string | null;
  last_sync_run_status: string | null;
  last_sync_fetched: number | null;
  last_sync_inserted: number | null;
  sync_lag_hours: number | null;
  failed_sync_runs_24h: number;
  recent_sync_errors: Array<{
    error_code: string;
    message: string;
    created_at: string;
  }> | null;
}
