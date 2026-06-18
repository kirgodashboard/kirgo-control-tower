import { supabase } from "@/lib/supabase/client";
import type { ExecutiveKpis, LaunchPerformance, PeriodComparison, TrendPoint } from "@/types/kpi";

export async function fetchExecutiveKpis(start: string, end: string): Promise<ExecutiveKpis> {
  const { data, error } = await supabase.rpc("get_executive_kpis", { p_start: start, p_end: end });
  if (error) throw error;
  return data as ExecutiveKpis;
}

export async function fetchRevenueTrend(start: string, end: string, grain: string): Promise<TrendPoint[]> {
  const { data, error } = await supabase.rpc("get_revenue_trend", { p_start: start, p_end: end, p_grain: grain });
  if (error) throw error;
  return (data ?? []) as TrendPoint[];
}

export async function fetchPeriodComparison(
  currentStart: string, currentEnd: string,
  priorStart: string, priorEnd: string
): Promise<PeriodComparison> {
  const { data, error } = await supabase.rpc("get_period_comparison", {
    p_current_start: currentStart,
    p_current_end: currentEnd,
    p_prior_start: priorStart,
    p_prior_end: priorEnd,
  });
  if (error) throw error;
  return data as PeriodComparison;
}

export async function fetchLaunchPerformance(): Promise<LaunchPerformance[]> {
  const { data, error } = await supabase.rpc("get_launch_performance");
  if (error) throw error;
  return (data ?? []) as LaunchPerformance[];
}
