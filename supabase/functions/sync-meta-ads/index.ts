import {
  makeSupabaseAdmin, computeWatermarkFrom, fetchWithRetry, completeSyncRun,
  advanceWatermark, recordSyncError, resolveRunStatus,
  type SyncJob, type RunCounters,
} from "../_shared/sync-base.ts";

const FB_GRAPH = "https://graph.facebook.com/v20.0";
const MAX_DAYS_PER_RUN = 30;

interface MetaCredentials {
  ad_account_id: string;
  access_token: string;
}

interface MetaInsightRow {
  campaign_id: string;
  campaign_name: string;
  adset_id: string;
  adset_name: string;
  date_start: string;
  impressions: string;
  clicks: string;
  spend: string;
  reach: string;
  frequency: string;
  ctr: string;
  cpc: string;
  cpm: string;
}

async function loadCredentials(db: ReturnType<typeof makeSupabaseAdmin>, job: SyncJob): Promise<MetaCredentials> {
  const { data, error } = await db.rpc("get_integration_secret", {
    p_integration_key: job.integration_key,
    p_company_id: job.company_id ?? 1,
  });
  if (error || !data) throw new Error(`Credentials not found for ${job.integration_key}: ${error?.message ?? "null"}`);
  return data as MetaCredentials;
}

async function syncAdInsights(
  db: ReturnType<typeof makeSupabaseAdmin>, job: SyncJob, runId: number, creds: MetaCredentials, after: string,
): Promise<{ counters: RunCounters; watermarkTo: string }> {
  const counters: RunCounters = { records_fetched: 0, records_inserted: 0, records_updated: 0, records_skipped: 0, records_failed: 0 };

  const sinceDate = new Date(after);
  const untilDate = new Date(sinceDate);
  untilDate.setDate(untilDate.getDate() + MAX_DAYS_PER_RUN);
  if (untilDate > new Date()) untilDate.setTime(Date.now());

  const since = sinceDate.toISOString().slice(0, 10);
  const until = untilDate.toISOString().slice(0, 10);
  const accountId = creds.ad_account_id.replace(/^act_/, "");

  const fields = "campaign_id,campaign_name,adset_id,adset_name,date_start,impressions,clicks,spend,reach,frequency,ctr,cpc,cpm";
  let after_cursor: string | null = null;
  let watermarkTo = after;

  do {
    const params = new URLSearchParams({
      access_token: creds.access_token,
      level: "adset",
      time_increment: "1",
      time_range: JSON.stringify({ since, until }),
      fields,
      limit: String(job.batch_size),
    });
    if (after_cursor) params.set("after", after_cursor);

    const res = await fetchWithRetry(`${FB_GRAPH}/act_${accountId}/insights?${params}`);
    if (!res.ok) {
      const b = await res.text();
      throw new Error(`Meta Ads API error ${res.status}: ${b.slice(0, 300)}`);
    }
    const body = await res.json();
    const rows: MetaInsightRow[] = body.data ?? [];
    if (rows.length === 0) break;

    counters.records_fetched += rows.length;
    const payloads = rows.map((r) => ({
      platform: "meta",
      report_date: r.date_start,
      account_id: `act_${accountId}`,
      campaign_id: r.campaign_id,
      campaign_name: r.campaign_name,
      adset_id: r.adset_id,
      adset_name: r.adset_name,
      impressions: parseInt(r.impressions) || 0,
      clicks: parseInt(r.clicks) || 0,
      spend_inr: parseFloat(r.spend) || 0,
      reach: parseInt(r.reach) || null,
      frequency: parseFloat(r.frequency) || null,
      ctr: parseFloat(r.ctr) || null,
      cpc_inr: parseFloat(r.cpc) || null,
      cpm_inr: parseFloat(r.cpm) || null,
      updated_at: new Date().toISOString(),
    }));

    const { error: upsertErr } = await db.from("ad_spend_daily").upsert(payloads, {
      onConflict: "platform,report_date,campaign_id",
      ignoreDuplicates: false,
    });
    if (upsertErr) {
      counters.records_failed += rows.length;
      await recordSyncError(db, runId, job.integration_key, job.entity_type, null, "BATCH_ERROR", upsertErr.message, { since, until });
    } else {
      counters.records_updated += rows.length;
      const latest = rows.at(-1)!.date_start + "T23:59:59Z";
      if (latest > watermarkTo) watermarkTo = latest;
    }

    after_cursor = body.paging?.cursors?.after ?? null;
    if (!body.paging?.next) after_cursor = null;
  } while (after_cursor);

  if (counters.records_fetched > 0 && until + "T23:59:59Z" > watermarkTo) {
    watermarkTo = until + "T23:59:59Z";
  }
  return { counters, watermarkTo };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const db = makeSupabaseAdmin();
  let runId: number | null = null;
  try {
    const body: { run_id: number; job_id: number } = await req.json();
    runId = body.run_id;
    const { data: jobRow, error: jobErr } = await db.from("sync_jobs").select("*").eq("id", body.job_id).single();
    if (jobErr || !jobRow) throw new Error(`Job ${body.job_id} not found`);
    const job = { ...jobRow, config: {}, secret_ref: null } as SyncJob;
    const creds = await loadCredentials(db, job);
    const after = computeWatermarkFrom(job);
    const result = await syncAdInsights(db, job, runId, creds, after);
    const status = resolveRunStatus(result.counters);
    await completeSyncRun(db, runId, status, result.counters, result.watermarkTo, null, { after });
    if (status !== "failed") await advanceWatermark(db, job.id, result.watermarkTo);
    return new Response(JSON.stringify({ ok: true, status, ...result.counters }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sync-meta-ads]", msg);
    if (runId) await db.from("sync_runs").update({ status: "failed", completed_at: new Date().toISOString(), error_summary: msg }).eq("id", runId).then(() => {}).catch(console.error);
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
