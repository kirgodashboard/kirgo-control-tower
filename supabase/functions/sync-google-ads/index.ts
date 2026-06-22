import {
  makeSupabaseAdmin, computeWatermarkFrom, fetchWithRetry, completeSyncRun,
  advanceWatermark, recordSyncError, resolveRunStatus,
  type SyncJob, type RunCounters,
} from "../_shared/sync-base.ts";

const GOOGLE_ADS_API = "https://googleads.googleapis.com/v17";
const MAX_DAYS_PER_RUN = 30;

interface GoogleAdsCredentials {
  customer_id: string;
  developer_token: string;
  client_id: string;
  client_secret: string;
  refresh_token: string;
  login_customer_id?: string;
}

interface GoogleAdsRow {
  campaign: { id: string; name: string };
  segments: { date: string };
  metrics: {
    impressions: string;
    clicks: string;
    costMicros: string;
    ctr: string;
    averageCpc: string;
    averageCpm: string;
  };
}

async function loadCredentials(db: ReturnType<typeof makeSupabaseAdmin>, job: SyncJob): Promise<GoogleAdsCredentials> {
  const { data, error } = await db.rpc("get_integration_secret", {
    p_integration_key: job.integration_key,
    p_company_id: job.company_id ?? 1,
  });
  if (error || !data) throw new Error(`Credentials not found for ${job.integration_key}: ${error?.message ?? "null"}`);
  return data as GoogleAdsCredentials;
}

async function refreshAccessToken(creds: GoogleAdsCredentials): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      refresh_token: creds.refresh_token,
    }),
  });
  if (!res.ok) throw new Error(`Google OAuth token refresh failed: ${res.status}`);
  const body = await res.json();
  if (!body.access_token) throw new Error(`No access_token in OAuth response`);
  return body.access_token as string;
}

async function syncCampaignReport(
  db: ReturnType<typeof makeSupabaseAdmin>, job: SyncJob, runId: number, creds: GoogleAdsCredentials, after: string,
): Promise<{ counters: RunCounters; watermarkTo: string }> {
  const counters: RunCounters = { records_fetched: 0, records_inserted: 0, records_updated: 0, records_skipped: 0, records_failed: 0 };

  const sinceDate = new Date(after);
  const untilDate = new Date(sinceDate);
  untilDate.setDate(untilDate.getDate() + MAX_DAYS_PER_RUN);
  if (untilDate > new Date()) untilDate.setTime(Date.now());

  const since = sinceDate.toISOString().slice(0, 10);
  const until = untilDate.toISOString().slice(0, 10);
  const accessToken = await refreshAccessToken(creds);
  const customerId = creds.customer_id.replace(/-/g, "");
  const query = `SELECT campaign.id, campaign.name, segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.ctr, metrics.average_cpc, metrics.average_cpm FROM campaign WHERE segments.date BETWEEN '${since}' AND '${until}' AND campaign.status != 'REMOVED' ORDER BY segments.date ASC`;

  let pageToken: string | null = null;
  let watermarkTo = after;

  do {
    const reqBody: Record<string, unknown> = { query, pageSize: job.batch_size };
    if (pageToken) reqBody.pageToken = pageToken;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": creds.developer_token,
      "Content-Type": "application/json",
    };
    if (creds.login_customer_id) {
      headers["login-customer-id"] = creds.login_customer_id.replace(/-/g, "");
    }

    const res = await fetchWithRetry(`${GOOGLE_ADS_API}/customers/${customerId}/googleAds:search`, {
      method: "POST",
      headers,
      body: JSON.stringify(reqBody),
    });
    if (!res.ok) {
      const b = await res.text();
      throw new Error(`Google Ads API error ${res.status}: ${b.slice(0, 300)}`);
    }
    const body = await res.json();
    const rows: GoogleAdsRow[] = body.results ?? [];
    if (rows.length === 0) break;

    counters.records_fetched += rows.length;
    const payloads = rows.map((r) => ({
      platform: "google_ads",
      report_date: r.segments.date,
      account_id: customerId,
      campaign_id: r.campaign.id,
      campaign_name: r.campaign.name,
      impressions: parseInt(r.metrics.impressions) || 0,
      clicks: parseInt(r.metrics.clicks) || 0,
      spend_inr: (parseInt(r.metrics.costMicros) || 0) / 1_000_000,
      ctr: parseFloat(r.metrics.ctr) || null,
      cpc_inr: r.metrics.averageCpc ? parseInt(r.metrics.averageCpc) / 1_000_000 : null,
      cpm_inr: r.metrics.averageCpm ? parseInt(r.metrics.averageCpm) / 1_000_000 : null,
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
      const latest = rows.at(-1)!.segments.date + "T23:59:59Z";
      if (latest > watermarkTo) watermarkTo = latest;
    }

    pageToken = body.nextPageToken ?? null;
  } while (pageToken);

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
    const result = await syncCampaignReport(db, job, runId, creds, after);
    const status = resolveRunStatus(result.counters);
    await completeSyncRun(db, runId, status, result.counters, result.watermarkTo, null, { after });
    if (status !== "failed") await advanceWatermark(db, job.id, result.watermarkTo);
    return new Response(JSON.stringify({ ok: true, status, ...result.counters }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sync-google-ads]", msg);
    if (runId) await db.from("sync_runs").update({ status: "failed", completed_at: new Date().toISOString(), error_summary: msg }).eq("id", runId).then(() => {}).catch(console.error);
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
