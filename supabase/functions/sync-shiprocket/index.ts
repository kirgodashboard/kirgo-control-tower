import {
  makeSupabaseAdmin, computeWatermarkFrom, fetchWithRetry, completeSyncRun,
  advanceWatermark, recordSyncError, resolveRunStatus,
  type SyncJob, type RunCounters,
} from "../_shared/sync-base.ts";

const SR_BASE = "https://apiv2.shiprocket.in/v1/external";
const MAX_DAYS_PER_WINDOW = 29; // Shiprocket shipments API hard limit: ≤ 30 days

interface SrCredentials { email: string; password: string; }

interface SrProduct {
  channel_sku: string; quantity: number; price: string;
}

interface SrShipment {
  awb: string; courier: string; shipped_date: string;
}

interface SrOrder {
  id: number;
  channel_order_id: string;
  status: string;
  payment_method: string;
  total: string | number;
  customer_city: string;
  customer_state: string;
  customer_pincode: string;
  zone: string;
  delivered_date: string | null;
  picked_up_date: string | null;
  rto_edd: string | null;
  product_quantity: number;
  created_at: string;
  updated_at: string;
  products: SrProduct[];
  shipments: SrShipment[];
  charges?: { freight_charges: string; cod_charges: string };
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
    RETURN_CANCELLED: "CANCELLED",
    RTO_ACKNOWLEDGED: "RTO_INITIATED", RETURNED: "RTO_DELIVERED", SHIPMENT_LOST: "LOST",
  };
  return aliases[s2] ?? s2;
}

function normalizePaymentMethod(s: string): "prepaid" | "cod" | null {
  const l = (s ?? "").toLowerCase();
  if (l.includes("prepaid")) return "prepaid";
  if (l.includes("cod")) return "cod";
  return null;
}

// Parse Shiprocket date formats: "DD-MM-YYYY HH:MM:SS" or "YYYY-MM-DD HH:MM:SS"
function parseSrDate(s: string | null): string | null {
  if (!s) return null;
  try {
    // "04-06-2026 15:51:00" → ISO
    const ddmmyyyy = s.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}:\d{2}:\d{2})$/);
    if (ddmmyyyy) return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}T${ddmmyyyy[4]}Z`;
    // "2026-06-02 13:06:43" → ISO
    const yyyymmdd = s.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})$/);
    if (yyyymmdd) return `${yyyymmdd[1]}T${yyyymmdd[2]}Z`;
    return new Date(s).toISOString();
  } catch { return null; }
}

// Convert "2 Jun 2026, 01:57 PM" → ISO string
function parseSrHumanDate(s: string): string | null {
  if (!s) return null;
  try { return new Date(s.replace(" Jun ", " June ").replace(" Feb ", " February ")).toISOString(); }
  catch { return null; }
}

const orderIdCache = new Map<string, number | null>();

async function resolveOrderId(db: ReturnType<typeof makeSupabaseAdmin>, wcNum: string): Promise<number | null> {
  // channel_order_id can be "2047" or "R_2039" — strip prefix for matching
  const normalized = wcNum.replace(/^[A-Z_]+/i, "").trim();
  const cacheKey = normalized;
  if (orderIdCache.has(cacheKey)) return orderIdCache.get(cacheKey)!;
  const { data } = await db.from("orders").select("id")
    .eq("woocommerce_order_number", normalized).maybeSingle();
  const id = data?.id ?? null;
  orderIdCache.set(cacheKey, id);
  return id;
}

async function syncOrders(
  db: ReturnType<typeof makeSupabaseAdmin>, job: SyncJob, runId: number, jwt: string, after: string, repair: boolean,
): Promise<{ counters: RunCounters; watermarkTo: string }> {
  const counters: RunCounters = { records_fetched: 0, records_inserted: 0, records_updated: 0, records_skipped: 0, records_failed: 0 };

  const sinceDate = repair
    ? new Date(Date.now() - 30 * 86_400_000)
    : new Date(after.slice(0, 10));
  const untilDate = new Date(sinceDate);
  untilDate.setDate(untilDate.getDate() + MAX_DAYS_PER_WINDOW);
  if (untilDate > new Date()) untilDate.setTime(Date.now());

  const from = sinceDate.toISOString().slice(0, 10);
  const until = untilDate.toISOString().slice(0, 10);
  let page = 1, hasMore = true, watermarkTo = after;
  const headers = { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" };

  while (hasMore) {
    const url = `${SR_BASE}/orders?from=${from}&to=${until}&per_page=${job.batch_size}&page=${page}&sort=ASC&sort_by=created_at`;
    const res = await fetchWithRetry(url, { headers });
    if (!res.ok) throw new Error(`Shiprocket orders API: ${res.status}`);
    const body = await res.json();
    // Response: { data: [...], meta: { pagination: { ... } } }
    const orders: SrOrder[] = Array.isArray(body?.data) ? body.data : [];
    if (orders.length === 0) break;
    counters.records_fetched += orders.length;

    const payloads = await Promise.all(orders.map(async (order) => {
      const orderId = await resolveOrderId(db, order.channel_order_id);
      const awb = order.shipments?.[0]?.awb || null;
      const courier = order.shipments?.[0]?.courier || null;
      const shippedAt = parseSrDate(order.shipments?.[0]?.shipped_date ?? null);
      const deliveredAt = parseSrDate(order.delivered_date);
      const pickedUpAt = parseSrDate(order.picked_up_date);
      const freightTotal = parseFloat(order.charges?.freight_charges ?? "0") || null;
      const codCharges = parseFloat(order.charges?.cod_charges ?? "0") || 0;
      const product = order.products?.[0];
      const sku = product?.channel_sku || null;
      const total = parseFloat(String(order.total)) || null;
      return {
        order_id: orderId,
        shiprocket_order_id: order.id,
        awb_code: awb,
        status: normalizeStatus(order.status),
        courier_company: courier,
        channel_sku: sku,
        product_quantity: order.product_quantity ?? product?.quantity ?? 1,
        payment_method: normalizePaymentMethod(order.payment_method),
        order_total_inr: total,
        freight_total_inr: freightTotal,
        cod_charges_inr: codCharges,
        zone: order.zone || null,
        shiprocket_created_at: parseSrHumanDate(order.created_at),
        picked_up_at: pickedUpAt,
        shipped_at: shippedAt,
        delivered_at: deliveredAt,
        edd: order.rto_edd ? order.rto_edd.slice(0, 10) : null,
        customer_city: order.customer_city || null,
        customer_state: order.customer_state || null,
        customer_pincode: order.customer_pincode || null,
      };
    }));

    // Filter out rows without AWB (orders not yet shipped)
    const withAwb = payloads.filter((p) => !!p.awb_code);
    const withoutAwb = payloads.length - withAwb.length;
    counters.records_skipped += withoutAwb;

    if (withAwb.length > 0) {
      const { error: upsertErr } = await db.from("shipments")
        .upsert(withAwb, { onConflict: "awb_code", ignoreDuplicates: false });
      if (upsertErr) {
        counters.records_failed += withAwb.length;
        await recordSyncError(db, runId, job.integration_key, job.entity_type, null, "BATCH_ERROR", upsertErr.message, { from, until, page });
      } else {
        counters.records_updated += withAwb.length;
      }
    }

    // Advance watermark using ISO created_at derived from parsed dates
    const lastCreated = parseSrHumanDate(orders.at(-1)!.created_at);
    if (lastCreated && lastCreated > watermarkTo) watermarkTo = lastCreated;

    const totalPages = body?.meta?.pagination?.total_pages ?? 1;
    hasMore = page < totalPages;
    page++;
  }

  // Advance watermark to end of window on success
  const windowEnd = until + "T23:59:59Z";
  if (windowEnd > watermarkTo) watermarkTo = windowEnd;

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
    const result = await syncOrders(db, job, runId, jwt, after, repair);
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
