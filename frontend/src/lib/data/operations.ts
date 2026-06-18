import { supabase } from "@/lib/supabase/client";
import type { OperationsKpis } from "@/types/kpi";

export async function fetchOperationsKpis(start: string, end: string): Promise<OperationsKpis> {
  const { data, error } = await supabase.rpc("get_operations_kpis", { p_start: start, p_end: end });
  if (error) throw error;
  return data as OperationsKpis;
}

export async function fetchShipmentFunnel() {
  const { data, error } = await supabase
    .from("v_shipment_funnel")
    .select("*")
    .order("month")
    .limit(12);
  if (error) throw error;
  return data ?? [];
}

export async function fetchCodReconciliation() {
  const { data, error } = await supabase.rpc("get_cod_reconciliation");
  if (error) throw error;
  return data ?? [];
}
