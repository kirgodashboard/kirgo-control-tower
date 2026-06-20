export interface DirectorSnapshot {
  revenue_mtd_inr: number;
  revenue_prior_month_inr: number;
  revenue_mtd_change_pct: number;
  orders_mtd: number;
  orders_prior_month: number;
  orders_mtd_change_pct: number;
  cash_position_inr: number;
  cod_outstanding_inr: number;
  cod_outstanding_count: number;
  delivery_success_pct: number;
  rto_rate_pct: number;
  return_rate_pct: number;
  repeat_customer_pct: number;
  red_alert_count: number;
  amber_alert_count: number;
  system_status: "RED" | "AMBER" | "GREEN";
}

export type AlertSeverity = "RED" | "AMBER" | "GREEN";

export interface SystemAlert {
  severity: AlertSeverity;
  alert_type: string;
  title: string;
  detail: string;
  raised_at: string;
}

export interface ExecutiveKpis {
  gross_revenue_inr: number;
  orders_count: number;
  aov_inr: number;
  unique_customers: number;
  new_customers: number;
  cod_pct: number;
  return_count: number;
  return_rate_pct: number;
}

export interface CustomerKpis {
  total_customers: number;
  new_customers: number;
  repeat_customers: number;
  repeat_purchase_pct: number;
  avg_orders_per_customer: number;
}

export interface OperationsKpis {
  total_shipments: number;
  delivered: number;
  in_transit: number;
  rto: number;
  pending: number;
  delivery_success_pct: number;
  rto_rate_pct: number;
  cod_outstanding_inr: number;
  cod_outstanding_count: number;
}

export interface FinanceKpis {
  cash_inflow_inr: number;
  cash_outflow_inr: number;
  net_cash_inr: number;
  transaction_count: number;
  latest_balance_inr: number;
}

export interface PeriodComparison {
  current_revenue: number;
  prior_revenue: number;
  revenue_change_pct: number;
  current_orders: number;
  prior_orders: number;
  orders_change_pct: number;
}

export interface TrendPoint {
  period: string;
  revenue_inr: number;
  orders_count: number;
  aov_inr: number;
}

export interface LaunchPerformance {
  launch_id: string;
  launch_name: string;
  live_date: string;
  revenue_inr: number;
  orders_count: number;
  aov_inr: number;
}

// ── Profitability ────────────────────────────────────────────────────────────

export interface ProfitabilityKpis {
  revenue_inr: number;
  cogs_inr: number;
  gross_profit_inr: number;
  gross_margin_pct: number;
  shipping_cost_inr: number;
  cod_charges_inr: number;
  ad_spend_inr: number;
  promo_spend_inr: number;
  contribution_margin_inr: number;
  contribution_margin_pct: number;
  return_cost_inr: number;
}

export interface ProfitabilityTrendPoint {
  period: string;
  revenue_inr: number;
  cogs_inr: number;
  gross_profit_inr: number;
  gross_margin_pct: number;
}

export interface ProductPl {
  product_name: string;
  launch_code: string;
  product_type: string;
  orders_count: number;
  units_sold: number;
  revenue_inr: number;
  cogs_inr: number;
  gross_profit_inr: number;
  gross_margin_pct: number;
}

export interface SkuPl {
  sku: string;
  product_name: string;
  launch_code: string;
  size: string | null;
  orders_count: number;
  units_sold: number;
  revenue_inr: number;
  cogs_inr: number;
  gross_profit_inr: number;
  gross_margin_pct: number;
}

export interface CityPl {
  city: string;
  orders_count: number;
  units_sold: number;
  revenue_inr: number;
  cogs_inr: number;
  gross_profit_inr: number;
  gross_margin_pct: number;
}

export interface LaunchPl {
  launch_code: string;
  launch_name: string;
  launched_at: string | null;
  total_investment_inr: number | null;
  revenue_inr: number;
  cogs_inr: number;
  gross_profit_inr: number;
  gross_margin_pct: number;
  orders_count: number;
  units_sold: number;
}

export interface CustomerPl {
  customer_ref: string;
  orders_count: number;
  units_sold: number;
  revenue_inr: number;
  cogs_inr: number;
  gross_profit_inr: number;
  gross_margin_pct: number;
}

// ── Expense Intelligence ──────────────────────────────────────────────────────

export interface ExpenseKpis {
  total_expense_inr: number;
  monthly_run_rate_inr: number;
  largest_head_name: string;
  largest_head_amount_inr: number;
  largest_vendor: string;
  largest_vendor_amount_inr: number;
  expense_growth_pct: number | null;
  unclassified_count: number;
}

export interface ExpenseListItem {
  id: number;
  expense_date: string;
  category_name: string;
  category_id: number;
  description: string;
  amount_inr: number;
  vendor: string | null;
  payment_method: string | null;
  notes: string | null;
  status: string | null;
  attachment_url: string | null;
  bank_transaction_id: number | null;
}

export interface ExpenseByCategory {
  category_name: string;
  category_id: number;
  total_inr: number;
  transaction_count: number;
  pct_of_total: number;
}

export interface ExpenseTrendPoint {
  period: string;
  total_inr: number;
  transaction_count: number;
}

export interface ExpenseVendor {
  vendor: string;
  total_inr: number;
  transaction_count: number;
  last_expense_date: string;
}

export interface ExpenseCategory {
  id: number;
  code: string;
  name: string;
  category_group: string;
}

export interface UnclassifiedTransaction {
  id: number;
  transaction_date: string;
  narration_raw: string;
  withdrawal_inr: number;
  closing_balance_inr: number | null;
  counterparty: string | null;
}

// ── Inventory ─────────────────────────────────────────────────────────────────

export interface InventoryKpis {
  total_skus: number;
  active_skus: number;
  total_units: number;
  stock_value_inr: number;
  low_stock_count: number;
  out_of_stock_count: number;
}

export interface StockPositionRow {
  id: number;
  sku: string;
  product_name: string;
  current_stock: number;
  reorder_point: number;
  reorder_qty: number;
  unit_cost_inr: number | null;
  stock_value_inr: number | null;
  location: string | null;
  status: "ok" | "low" | "out";
  last_movement_at: string | null;
}

export interface StockMovementRow {
  id: number;
  inventory_item_id: number;
  sku: string;
  product_name: string;
  movement_type: string;
  quantity: number;
  stock_after: number;
  unit_cost_inr: number | null;
  reference_type: string | null;
  reference_id: number | null;
  notes: string | null;
  moved_at: string;
}

export interface StockAgeingRow {
  id: number;
  sku: string;
  product_name: string;
  current_stock: number;
  days_in_stock: number;
  age_bucket: "fresh" | "watch" | "slow" | "dead";
  stock_value_inr: number | null;
  last_inflow_at: string | null;
}

export interface ReorderRow {
  id: number;
  sku: string;
  product_name: string;
  current_stock: number;
  reorder_point: number;
  reorder_qty: number;
  unit_cost_inr: number | null;
  suggested_order_value_inr: number | null;
  days_since_last_inflow: number | null;
}

// ── Order Classification + Receivables ───────────────────────────────────────

export type OrderClass =
  | "paid_sale"
  | "cod_pending"
  | "influencer_promotion"
  | "brand_seeding"
  | "replacement"
  | "warranty"
  | "internal_use"
  | "cancelled"
  | "unclassified";

export interface ClassificationSummaryItem {
  classification: string;
  order_count: number;
  total_value_inr: number;
}

export interface OrderClassificationRow {
  order_id: number;
  woocommerce_order_id: number;
  customer_name: string;
  ordered_at: string;
  order_total_inr: number;
  payment_method: string;
  status: string;
  billing_city: string | null;
  classification: OrderClass;
  is_manual: boolean;
  notes: string | null;
}

export interface ReceivablesSummary {
  total_outstanding_inr: number;
  order_count: number;
  avg_days_outstanding: number;
  oldest_days: number;
}

export interface ReceivablesListItem {
  order_id: number;
  woocommerce_order_id: number;
  customer_name: string;
  ordered_at: string;
  order_total_inr: number;
  days_outstanding: number;
  status: string;
  billing_city: string | null;
}

// ── Data Quality ─────────────────────────────────────────────────────────────

export interface DataQualitySummary {
  unclassified_bank_count: number;
  missing_expense_count: number;
  cod_delivered_inr: number;
  cod_received_inr: number;
  cod_variance_inr: number;
  unclassified_order_count: number;
  unmapped_lines_count: number;
  unresolved_errors_count: number;
  sync_failures_7d: number;
  last_sync_at: string | null;
  low_stock_count: number;
  out_of_stock_count: number;
  skus_no_inventory_count: number;
}
