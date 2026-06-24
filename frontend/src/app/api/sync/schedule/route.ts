// GET /api/sync/schedule  ← Vercel Cron calls GET (not POST)
// POST /api/sync/schedule ← Admin/manual trigger
//
// Fires all active scheduled sync jobs, then retries recently-failed runs
// with exponential backoff: 5 min → 15 min → 60 min (max 3 retries).

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { makeSupabaseAdmin } from "@/lib/supabase/server";

function isCronAuthorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

const RETRY_BACKOFFS_MS = [5 * 60_000, 15 * 60_000, 60 * 60_000];

async function dispatchEdgeFn(
  db: ReturnType<typeof makeSupabaseAdmin>,
  job: { id: number; integration_key: string; entity_type: string; edge_fn_name: string; watermark_value: string | null },
  triggeredBy: "schedule" | "retry",
  retryCount = 0,
  parentRunId?: number,
): Promise<number | null> {
  const { data: run, error: runErr } = await db
    .from("sync_runs")
    .insert({
      sync_job_id:     job.id,
      integration_key: job.integration_key,
      entity_type:     job.entity_type,
      triggered_by:    triggeredBy,
      status:          "running",
      watermark_from:  job.watermark_value ?? null,
      retry_count:     retryCount,
      parent_run_id:   parentRunId ?? null,
    })
    .select("id")
    .single();

  if (runErr || !run) return null;

  const fnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${job.edge_fn_name}`;
  fetch(fnUrl, {
    method:  "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:  `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ run_id: run.id, job_id: job.id }),
  }).catch((err) => {
    console.error(`[sync/schedule] fn=${job.edge_fn_name} run=${run.id}:`, err.message);
    db.from("sync_runs")
      .update({ status: "failed", completed_at: new Date().toISOString(),
                error_summary: `Invocation failed: ${err.message}` })
      .eq("id", run.id).then(() => {});
  });

  return run.id;
}

async function handleSchedule(req: Request) {
  if (!isCronAuthorised(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = makeSupabaseAdmin();
  const results: Record<string, unknown>[] = [];

  // ── 1. Fire all active scheduled jobs ─────────────────────────────────────
  const { data: jobs } = await db
    .from("sync_jobs")
    .select("id, integration_key, entity_type, edge_fn_name, cron_schedule, watermark_value")
    .eq("is_active", true)
    .not("cron_schedule", "is", null);

  for (const job of jobs ?? []) {
    const { data: running } = await db.from("sync_runs").select("id")
      .eq("sync_job_id", job.id).eq("status", "running").maybeSingle();

    if (running) { results.push({ job_id: job.id, skipped: "already_running" }); continue; }

    const runId = await dispatchEdgeFn(db, job, "schedule");
    results.push(runId ? { job_id: job.id, run_id: runId } : { job_id: job.id, skipped: "run_create_failed" });
  }

  // ── 2. Retry failed runs with exponential backoff ─────────────────────────
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: failedRuns } = await db
    .from("sync_runs")
    .select("id, sync_job_id, integration_key, retry_count, completed_at")
    .eq("status", "failed")
    .lt("retry_count", 3)
    .gte("completed_at", cutoff)
    .order("completed_at", { ascending: false });

  const retriedJobs = new Set<number>();

  for (const failed of failedRuns ?? []) {
    if (retriedJobs.has(failed.sync_job_id)) continue; // only retry once per job per cron tick

    const retryCount = failed.retry_count ?? 0;
    const backoffMs = RETRY_BACKOFFS_MS[retryCount] ?? RETRY_BACKOFFS_MS[2];
    const retryAfter = new Date(new Date(failed.completed_at).getTime() + backoffMs);
    if (retryAfter > new Date()) continue; // not ready yet

    // Skip if there's already a success since this failure
    const { data: successAfter } = await db.from("sync_runs").select("id")
      .eq("sync_job_id", failed.sync_job_id).eq("status", "success")
      .gte("completed_at", failed.completed_at).maybeSingle();
    if (successAfter) continue;

    // Skip if already running
    const { data: running } = await db.from("sync_runs").select("id")
      .eq("sync_job_id", failed.sync_job_id).eq("status", "running").maybeSingle();
    if (running) continue;

    const { data: job } = await db.from("sync_jobs").select("*").eq("id", failed.sync_job_id).single();
    if (!job) continue;

    const runId = await dispatchEdgeFn(db, job, "retry", retryCount + 1, failed.id);
    if (runId) {
      retriedJobs.add(failed.sync_job_id);
      results.push({ job_id: failed.sync_job_id, retry_run_id: runId, attempt: retryCount + 1, parent_run_id: failed.id });
    }
  }

  // ── 3. Run the nightly Data Integrity Agent (cross-dashboard trust score) ──
  let trust: unknown = null;
  try {
    const { data: trustResult } = await db.rpc("run_data_trust_check", { p_triggered_by: "cron" });
    trust = trustResult;
  } catch (e) {
    console.error("[sync/schedule] data trust check failed", e);
  }

  console.log(`[sync/schedule] dispatched=${results.length}`, JSON.stringify(results));
  return NextResponse.json({ dispatched: results.length, results, trust });
}

// Vercel Cron sends GET — this is the primary entry point
export async function GET(req: Request) { return handleSchedule(req); }
// Keep POST for admin/manual triggers
export async function POST(req: Request) { return handleSchedule(req); }
