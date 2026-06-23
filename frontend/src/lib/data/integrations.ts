import { supabase } from "@/lib/supabase/client";
import type { IntegrationSummary, IntegrationHealth, SyncRun, SyncJob } from "@/types/integrations";

export async function fetchIntegrationHealth(): Promise<IntegrationHealth[]> {
  const { data, error } = await supabase.rpc("get_integration_health");
  if (error) throw error;
  return (data ?? []) as IntegrationHealth[];
}

export async function fetchIntegrationSummary(): Promise<IntegrationSummary[]> {
  const { data, error } = await supabase.rpc("get_integration_summary", { p_company_id: 1 });
  if (error) throw error;
  return (data ?? []) as IntegrationSummary[];
}

export async function fetchRecentSyncRuns(
  integrationKey?: string,
  limit = 25,
): Promise<SyncRun[]> {
  const { data, error } = await supabase.rpc("get_recent_sync_runs", {
    p_integration_key: integrationKey ?? null,
    p_limit:           limit,
  });
  if (error) throw error;
  return (data ?? []) as SyncRun[];
}

export async function fetchSyncJobs(integrationKey?: string): Promise<SyncJob[]> {
  const { data, error } = await supabase.rpc("get_sync_jobs", {
    p_integration_key: integrationKey ?? null,
  });
  if (error) throw error;
  return (data ?? []) as SyncJob[];
}

// Trigger a manual sync — calls the Next.js API route which uses service role.
export async function triggerManualSync(
  jobId: number,
): Promise<{ run_id: number }> {
  const res = await fetch("/api/sync/trigger", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ job_id: jobId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ run_id: number }>;
}
