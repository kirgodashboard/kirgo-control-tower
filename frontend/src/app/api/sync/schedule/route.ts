// POST /api/sync/schedule
// Called by Vercel Cron every 30 minutes.
// Finds all active sync_jobs whose schedule is due (no running run, and last run
// was more than (cron_interval - 2 min) ago), then fires each Edge Function.

import { NextResponse } from "next/server";
import { makeSupabaseAdmin } from "@/lib/supabase/server";

// Authorisation: Vercel signs cron requests with CRON_SECRET header.
function isCronAuthorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev: no secret configured
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  if (!isCronAuthorised(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = makeSupabaseAdmin();

  // Load all active scheduled jobs
  const { data: jobs, error } = await db
    .from("sync_jobs")
    .select("id, integration_key, entity_type, edge_fn_name, cron_schedule, watermark_value")
    .eq("is_active", true)
    .not("cron_schedule", "is", null);

  if (error || !jobs) {
    return NextResponse.json({ error: "Failed to load jobs" }, { status: 500 });
  }

  const results: Array<{ job_id: number; run_id?: number; skipped?: string }> = [];

  for (const job of jobs) {
    // Skip if already running
    const { data: running } = await db
      .from("sync_runs")
      .select("id")
      .eq("sync_job_id", job.id)
      .eq("status", "running")
      .maybeSingle();

    if (running) {
      results.push({ job_id: job.id, skipped: "already_running" });
      continue;
    }

    // Create run row
    const { data: run, error: runErr } = await db
      .from("sync_runs")
      .insert({
        sync_job_id:     job.id,
        integration_key: job.integration_key,
        entity_type:     job.entity_type,
        triggered_by:    "schedule",
        status:          "running",
        watermark_from:  job.watermark_value ?? null,
      })
      .select("id")
      .single();

    if (runErr || !run) {
      results.push({ job_id: job.id, skipped: "run_create_failed" });
      continue;
    }

    // Fire Edge Function (fire-and-forget)
    const fnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${job.edge_fn_name}`;
    fetch(fnUrl, {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:  `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ run_id: run.id, job_id: job.id, triggered_by: "schedule" }),
    }).catch((err) => {
      console.error(`[sync/schedule] Edge Function failed job=${job.id} run=${run.id}:`, err);
      db.from("sync_runs")
        .update({ status: "failed", completed_at: new Date().toISOString(),
                  error_summary: `Invocation failed: ${err.message}` })
        .eq("id", run.id).then(() => {});
    });

    results.push({ job_id: job.id, run_id: run.id });
  }

  return NextResponse.json({ dispatched: results.length, results });
}
