// Shared utilities for all sync Edge Functions.
// Imported by sync-woocommerce, sync-shiprocket, sync-razorpay, sync-gokwik, sync-bank-feed.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Supabase admin client (service role — bypasses RLS) ─────────────────────

export function makeSupabaseAdmin(): SupabaseClient {
  const url  = Deno.env.get("SUPABASE_URL")!;
  const key  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SyncJob {
  id:              number;
  integration_key: string;
  entity_type:     string;
  sync_mode:       "incremental" | "full";
  watermark_field: string | null;
  watermark_value: string | null;
  overlap_minutes: number;
  batch_size:      number;
  config:          Record<string, unknown>;  // from integration_settings
  secret_ref:      string | null;
}

export interface RunCounters {
  records_fetched:  number;
  records_inserted: number;
  records_updated:  number;
  records_skipped:  number;
  records_failed:   number;
}

export type SyncRunStatus = "running" | "success" | "partial" | "failed";

// ─── Run lifecycle helpers ────────────────────────────────────────────────────

export async function createSyncRun(
  db:           SupabaseClient,
  job:          SyncJob,
  triggeredBy:  "schedule" | "manual" | "webhook",
  watermarkFrom: string | null,
): Promise<number> {
  const { data, error } = await db
    .from("sync_runs")
    .insert({
      sync_job_id:     job.id,
      integration_key: job.integration_key,
      entity_type:     job.entity_type,
      triggered_by:    triggeredBy,
      status:          "running",
      watermark_from:  watermarkFrom,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create sync_run: ${error.message}`);
  return data.id as number;
}

export async function completeSyncRun(
  db:          SupabaseClient,
  runId:       number,
  status:      SyncRunStatus,
  counters:    RunCounters,
  watermarkTo: string | null,
  errorSummary: string | null,
  metadata:    Record<string, unknown>,
): Promise<void> {
  const { error } = await db
    .from("sync_runs")
    .update({
      status,
      completed_at:     new Date().toISOString(),
      watermark_to:     watermarkTo,
      error_summary:    errorSummary,
      metadata,
      ...counters,
    })
    .eq("id", runId);

  if (error) throw new Error(`Failed to complete sync_run ${runId}: ${error.message}`);
}

export async function advanceWatermark(
  db:     SupabaseClient,
  jobId:  number,
  value:  string,
): Promise<void> {
  const { error } = await db
    .from("sync_jobs")
    .update({ watermark_value: value, updated_at: new Date().toISOString() })
    .eq("id", jobId);

  if (error) throw new Error(`Failed to advance watermark for job ${jobId}: ${error.message}`);
}

export async function recordSyncError(
  db:             SupabaseClient,
  runId:          number,
  integrationKey: string,
  entityType:     string,
  sourceId:       string | null,
  errorCode:      string,
  message:        string,
  rawPayload:     unknown,
): Promise<void> {
  // Truncate payload to avoid blowing out storage
  let payload = rawPayload;
  if (payload && JSON.stringify(payload).length > 65_536) {
    payload = { _truncated: true };
  }
  await db.from("sync_errors").insert({
    sync_run_id:     runId,
    integration_key: integrationKey,
    entity_type:     entityType,
    source_id:       sourceId,
    error_code:      errorCode,
    error_message:   message,
    raw_payload:     payload,
  });
}

// ─── Watermark helpers ────────────────────────────────────────────────────────

export function computeWatermarkFrom(job: SyncJob): string {
  if (job.sync_mode === "full" || !job.watermark_value) {
    // First-time full pull: use full_pull_from from config or fallback
    return (job.config.full_pull_from as string) ?? "2023-01-01T00:00:00Z";
  }
  // Subtract overlap to handle eventual consistency
  const ts = new Date(job.watermark_value);
  ts.setMinutes(ts.getMinutes() - job.overlap_minutes);
  return ts.toISOString();
}

// ─── HTTP with retry (exponential backoff for 429/5xx) ────────────────────────

export async function fetchWithRetry(
  url:     string,
  options: RequestInit,
  maxRetries = 3,
): Promise<Response> {
  let lastErr: Error = new Error("Unknown");
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
    try {
      const res = await fetch(url, options);
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status} from ${url}`);
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastErr;
}

// ─── Determine final run status ───────────────────────────────────────────────

export function resolveRunStatus(counters: RunCounters): SyncRunStatus {
  const total = counters.records_fetched;
  const ok    = counters.records_inserted + counters.records_updated + counters.records_skipped;
  if (counters.records_failed === 0)    return "success";
  if (ok > 0)                           return "partial";
  if (total === 0)                      return "success"; // empty page = nothing to do
  return "failed";
}
