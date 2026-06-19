// Supabase Edge Function: sync-razorpay
// Pulls payments and settlements from Razorpay API.
// Auth: Basic Auth (key_id:key_secret) — stored in Vault as razorpay_credentials.
// Writes to: gateway_settlements (existing table, upsert on razorpay_settlement_id).
// Webhook verification handled separately at /api/webhooks/razorpay.
// Idempotent: upserts on razorpay entity ID.

import {
  makeSupabaseAdmin,
  computeWatermarkFrom,
  fetchWithRetry,
  completeSyncRun,
  advanceWatermark,
  recordSyncError,
  resolveRunStatus,
  type SyncJob,
  type RunCounters,
} from "../_shared/sync-base.ts";

const RZP_BASE = "https://api.razorpay.com/v1";

interface RzpCredentials {
  key_id:     string;
  key_secret: string;
}

interface RzpPayment {
  id:         string;
  entity:     string;
  amount:     number;   // paise
  currency:   string;
  status:     string;
  method:     string;
  captured:   boolean;
  created_at: number;   // Unix timestamp
  order_id:   string | null;
  description: string | null;
}

interface RzpSettlement {
  id:           string;
  entity:       string;
  amount:       number;  // paise
  fees:         number;
  tax:          number;
  utr:          string;
  created_at:   number;
  settled_at:   number | null;
}

async function loadCredentials(
  db:        ReturnType<typeof makeSupabaseAdmin>,
  secretRef: string,
): Promise<RzpCredentials> {
  const { data, error } = await db
    .from("vault.decrypted_secrets")
    .select("decrypted_secret")
    .eq("name", secretRef)
    .single();
  if (error || !data) throw new Error(`Vault secret '${secretRef}' not found`);
  return JSON.parse(data.decrypted_secret) as RzpCredentials;
}

function authHeader(c: RzpCredentials): string {
  return "Basic " + btoa(`${c.key_id}:${c.key_secret}`);
}

// ─── Sync: Payments ──────────────────────────────────────────────────────────

async function syncPayments(
  db:    ReturnType<typeof makeSupabaseAdmin>,
  job:   SyncJob,
  runId: number,
  creds: RzpCredentials,
  after: string,
): Promise<{ counters: RunCounters; watermarkTo: string }> {
  const counters: RunCounters = {
    records_fetched: 0, records_inserted: 0,
    records_updated: 0, records_skipped: 0, records_failed: 0,
  };
  const fromTs    = Math.floor(new Date(after).getTime() / 1000);
  const toTs      = Math.floor(Date.now() / 1000);
  let   skip      = 0;
  let   hasMore   = true;
  let   watermarkTo = after;
  const headers   = { Authorization: authHeader(creds) };

  while (hasMore) {
    const url = `${RZP_BASE}/payments?from=${fromTs}&to=${toTs}&count=${job.batch_size}&skip=${skip}`;
    const res  = await fetchWithRetry(url, { headers });
    if (!res.ok) throw new Error(`Razorpay payments API: ${res.status}`);

    const body   = await res.json();
    const items: RzpPayment[] = body.items ?? [];
    if (items.length === 0) break;
    counters.records_fetched += items.length;

    for (const p of items) {
      try {
        // Map into gateway_settlements (captures prepaid payment receipts)
        const amountInr = p.amount / 100;
        const tsIso     = new Date(p.created_at * 1000).toISOString();

        const { error } = await db.from("gateway_settlements").upsert({
          gateway:                  "razorpay",
          razorpay_payment_id:      p.id,
          settlement_amount_inr:    amountInr,
          settlement_date:          tsIso.slice(0, 10),
          utr_number:               null,
          status:                   p.status,
          notes:                    p.description || null,
        }, { onConflict: "razorpay_payment_id", ignoreDuplicates: false });

        if (error) throw error;
        counters.records_updated++;
        if (tsIso > watermarkTo) watermarkTo = tsIso;
      } catch (err) {
        counters.records_failed++;
        await recordSyncError(db, runId, job.integration_key, job.entity_type,
          p.id, "MAPPING_ERROR",
          err instanceof Error ? err.message : String(err), p);
      }
    }

    hasMore = items.length === job.batch_size;
    skip   += items.length;
  }

  return { counters, watermarkTo };
}

// ─── Sync: Settlements ────────────────────────────────────────────────────────

async function syncSettlements(
  db:    ReturnType<typeof makeSupabaseAdmin>,
  job:   SyncJob,
  runId: number,
  creds: RzpCredentials,
  after: string,
): Promise<{ counters: RunCounters; watermarkTo: string }> {
  const counters: RunCounters = {
    records_fetched: 0, records_inserted: 0,
    records_updated: 0, records_skipped: 0, records_failed: 0,
  };
  const fromTs    = Math.floor(new Date(after).getTime() / 1000);
  const toTs      = Math.floor(Date.now() / 1000);
  let   skip      = 0;
  let   hasMore   = true;
  let   watermarkTo = after;
  const headers   = { Authorization: authHeader(creds) };

  while (hasMore) {
    const url = `${RZP_BASE}/settlements?from=${fromTs}&to=${toTs}&count=${job.batch_size}&skip=${skip}`;
    const res  = await fetchWithRetry(url, { headers });
    if (!res.ok) throw new Error(`Razorpay settlements API: ${res.status}`);

    const body  = await res.json();
    const items: RzpSettlement[] = body.items ?? [];
    if (items.length === 0) break;
    counters.records_fetched += items.length;

    for (const s of items) {
      try {
        const amountInr = s.amount / 100;
        const tsIso     = new Date(s.created_at * 1000).toISOString();
        const settledIso = s.settled_at ? new Date(s.settled_at * 1000).toISOString() : null;

        const { error } = await db.from("gateway_settlements").upsert({
          gateway:               "razorpay",
          razorpay_settlement_id: s.id,
          settlement_amount_inr: amountInr,
          settlement_date:       (settledIso ?? tsIso).slice(0, 10),
          utr_number:            s.utr || null,
          status:                "settled",
        }, { onConflict: "razorpay_settlement_id", ignoreDuplicates: false });

        if (error) throw error;
        counters.records_updated++;
        if (tsIso > watermarkTo) watermarkTo = tsIso;
      } catch (err) {
        counters.records_failed++;
        await recordSyncError(db, runId, job.integration_key, job.entity_type,
          s.id, "MAPPING_ERROR",
          err instanceof Error ? err.message : String(err), s);
      }
    }

    hasMore = items.length === job.batch_size;
    skip   += items.length;
  }

  return { counters, watermarkTo };
}

// ─── Entry point ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const db   = makeSupabaseAdmin();
  let runId: number | null = null;

  try {
    const body: { run_id: number; job_id: number } = await req.json();
    runId = body.run_id;

    const { data: jobRow, error: jobErr } = await db
      .from("sync_jobs")
      .select("*, integration_settings(config, secret_ref)")
      .eq("id", body.job_id)
      .single();
    if (jobErr || !jobRow) throw new Error(`Job ${body.job_id} not found`);

    const job: SyncJob = {
      ...jobRow,
      config:     (jobRow as Record<string, unknown>).integration_settings?.config ?? {},
      secret_ref: (jobRow as Record<string, unknown>).integration_settings?.secret_ref ?? null,
    } as SyncJob;

    if (!job.secret_ref) throw new Error("No secret_ref for Razorpay");
    const creds = await loadCredentials(db, job.secret_ref);
    const after = computeWatermarkFrom(job);

    let result: { counters: RunCounters; watermarkTo: string };
    if (job.entity_type === "settlements") {
      result = await syncSettlements(db, job, runId, creds, after);
    } else {
      result = await syncPayments(db, job, runId, creds, after);
    }

    const status = resolveRunStatus(result.counters);
    await completeSyncRun(db, runId, status, result.counters, result.watermarkTo, null, { after });
    if (status !== "failed") await advanceWatermark(db, job.id, result.watermarkTo);

    return new Response(JSON.stringify({ ok: true, status, ...result.counters }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sync-razorpay]", msg);
    if (runId) {
      await makeSupabaseAdmin()
        .from("sync_runs")
        .update({ status: "failed", completed_at: new Date().toISOString(), error_summary: msg })
        .eq("id", runId).catch(console.error);
    }
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
