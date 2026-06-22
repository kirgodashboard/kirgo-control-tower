// Supabase Edge Function: sync-shiprocket
// Pulls shipment data from Shiprocket API v1.
// Credentials: email + api_token (pre-generated from Shiprocket Settings → API).
// Writes to: shipments (existing table — upsert on awb_code).
// Idempotent: awb_code is the natural dedup key per shipment.

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

const SR_BASE = "https://apiv2.shiprocket.in/v1/external";

interface SrCredentials {
  email:     string;
  api_token: string;
  password?: string; // legacy field — ignored
}

interface SrShipment {
  id:                    number;
  channel_order_id:      string;   // WooCommerce order number
  awb_code:              string;
  status:                string;
  courier_company_id:    number;
  courier_name:          string;
  payment_method:        string;   // Prepaid | COD
  product_quantity:      number;
  channel_sku:           string;
  total:                 string;
  freight_total:         string;
  cod_charges:           string;
  pickup_scheduled_date: string | null;
  created_at:            string;
  updated_at:            string;
  delivered_date:        string | null;
  rto_initiated_date:    string | null;
  rto_delivered_date:    string | null;
  shipping_customer_city:  string;
  shipping_customer_state: string;
  shipping_pincode:        string;
  etd:                     string | null;
  ndr_attempts:            number;
  latest_ndr_reason:       string | null;
}

// ─── Auth: get JWT, refresh if expired ───────────────────────────────────────

async function loadCredentials(
  db:        ReturnType<typeof makeSupabaseAdmin>,
  secretRef: string,
): Promise<SrCredentials> {
  const { data, error } = await db
    .from("vault.decrypted_secrets")
    .select("decrypted_secret")
    .eq("name", secretRef)
    .single();
  if (error || !data) throw new Error(`Vault secret '${secretRef}' not found`);
  return JSON.parse(data.decrypted_secret) as SrCredentials;
}

function getJwt(creds: SrCredentials): string {
  if (!creds.api_token) throw new Error("Shiprocket api_token not configured — save credentials in Settings → Integrations");
  return creds.api_token;
}

// ─── Map Shiprocket status to our status check constraint ────────────────────

function normalizeStatus(s: string): string {
  const s2 = s.toUpperCase().replace(/\s+/g, "_");
  const valid = [
    "NEW","PENDING","PICKUP_SCHEDULED","PICKED_UP",
    "IN_TRANSIT","OUT_FOR_DELIVERY","DELIVERED",
    "RTO_INITIATED","RTO_IN_TRANSIT","RTO_DELIVERED",
    "CANCELLED","LOST","DAMAGED","NDR",
  ];
  return valid.includes(s2) ? s2 : "NEW";
}

function normalizePaymentMethod(s: string): "prepaid" | "cod" | null {
  const l = s.toLowerCase();
  if (l.includes("prepaid")) return "prepaid";
  if (l.includes("cod"))     return "cod";
  return null;
}

// ─── Resolve order_id from channel_order_id (WC order number) ────────────────

const orderIdCache = new Map<string, number | null>();

async function resolveOrderId(
  db:      ReturnType<typeof makeSupabaseAdmin>,
  wcNum:   string,
): Promise<number | null> {
  if (orderIdCache.has(wcNum)) return orderIdCache.get(wcNum)!;
  const { data } = await db
    .from("orders")
    .select("id")
    .eq("woocommerce_order_number", wcNum)
    .maybeSingle();
  const id = data?.id ?? null;
  orderIdCache.set(wcNum, id);
  return id;
}

// ─── Sync: Shipments ─────────────────────────────────────────────────────────

async function syncShipments(
  db:     ReturnType<typeof makeSupabaseAdmin>,
  job:    SyncJob,
  runId:  number,
  jwt:    string,
  after:  string,
  repair: boolean,
): Promise<{ counters: RunCounters; watermarkTo: string }> {
  const counters: RunCounters = {
    records_fetched: 0, records_inserted: 0,
    records_updated: 0, records_skipped: 0, records_failed: 0,
  };
  const now    = new Date().toISOString().slice(0, 10);
  const from   = repair
    ? new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
    : after.slice(0, 10);
  let page     = 1;
  let hasMore  = true;
  let watermarkTo = after;
  const headers = { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" };

  while (hasMore) {
    const url = `${SR_BASE}/shipments?from=${from}&to=${now}&per_page=${job.batch_size}&page=${page}`;
    const res  = await fetchWithRetry(url, { headers });
    if (!res.ok) throw new Error(`Shiprocket shipments API: ${res.status}`);

    const body = await res.json();
    const shipments: SrShipment[] = body?.data?.data ?? [];
    if (shipments.length === 0) break;
    counters.records_fetched += shipments.length;

    for (const s of shipments) {
      try {
        const orderId = await resolveOrderId(db, s.channel_order_id);

        const { error } = await db.from("shipments").upsert({
          order_id:              orderId,
          shiprocket_order_id:   s.id,
          awb_code:              s.awb_code || null,
          status:                normalizeStatus(s.status),
          courier_company:       s.courier_name || null,
          channel_sku:           s.channel_sku  || null,
          product_quantity:      s.product_quantity,
          payment_method:        normalizePaymentMethod(s.payment_method),
          order_total_inr:       parseFloat(s.total) || null,
          freight_total_inr:     parseFloat(s.freight_total) || null,
          cod_charges_inr:       parseFloat(s.cod_charges)   || 0,
          shiprocket_created_at: s.created_at,
          delivered_at:          s.delivered_date      || null,
          rto_initiated_at:      s.rto_initiated_date  || null,
          rto_delivered_at:      s.rto_delivered_date  || null,
          edd:                   s.etd ? s.etd.slice(0, 10) : null,
          ndr_attempts:          s.ndr_attempts ?? 0,
          latest_ndr_reason:     s.latest_ndr_reason   || null,
          customer_city:         s.shipping_customer_city  || null,
          customer_state:        s.shipping_customer_state || null,
          customer_pincode:      s.shipping_pincode        || null,
        }, {
          onConflict:      "awb_code",
          ignoreDuplicates: false,
        });

        if (error) throw error;
        counters.records_updated++;
        if (s.updated_at > watermarkTo) watermarkTo = s.updated_at;
      } catch (err) {
        counters.records_failed++;
        await recordSyncError(db, runId, job.integration_key, job.entity_type,
          s.awb_code || String(s.id), "MAPPING_ERROR",
          err instanceof Error ? err.message : String(err), s);
      }
    }

    hasMore = shipments.length === job.batch_size;
    page++;
  }

  return { counters, watermarkTo };
}

// ─── Entry point ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const db    = makeSupabaseAdmin();
  let runId:  number | null = null;
  let job:    SyncJob       | null = null;

  try {
    const body: { run_id: number; job_id: number } = await req.json();
    runId = body.run_id;

    const { data: jobRow, error: jobErr } = await db
      .from("sync_jobs")
      .select("*, integration_settings(config, secret_ref)")
      .eq("id", body.job_id)
      .single();
    if (jobErr || !jobRow) throw new Error(`Job ${body.job_id} not found`);

    job = {
      ...jobRow,
      config:     (jobRow as Record<string, unknown>).integration_settings?.config ?? {},
      secret_ref: (jobRow as Record<string, unknown>).integration_settings?.secret_ref ?? null,
    } as SyncJob;

    if (!job.secret_ref) throw new Error("No secret_ref configured for Shiprocket");
    const creds  = await loadCredentials(db, job.secret_ref);
    const jwt    = await getJwt(creds);
    const after  = computeWatermarkFrom(job);
    const repair = job.entity_type === "shipments_repair";

    const result = await syncShipments(db, job, runId, jwt, after, repair);
    const status = resolveRunStatus(result.counters);

    await completeSyncRun(db, runId, status, result.counters, result.watermarkTo, null, { after });
    if (status !== "failed") await advanceWatermark(db, job.id, result.watermarkTo);

    return new Response(JSON.stringify({ ok: true, status, ...result.counters }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sync-shiprocket]", msg);

    if (runId) {
      await makeSupabaseAdmin()
        .from("sync_runs")
        .update({ status: "failed", completed_at: new Date().toISOString(), error_summary: msg })
        .eq("id", runId)
        .catch(console.error);
    }

    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
