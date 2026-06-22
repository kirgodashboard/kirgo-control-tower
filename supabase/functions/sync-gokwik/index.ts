import {
  makeSupabaseAdmin, computeWatermarkFrom, fetchWithRetry, completeSyncRun,
  advanceWatermark, recordSyncError, resolveRunStatus,
  type SyncJob, type RunCounters,
} from "../_shared/sync-base.ts";

const GK_BASE = "https://api.gokwik.co/v1";

interface GkCredentials { merchant_id: string; api_key: string; }

interface GkOrder {
  order_id: string; merchant_ref: string; amount: number; status: string;
  payment_method: string; created_at: string; settled_at: string | null;
  settlement_utr: string | null;
}

async function loadCredentials(db: ReturnType<typeof makeSupabaseAdmin>, job: SyncJob): Promise<GkCredentials> {
  const { data, error } = await db.rpc("get_integration_secret", {
    p_integration_key: job.integration_key,
    p_company_id: job.company_id ?? 1,
  });
  if (error || !data) throw new Error(`Credentials not found for ${job.integration_key}: ${error?.message ?? "null"}`);
  return data as GkCredentials;
}

async function syncGoKwikOrders(
  db: ReturnType<typeof makeSupabaseAdmin>, job: SyncJob, runId: number, creds: GkCredentials, after: string,
): Promise<{ counters: RunCounters; watermarkTo: string }> {
  const counters: RunCounters = { records_fetched: 0, records_inserted: 0, records_updated: 0, records_skipped: 0, records_failed: 0 };
  let page = 1, hasMore = true, watermarkTo = after;

  while (hasMore) {
    const res = await fetchWithRetry(`${GK_BASE}/merchant/orders`, {
      method: "POST",
      headers: { Authorization: `Bearer ${creds.api_key}`, "Content-Type": "application/json", "X-Merchant-Id": creds.merchant_id },
      body: JSON.stringify({ from_date: after.slice(0, 10), to_date: new Date().toISOString().slice(0, 10), page, limit: job.batch_size }),
    });
    if (!res.ok) throw new Error(`GoKwik orders API: ${res.status}`);
    const body = await res.json();
    const orders: GkOrder[] = body.data?.orders ?? body.orders ?? [];
    if (orders.length === 0) break;
    counters.records_fetched += orders.length;

    for (const o of orders) {
      try {
        const { error } = await db.from("gateway_settlements").upsert({
          gateway: "gokwik", gokwik_order_id: o.order_id,
          settlement_amount_inr: o.amount,
          settlement_date: (o.settled_at ?? o.created_at).slice(0, 10),
          utr_number: o.settlement_utr || null, status: o.status,
        }, { onConflict: "gokwik_order_id", ignoreDuplicates: false });
        if (error) throw error;
        counters.records_updated++;
        if (o.created_at > watermarkTo) watermarkTo = o.created_at;
      } catch (err) {
        counters.records_failed++;
        await recordSyncError(db, runId, job.integration_key, job.entity_type, o.order_id, "MAPPING_ERROR", err instanceof Error ? err.message : String(err), o);
      }
    }

    hasMore = orders.length === job.batch_size;
    page++;
  }
  return { counters, watermarkTo };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const db = makeSupabaseAdmin();
  let runId: number | null = null;
  let job: SyncJob | null = null;

  try {
    const body: { run_id: number; job_id: number } = await req.json();
    runId = body.run_id;

    const { data: jobRow, error: jobErr } = await db.from("sync_jobs").select("*").eq("id", body.job_id).single();
    if (jobErr || !jobRow) throw new Error(`Job ${body.job_id} not found: ${jobErr?.message}`);
    job = { ...jobRow, config: {}, secret_ref: null } as SyncJob;

    const creds = await loadCredentials(db, job);
    const after = computeWatermarkFrom(job);
    const result = await syncGoKwikOrders(db, job, runId, creds, after);
    const status = resolveRunStatus(result.counters);
    await completeSyncRun(db, runId, status, result.counters, result.watermarkTo, null, { after });
    if (status !== "failed") await advanceWatermark(db, job.id, result.watermarkTo);
    return new Response(JSON.stringify({ ok: true, status, ...result.counters }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sync-gokwik]", msg);
    if (runId) await db.from("sync_runs").update({ status: "failed", completed_at: new Date().toISOString(), error_summary: msg }).eq("id", runId).then(() => {}).catch(console.error);
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
