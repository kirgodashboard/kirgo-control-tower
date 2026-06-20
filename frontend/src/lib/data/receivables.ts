import { supabase } from "@/lib/supabase/client";
import type {
  ReceivablesKpis,
  CustomerReceivablesRow,
  CodReceivablesRow,
  SettlementPendingRow,
  ReceivablesTrendPoint,
  ReceivablesAgeingBucket,
  CollectionPerformancePoint,
} from "@/types/kpi";

export async function fetchReceivablesKpis(): Promise<ReceivablesKpis> {
  const { data, error } = await supabase.rpc("get_receivables_kpis");
  if (error) throw error;
  return data as ReceivablesKpis;
}

export async function fetchCustomerReceivables(limit = 200): Promise<CustomerReceivablesRow[]> {
  const { data, error } = await supabase.rpc("get_customer_receivables", { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as CustomerReceivablesRow[];
}

export async function fetchCodReceivables(limit = 200): Promise<CodReceivablesRow[]> {
  const { data, error } = await supabase.rpc("get_cod_receivables", { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as CodReceivablesRow[];
}

export async function fetchSettlementPending(): Promise<SettlementPendingRow[]> {
  const { data, error } = await supabase.rpc("get_settlement_pending");
  if (error) throw error;
  return (data ?? []) as SettlementPendingRow[];
}

export async function fetchReceivablesTrend(days = 90): Promise<ReceivablesTrendPoint[]> {
  const { data, error } = await supabase.rpc("get_receivables_trend", { p_days: days });
  if (error) throw error;
  return (data ?? []) as ReceivablesTrendPoint[];
}

export async function fetchReceivablesAgeing(): Promise<ReceivablesAgeingBucket[]> {
  const { data, error } = await supabase.rpc("get_receivables_ageing");
  if (error) throw error;
  return (data ?? []) as ReceivablesAgeingBucket[];
}

export async function fetchCollectionPerformance(): Promise<CollectionPerformancePoint[]> {
  const { data, error } = await supabase.rpc("get_collection_performance");
  if (error) throw error;
  return (data ?? []) as CollectionPerformancePoint[];
}
