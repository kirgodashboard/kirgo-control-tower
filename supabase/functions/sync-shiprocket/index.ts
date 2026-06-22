import {
  makeSupabaseAdmin, computeWatermarkFrom, fetchWithRetry, completeSyncRun,
  advanceWatermark, recordSyncError, resolveRunStatus,
  type SyncJob, type RunCounters,
} from "../_shared/sync-base.ts";

const SR_BASE = "https://apiv2.shiprocket.in/v1/external";
const MAX_DAYS_PER_RUN = 90; // Shiprocket rejects date ranges > ~90 days

interface SrCredentials { email: string; password: string; }

interface SrShipment {
  id: number; channel_order_id: string; awb_code: string; status: string;
  courier_name: string; payment_method: string; product_quantity: number;
  channel_sku: string; total: string; freight_total: string; cod_charges: string;
  created_at: string; updated_at: string; delivered_date: string | null;
  rto_initiated_date: string | null; rto_delivered_date: string | null;
  shipping_customer_city: string; shipping_customer_state: string;
  shipping_pincode: string; etd: string | null; ndr_attempts: number;
  latest_ndr_reason: string | null;
}

async function loadCredentials(db: ReturnType<typeof makeSupabaseAdmin>, job: SyncJob): Promise<SrCredentials> {
  const { data, error } = await db.rpc("get_integration_secret", {
    p_integration_key: job.integration_key,
    p_company_id: job.company_id ?? 1,
  });
  if (error || !data) throw new Error(`Credentials not found for ${job.integration_key}: ${error?.message ?? "null"}`);
  return data as SrCredentials;
}

async function getJwt(creds: SrCredentials): Promise<string> {
  const res = await fetchWithRetry(`${SR_BASE}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: creds.email, password: creds.password }),
  });
  if (!res.ok) throw new Error(`Shiprocket auth failed (${res.status})`);
  const body = await res.json();
  if (!body.token) throw new Error("No token from Shiprocket auth");
  return body.token as string;
}

function normalizeStatus(s: string): string {
  const s2 = s.toUpperCase().replace(/[\s\-]+/g, "_");
  const aliases: Record<string, string> = {
    CANCELED: "CANCELLED", CANCEL: "CANCELLED", NEW_ORDER: "NEW",
    RTO_ACKNOWLEDGED: "RTO_INITIATED", RETURNED: "RTO_DELIVERED", SHIPMENT_LOST: "LOST",
  };
  return aliases[s2] ?? s2;
}

function normalizePaymentMethod(s: string): "prepaid" | "cod" | null {
  const l = s.toLowerCase();
  if (l.includes("prepaid")) return "prepaid";
  if (l.includes("cod")) return "cod";
  return null;
}

const orderIdCache = new Map<string, number | null>();

async function resolveOrderId(db: ReturnType<typeof makeSupabaseAdmin>, wcNum: string): Promise<number | null> {
  if (orderIdCache.has(wcNum)) return orderIdCache.get(wcNum)!;
  const { data } = await db.from("orders").select("id").eq("woocommerce_order_number", wcNum).maybeSingle();
  const id = data?.id ?? null;
  orderIdCache.set(wcNum, id);
  return id;
}

async function syncShipments(
  db: ReturnType<typeof makeSupabaseAdmin>, job: SyncJob, runId: number, jwt: string, after: string, repair: boolean,
): Promise<{ counters: RunCounters; watermarkTo: string }> {
  const counters: RunCounters = { records_fetched: 0, records_inserted: 0, records_updated: 0, records_skipped: 0, records_failed: 0 };

  // Compute windowed date range — Shiprocket rejects ranges wider than ~90 days
  const sinceDate = repair
    ? new Date(Date.now() - 30 * 86_400_000)
    : new Date(after.slice(0, 10));
  const untilDate = new Date(sinceDate);
  untilDate.setDate(untilDate.getDate() + MAX_DAYS_PER_RUN);
  if (untilDate > new Date()) untilDate.setTime(Date.now());

  const from = sinceDate.toISOString().slice(0, 10);
  const until = untilDate.toISOString().slice(0, 10);
  let page = 1, hasMore = true, watermarkTo = after;
  const headers = { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" };

  while (hasMore) {
    const url = `${SR_BASE}/shipments?from=${from}&to=${until}&per_page=${job.batch_size}&page=${page}`;
    const res = await fetchWithRetry(url, { headers });
    if (!res.ok) throw new Error(`Shiprocket shipments API: ${res.status}`);
    const body = await res.json();
    const shipments: SrShipment[] = body?.data?.data ?? [];
    if (shipments.length === 0) break;
    counters.records_fetched += shipments.length;

    // Bulk-resolve order IDs then bulk-upsert shipments
    const payloads = await Promise.all(shipments.map(async (s) => {
      const orderId = await resolveOrderId(db, s.channel_order_id);
      return {
        order_id: orderId, shiprocket_order_id: s.id, awb_code: s.awb_code || null,
        status: normalizeStatus(s.status), courier_company: s.courier_name || null,
        channel_sku: s.channel_sku || null, product_quantity: s.product_quantity,
        payment_method: normalizePaymentMethod(s.payment_method),
        order_total_inr: parseFloat(s.total) || null, freight_total_inr: parseFloat(s.freight_total) || null,
        cod_charges_inr: parseFloat(s.cod_charges) || 0, shiprocket_created_at: s.created_at,
        delivered_at: s.delivered_date || null, rto_initiated_at: s.rto_initiated_date || null,
        rto_delivered_at: s.rto_delivered_date || null, edd: s.etd ? s.etd.slice(0, 10) : null,
        ndr_attempts: s.ndr_attempts ?? 0, latest_ndr_reason: s.latest_ndr_reason || null,
        customer_city: s.shipping_customer_city || null, customer_state: s.shipping_customer_state || null,
        customer_pincode: s.shipping_pincode || null,
      };
    }));

    const { error: upsertErr } = await db.from("shipments")
      .upsert(payloads, { onConflict: "awb_code", ignoreDuplicates: false });
    if (upsertErr) {
      counters.records_failed += shipments.length;
      await recordSyncError(db, runId, job.integration_key, job.entity_type, null, "BATCH_ERROR", upsertErr.message, { from, until, page });
    } else {
      counters.records_updated += shipments.length;
      const latest = shipments.at(-1)!.updated_at;
      if (latest > watermarkTo) watermarkTo = latest;
    }

    hasMore = shipments.length === job.batch_size;
    page++;
  }

  // Advance watermark to end of this window so next run picks up from there
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
    if (jobErr || !jobRow) throw new Error(`Job ${body.job_id} not found: ${jobErr?.message}`);
    const job = { ...jobRow, config: {}, secret_ref: null } as SyncJob;
    const creds = await loadCredentials(db, job);
    const jwt = await getJwt(creds);
    const after = computeWatermarkFrom(job);
    const repair = job.entity_type === "shipments_repair";
    const result = await syncShipments(db, job, runId, jwt, after, repair);
    const status = resolveRunStatus(result.counters);
    await completeSyncRun(db, runId, status, result.counters, result.watermarkTo, null, { after });
    if (status !== "failed") await advanceWatermark(db, job.id, result.watermarkTo);
    return new Response(JSON.stringify({ ok: true, status, ...result.counters }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sync-shiprocket]", msg);
    if (runId) await db.from("sync_runs").update({ status: "failed", completed_at: new Date().toISOString(), error_summary: msg }).eq("id", runId).then(() => {}).catch(console.error);
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
