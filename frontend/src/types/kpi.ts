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
