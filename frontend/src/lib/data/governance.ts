import { supabase as db } from "@/lib/supabase/client";

export interface MetricCatalogEntry {
  metric_key: string;
  display_name: string;
  acronym: string | null;
  category: string;
  owner_dashboard: string;
  definition: string;
  formula: string;
  source_tables: string;
  source_rpc: string | null;
  unit: string;
  basis: string | null;
  notes: string | null;
  updated_at: string;
}

export interface TrustCheck {
  key: string;
  label: string;
  status: "GREEN" | "AMBER" | "RED";
  detail: string;
  expected: string | number;
  actual: string | number;
}

export interface DataTrustLatest {
  run_at: string;
  trust_score: number;
  status: "GREEN" | "AMBER" | "RED";
  checks: TrustCheck[];
}

export interface DataTrustHistoryPoint {
  run_at: string;
  trust_score: number;
  status: "GREEN" | "AMBER" | "RED";
}

export async function fetchMetricCatalog(): Promise<MetricCatalogEntry[]> {
  const { data, error } = await db
    .from("metric_catalog")
    .select("*")
    .order("category", { ascending: true })
    .order("display_name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MetricCatalogEntry[];
}

export async function fetchDataTrustLatest(): Promise<DataTrustLatest | null> {
  const { data, error } = await db.rpc("get_data_trust_latest");
  if (error) throw error;
  return (data ?? null) as DataTrustLatest | null;
}

export async function fetchDataTrustHistory(limit = 30): Promise<DataTrustHistoryPoint[]> {
  const { data, error } = await db.rpc("get_data_trust_history", { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as DataTrustHistoryPoint[];
}

export async function runDataTrustCheck(): Promise<DataTrustLatest> {
  const { data, error } = await db.rpc("run_data_trust_check", { p_triggered_by: "manual" });
  if (error) throw error;
  return data as DataTrustLatest;
}
