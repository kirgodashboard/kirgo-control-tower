// POST /api/settings/integrations/[key]/sync
// Triggers a manual sync for all active jobs belonging to this integration.
// Delegates per-job invocation to the same trigger pattern used by /api/sync/trigger.

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { makeSupabaseAdmin } from "@/lib/supabase/server";

const VALID_KEYS = ["woocommerce", "shiprocket", "razorpay", "gokwik", "ccavenue", "bank_feed"];

export async function POST(
  req: Request,
  { params }: { params: { key: string } },
) {
  const integrationKey = params.key;

  if (!VALID_KEYS.includes(integrationKey)) {
    return NextResponse.json({ error: "Invalid integration key" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const companyId: number = body.company_id ?? 1;

  let db: ReturnType<typeof makeSupabaseAdmin>;
  try {
    db = makeSupabaseAdmin();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server configuration error";
    console.error("[sync] makeSupabaseAdmin error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Fetch all active jobs for this integration
  const { data: jobs, error: jobsErr } = await db
    .from("sync_jobs")
    .select("id, entity_type, edge_fn_name, watermark_value, is_active")
    .eq("integration_key", integrationKey)
    .eq("company_id", companyId)
    .eq("is_active", true);

  if (jobsErr || !jobs?.length) {
    return NextResponse.json({ error: "No active sync jobs found" }, { status: 404 });
  }

  const runIds: number[] = [];
  const errors: string[] = [];

  for (const job of jobs) {
    // Guard: skip if already running
    const { data: running } = await db
      .from("sync_runs")
      .select("id")
      .eq("sync_job_id", job.id)
      .eq("status", "running")
      .maybeSingle();

    if (running) {
      errors.push(`${job.entity_type}: already running`);
      continue;
    }

    const { data: run, error: runErr } = await db
      .from("sync_runs")
      .insert({
        sync_job_id:     job.id,
        integration_key: integrationKey,
        entity_type:     job.entity_type,
        triggered_by:    "manual",
        status:          "running",
        watermark_from:  job.watermark_value ?? null,
      })
      .select("id")
      .single();

    if (runErr || !run) {
      errors.push(`${job.entity_type}: failed to create run`);
      continue;
    }

    runIds.push(run.id);

    const fnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${job.edge_fn_name}`;
    fetch(fnUrl, {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:  `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ run_id: run.id, job_id: job.id, triggered_by: "manual" }),
    }).catch((err) => {
      console.error(`[settings/sync] Edge Function failed for run ${run.id}:`, err);
      db.from("sync_runs")
        .update({ status: "failed", completed_at: new Date().toISOString(),
                  error_summary: `Edge Function invocation failed: ${err.message}` })
        .eq("id", run.id)
        .then(() => {});
    });
  }

  return NextResponse.json({ run_ids: runIds, errors }, { status: 202 });
}
