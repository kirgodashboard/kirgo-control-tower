import { supabase } from "@/lib/supabase/client";
import type { DataQualitySummary } from "@/types/kpi";

export async function fetchDataQualitySummary(): Promise<DataQualitySummary> {
  const { data, error } = await supabase.rpc("get_data_quality_summary");
  if (error) throw error;
  return data as DataQualitySummary;
}
