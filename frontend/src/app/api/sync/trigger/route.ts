// POST /api/sync/trigger
// Called by the frontend "Sync Now" button.
// Creates a sync_run row, then invokes the Supabase Edge Function async.
// Returns immediately with { run_id } — the Edge Function runs in the background.

import { NextResponse } from "next/server";
import { makeSupabaseAdmin } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const jobId = body?.job_id as number | undefined;

  if (!jobId || typeof jobId !== "number") {
    return NextResponse.json({ error: "job_id required" }, { status: 400 });
  }

  const db = makeSupabaseAdmin();

  // 1. Verify job exists and is active
  const { data: job, error: jobErr } = await db
    .from("sync_jobs")
    .select("id, integration_key, entity_type, edge_fn_name, is_active, watermark_value")
    .eq("id", jobId)
    .single();

  if (jobErr || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (!job.is_active) {
    return NextResponse.json({ error: "Job is not active" }, { status: 409 });
  }

  // 2. Guard: no concurrent run for this job
  const { data: running } = await db
    .from("sync_runs")
    .select("id")
    .eq("sync_job_id", jobId)
    .eq("status", "running")
    .maybeSingle();

  if (running) {
    return NextResponse.json(
      { error: "A sync run is already in progress for this job", run_id: running.id },
      { status: 409 },
    );
  }

  // 3. Create the sync_run record
  const { data: run, error: runErr } = await db
    .from("sync_runs")
    .insert({
      sync_job_id:     jobId,
      integration_key: job.integration_key,
      entity_type:     job.entity_type,
      triggered_by:    "manual",
      status:          "running",
      watermark_from:  job.watermark_value ?? null,
    })
    .select("id")
    .single();

  if (runErr || !run) {
    return NextResponse.json({ error: "Failed to create sync run" }, { status: 500 });
  }

  // 4. Invoke the Edge Function asynchronously (fire-and-forget)
  const fnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${job.edge_fn_name}`;
  fetch(fnUrl, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      Authorization:   `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ run_id: run.id, job_id: jobId, triggered_by: "manual" }),
  }).catch((err) => {
    console.error(`[sync/trigger] Edge Function invocation failed for run ${run.id}:`, err);
    // Mark the run as failed if the invocation itself errors
    db.from("sync_runs")
      .update({ status: "failed", completed_at: new Date().toISOString(),
                error_summary: `Edge Function invocation failed: ${err.message}` })
      .eq("id", run.id)
      .then(() => {});
  });

  return NextResponse.json({ run_id: run.id }, { status: 202 });
}
