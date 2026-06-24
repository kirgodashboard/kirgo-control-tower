import { supabase } from "@/lib/supabase/client";

export interface SyncHealthRow {
  job_id:          number;
  integration_key: string;
  entity_type:     string;
  is_active:       boolean;
  schedule_label:  string | null;
  edge_fn_name:    string;
  last_run_at:     string | null;
  last_success_at: string | null;
  last_failed_at:  string | null;
  last_error:      string | null;
  runs_24h:        number;
  success_24h:     number;
  failed_24h:      number;
  records_last_run: number;
  watermark_value: string | null;
  lag_hours:       number | null;
  health_status:   "green" | "amber" | "red" | "unknown";
}

export async function fetchSyncHealth(): Promise<SyncHealthRow[]> {
  const { data, error } = await supabase.rpc("get_sync_health");
  if (error) throw error;
  return (data ?? []) as SyncHealthRow[];
}
