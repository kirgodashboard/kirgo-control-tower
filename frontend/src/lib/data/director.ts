import { supabase } from "@/lib/supabase/client";
import type { DirectorSnapshot, SystemAlert } from "@/types/kpi";

export async function fetchDirectorSnapshot(): Promise<DirectorSnapshot> {
  const { data, error } = await supabase.rpc("get_director_snapshot");
  if (error) throw error;
  return data as DirectorSnapshot;
}

export async function fetchSystemAlerts(): Promise<SystemAlert[]> {
  const { data, error } = await supabase
    .from("v_system_alerts")
    .select("*")
    .order("severity", { ascending: true }); // RED < AMBER < GREEN alphabetically reversed — sort client-side
  if (error) throw error;

  const order = { RED: 0, AMBER: 1, GREEN: 2 };
  return ((data ?? []) as SystemAlert[]).sort(
    (a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3)
  );
}

export async function fetchRevenueTrend30d() {
  const today = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase.rpc("get_revenue_trend", {
    p_start: start,
    p_end: today,
    p_grain: "day",
  });
  if (error) throw error;
  return data ?? [];
}

export async function fetchCashFlow30d() {
  const start = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("v_cash_flow_daily")
    .select("*")
    .gte("transaction_date", start)
    .order("transaction_date");
  if (error) throw error;
  return data ?? [];
}
