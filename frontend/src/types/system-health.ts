export interface IntegrationStatus {
  key: string;
  name: string;
  is_enabled: boolean;
  last_run_at: string | null;
  last_status: string | null;
  error_summary: string | null;
  records_fetched: number | null;
}

export interface SystemHealth {
  integrations: IntegrationStatus[] | null;
  latest_order_at: string | null;
  total_orders: number;
  latest_shipment_at: string | null;
  total_shipments: number;
  total_customers: number;
  unclassified_orders: number;
  unclassified_bank: number;
  data_quality_score: number;
  sync_failures_7d: number;
  cod_outstanding_inr: number;
  cod_outstanding_count: number;
}
