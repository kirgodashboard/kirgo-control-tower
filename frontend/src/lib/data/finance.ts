import { supabase } from "@/lib/supabase/client";
import type { FinanceKpis } from "@/types/kpi";

export async function fetchFinanceKpis(start: string, end: string): Promise<FinanceKpis> {
  const { data, error } = await supabase.rpc("get_finance_kpis", { p_start: start, p_end: end });
  if (error) throw error;
  return data as FinanceKpis;
}

export async function fetchCashFlowDaily(start: string) {
  const { data, error } = await supabase
    .from("v_cash_flow_daily")
    .select("*")
    .gte("transaction_date", start)
    .order("transaction_date");
  if (error) throw error;
  return data ?? [];
}

export async function fetchGatewaySettlements() {
  const { data, error } = await supabase
    .from("v_gateway_settlements_summary")
    .select("*")
    .order("month", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
