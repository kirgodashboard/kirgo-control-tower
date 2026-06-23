import { supabase as db } from "@/lib/supabase/client";

export interface AuditRevenueReconciliation {
  total_orders: number;
  gross_rev_lines_inr: number;
  gross_rev_orders_inr: number;
  line_order_variance_inr: number;
  commercial_orders: number;
  commercial_rev_inr: number;
  non_commercial_orders: number;
  promo_value_inr: number;
  unclassified_orders: number;
  delivered_orders: number;
  recognized_rev_inr: number;
  first_order_at: string | null;
  last_order_at: string | null;
  wc_fetched: number;
  wc_inserted: number;
  wc_updated: number;
  wc_failed_runs: number;
  wc_last_sync_at: string | null;
}

export interface AuditOrderReconciliation {
  by_status: { status: string; cnt: number; revenue_inr: number }[];
  overview: {
    total_orders: number;
    has_shipment: number;
    completed_no_shipment: number;
    linked_customer: number;
    no_customer: number;
    no_payment_method: number;
    unclassified: number;
    months_covered: number;
  };
}

export interface AuditShipmentReconciliation {
  shipments: {
    total_rows: number;
    unique_sr_orders: number;
    linked_wc_orders: number;
    orphaned_rows: number;
    delivered_ok: number;
    delivered_no_date: number;
    rto_returned: number;
    in_transit: number;
    cod_rows: number;
    prepaid_rows: number;
    total_freight_inr: number;
    total_cod_payable_inr: number;
    last_delivery_at: string | null;
  };
  returns: {
    total_returns: number;
    customer_returns: number;
    rto_returns: number;
    qc_pass: number;
    qc_fail: number;
    qc_pending: number;
    total_refunds_inr: number;
  };
  sync: {
    total_fetched: number;
    total_inserted: number;
    last_sync_at: string | null;
    failed_runs: number;
  };
}

export interface AuditCodReconciliation {
  cod_deliveries: number;
  cod_payable_inr: number;
  cod_charges_inr: number;
  remitted_in_sr_inr: number;
  remittance_dated_rows: number;
  bank_cod_received_inr: number;
  bank_entries: number;
  variance_inr: number;
  variance_pct: number;
}

export interface AuditInfluencerOrder {
  order_id: number;
  wc_order_id: number;
  ordered_at: string;
  order_total_inr: number;
  payment_method: string | null;
  classification: string;
  is_manual: boolean;
  has_shipment: boolean;
  shipment_status: string | null;
  delivered_at: string | null;
  suggested_category: string;
}

export interface AuditSetProduct {
  product_id: number;
  set_name: string;
  set_price_inr: number;
  bom_id: number;
  component_count: number;
  total_ssp_inr: number;
  has_bra: boolean;
  has_leggings: boolean;
  bom_valid: boolean;
  ssp_vs_price_ok: boolean;
  orders_count: number;
  units_sold: number;
  explosion_lines: number;
  exploded_orders: number;
  explosion_coverage_pct: number;
}

export interface AuditRevenueRecognitionHealth {
  shipment_health: {
    total_delivered: number;
    delivered_with_date: number;
    delivered_missing_date: number;
    non_delivered_has_date: number;
  };
  revenue_mismatch: {
    orders_mismatched: number;
    total_mismatch_inr: number;
  };
  line_health: {
    total_lines: number;
    mapped_lines: number;
    unmapped_lines: number;
    zero_rev_lines: number;
  };
  classification_health: {
    total_orders: number;
    classified: number;
    unclassified: number;
    manually_classified: number;
  };
}

export async function fetchAuditRevenue(): Promise<AuditRevenueReconciliation> {
  const { data, error } = await db.rpc("get_audit_revenue_reconciliation");
  if (error) throw error;
  return data as AuditRevenueReconciliation;
}

export async function fetchAuditOrders(): Promise<AuditOrderReconciliation> {
  const { data, error } = await db.rpc("get_audit_order_reconciliation");
  if (error) throw error;
  return data as AuditOrderReconciliation;
}

export async function fetchAuditShipments(): Promise<AuditShipmentReconciliation> {
  const { data, error } = await db.rpc("get_audit_shipment_reconciliation");
  if (error) throw error;
  return data as AuditShipmentReconciliation;
}

export async function fetchAuditCod(): Promise<AuditCodReconciliation> {
  const { data, error } = await db.rpc("get_audit_cod_reconciliation");
  if (error) throw error;
  return data as AuditCodReconciliation;
}

export async function fetchAuditInfluencerOrders(): Promise<AuditInfluencerOrder[]> {
  const { data, error } = await db.rpc("get_audit_influencer_orders");
  if (error) throw error;
  return (data ?? []) as AuditInfluencerOrder[];
}

export async function fetchAuditSetProducts(): Promise<AuditSetProduct[]> {
  const { data, error } = await db.rpc("get_audit_set_products");
  if (error) throw error;
  return (data ?? []) as AuditSetProduct[];
}

export async function fetchAuditRecognitionHealth(): Promise<AuditRevenueRecognitionHealth> {
  const { data, error } = await db.rpc("get_audit_revenue_recognition_health");
  if (error) throw error;
  return data as AuditRevenueRecognitionHealth;
}
