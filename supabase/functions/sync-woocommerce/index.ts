import {
  makeSupabaseAdmin, computeWatermarkFrom, fetchWithRetry, completeSyncRun,
  advanceWatermark, recordSyncError, resolveRunStatus,
  type SyncJob, type RunCounters,
} from "../_shared/sync-base.ts";

const MAX_PAGES_PER_RUN = 20;

interface WcOrder {
  id: number; number: string; status: string; payment_method: string;
  payment_method_title: string; transaction_id: string; total: string;
  discount_total: string; shipping_total: string; date_created: string;
  date_paid: string | null; customer_id: number;
  billing: { first_name: string; last_name: string; email: string; city: string; state: string; postcode: string };
  meta_data: Array<{ key: string; value: string }>;
  line_items: Array<{
    id: number; product_id: number; variation_id: number;
    name: string; sku: string; quantity: number; price: string;
    total: string; subtotal: string;
  }>;
}

interface WcProduct { id: number; name: string; sku: string; status: string; date_modified: string; }

interface WcCustomer {
  id: number; email: string; first_name: string; last_name: string;
  date_created: string; date_modified: string;
  billing: { phone: string; city: string; state: string; postcode: string };
}

interface WcCredentials { store_url: string; consumer_key: string; consumer_secret: string; }

function basicAuth(key: string, secret: string): string {
  return "Basic " + btoa(`${key}:${secret}`);
}

async function loadCredentials(db: ReturnType<typeof makeSupabaseAdmin>, job: SyncJob): Promise<WcCredentials> {
  const { data, error } = await db.rpc("get_integration_secret", {
    p_integration_key: job.integration_key,
    p_company_id: job.company_id ?? 1,
  });
  if (error || !data) throw new Error(`Credentials not found for ${job.integration_key}: ${error?.message ?? "null"}`);
  return data as WcCredentials;
}

function normalizeOrderStatus(s: string): string {
  const valid = ["processing","completed","cancelled","refunded","on-hold","pending","failed"];
  return valid.includes(s) ? s : "processing";
}

async function syncOrders(
  db: ReturnType<typeof makeSupabaseAdmin>, job: SyncJob, runId: number, creds: WcCredentials, after: string,
): Promise<{ counters: RunCounters; watermarkTo: string }> {
  const counters: RunCounters = { records_fetched: 0, records_inserted: 0, records_updated: 0, records_skipped: 0, records_failed: 0 };
  let page = 1, hasMore = true, watermarkTo = after;
  const apiBase = creds.store_url.replace(/\/$/, "");
  const headers = { Authorization: basicAuth(creds.consumer_key, creds.consumer_secret) };

  while (hasMore && page <= MAX_PAGES_PER_RUN) {
    const url = `${apiBase}/wp-json/wc/v3/orders?after=${encodeURIComponent(after)}&per_page=${job.batch_size}&page=${page}&orderby=date&order=asc&status=any`;
    const res = await fetchWithRetry(url, { headers });
    if (!res.ok) throw new Error(`WooCommerce orders API error: ${res.status}`);
    const orders: WcOrder[] = await res.json();
    if (orders.length === 0) break;
    counters.records_fetched += orders.length;

    // Bulk upsert all orders in one call, then all line items in one call (avoids N+1 timeout)
    const orderPayloads = orders.map((order) => {
      const meta = Object.fromEntries(order.meta_data.map((m) => [m.key, m.value]));
      return {
        woocommerce_order_id: order.id, woocommerce_order_number: order.number,
        status: normalizeOrderStatus(order.status), payment_method: order.payment_method,
        payment_method_title: order.payment_method_title, transaction_id: order.transaction_id || null,
        order_total_inr: parseFloat(order.total), discount_inr: parseFloat(order.discount_total),
        shipping_charged_inr: parseFloat(order.shipping_total),
        billing_first_name: order.billing.first_name || null,
        billing_last_name: order.billing.last_name || null,
        billing_email: order.billing.email || null,
        billing_city: order.billing.city || null, billing_state: order.billing.state || null,
        billing_pincode: order.billing.postcode || null, ordered_at: order.date_created,
        paid_at: order.date_paid || null,
        attribution_source: meta["_wc_order_attribution_source_type"] || null,
        attribution_medium: meta["utm_medium"] || null,
        attribution_campaign: meta["utm_campaign"] || null,
        attribution_device: meta["_wc_order_attribution_device_type"] || null,
      };
    });

    const { data: upsertedOrders, error: ordersErr } = await db.from("orders")
      .upsert(orderPayloads, { onConflict: "woocommerce_order_id", ignoreDuplicates: false })
      .select("id, woocommerce_order_id");

    if (ordersErr) {
      counters.records_failed += orders.length;
      await recordSyncError(db, runId, job.integration_key, job.entity_type, null, "UNKNOWN", ordersErr.message, { page });
    } else {
      counters.records_updated += orders.length;
      const orderIdMap = new Map((upsertedOrders ?? []).map((o) => [o.woocommerce_order_id, o.id]));
      const linePayloads = orders.flatMap((order) => {
        const orderId = orderIdMap.get(order.id);
        if (!orderId) return [];
        return order.line_items.map((line) => ({
          order_id: orderId, woocommerce_line_item_id: line.id, sku_raw: line.sku || null,
          product_name_raw: line.name || null, quantity: line.quantity,
          unit_price_inr: parseFloat(line.price), line_total_inr: parseFloat(line.total),
          line_subtotal_inr: parseFloat(line.subtotal),
        }));
      });
      if (linePayloads.length > 0) {
        await db.from("order_lines").upsert(linePayloads, { onConflict: "woocommerce_line_item_id", ignoreDuplicates: false });
      }
      const latest = orders.at(-1)!.date_created;
      if (latest > watermarkTo) watermarkTo = latest;
    }

    hasMore = orders.length === job.batch_size;
    page++;
  }
  return { counters, watermarkTo };
}

async function syncProducts(
  db: ReturnType<typeof makeSupabaseAdmin>, job: SyncJob, _runId: number, creds: WcCredentials, after: string,
): Promise<{ counters: RunCounters; watermarkTo: string }> {
  const counters: RunCounters = { records_fetched: 0, records_inserted: 0, records_updated: 0, records_skipped: 0, records_failed: 0 };
  let watermarkTo = after;
  const apiBase = creds.store_url.replace(/\/$/, "");
  const headers = { Authorization: basicAuth(creds.consumer_key, creds.consumer_secret) };
  let page = 1, hasMore = true;

  while (hasMore && page <= MAX_PAGES_PER_RUN) {
    const url = `${apiBase}/wp-json/wc/v3/products?modified_after=${encodeURIComponent(after)}&per_page=${job.batch_size}&page=${page}`;
    const res = await fetchWithRetry(url, { headers });
    if (!res.ok) throw new Error(`WooCommerce products API: ${res.status}`);
    const products: WcProduct[] = await res.json();
    if (products.length === 0) break;
    counters.records_fetched += products.length;
    counters.records_skipped += products.length;
    if (products.at(-1)!.date_modified > watermarkTo) watermarkTo = products.at(-1)!.date_modified;
    hasMore = products.length === job.batch_size;
    page++;
  }
  return { counters, watermarkTo };
}

async function syncCustomers(
  db: ReturnType<typeof makeSupabaseAdmin>, job: SyncJob, runId: number, creds: WcCredentials, after: string,
): Promise<{ counters: RunCounters; watermarkTo: string }> {
  const counters: RunCounters = { records_fetched: 0, records_inserted: 0, records_updated: 0, records_skipped: 0, records_failed: 0 };
  let watermarkTo = after;
  const apiBase = creds.store_url.replace(/\/$/, "");
  const headers = { Authorization: basicAuth(creds.consumer_key, creds.consumer_secret) };
  let page = 1, hasMore = true;

  while (hasMore && page <= MAX_PAGES_PER_RUN) {
    const url = `${apiBase}/wp-json/wc/v3/customers?modified_after=${encodeURIComponent(after)}&per_page=${job.batch_size}&page=${page}`;
    const res = await fetchWithRetry(url, { headers });
    if (!res.ok) throw new Error(`WooCommerce customers API: ${res.status}`);
    const customers: WcCustomer[] = await res.json();
    if (customers.length === 0) break;
    counters.records_fetched += customers.length;

    const payloadMap = new Map<string, { email: string; first_name: string | null; last_name: string | null; phone: string | null; first_order_at: string }>();
    for (const c of customers) {
      payloadMap.set(c.email, {
        email: c.email,
        first_name: c.first_name || null,
        last_name: c.last_name || null,
        phone: c.billing?.phone || null,
        first_order_at: c.date_created,
      });
    }
    const payloads = [...payloadMap.values()];
    const { error: upsertErr } = await db.from("customers")
      .upsert(payloads, { onConflict: "email", ignoreDuplicates: false });
    if (upsertErr) {
      counters.records_failed += customers.length;
      await recordSyncError(db, runId, job.integration_key, job.entity_type, null, "MAPPING_ERROR", upsertErr.message, { page });
    } else {
      counters.records_updated += customers.length;
      const latest = customers.at(-1)!.date_modified;
      if (latest > watermarkTo) watermarkTo = latest;
    }

    hasMore = customers.length === job.batch_size;
    page++;
  }
  return { counters, watermarkTo };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const db = makeSupabaseAdmin();
  let runId: number | null = null;

  try {
    const body: { run_id: number; job_id: number; triggered_by?: string } = await req.json();
    runId = body.run_id;
    const { data: jobRow, error: jobErr } = await db.from("sync_jobs").select("*").eq("id", body.job_id).single();
    if (jobErr || !jobRow) throw new Error(`Job ${body.job_id} not found: ${jobErr?.message}`);
    const job = { ...jobRow, config: {}, secret_ref: null } as SyncJob;
    const after = computeWatermarkFrom(job);
    const creds = await loadCredentials(db, job);

    let result: { counters: RunCounters; watermarkTo: string };
    switch (job.entity_type) {
      case "orders":    result = await syncOrders(db, job, runId, creds, after); break;
      case "products":  result = await syncProducts(db, job, runId, creds, after); break;
      case "customers": result = await syncCustomers(db, job, runId, creds, after); break;
      default: throw new Error(`Unknown entity_type: ${job.entity_type}`);
    }

    const status = resolveRunStatus(result.counters);
    await completeSyncRun(db, runId, status, result.counters, result.watermarkTo, null, { after });
    if (status !== "failed") await advanceWatermark(db, job.id, result.watermarkTo);
    return new Response(JSON.stringify({ ok: true, status, ...result.counters }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sync-woocommerce]", msg);
    if (runId) await db.from("sync_runs").update({ status: "failed", completed_at: new Date().toISOString(), error_summary: msg }).eq("id", runId).then(() => {}).catch(console.error);
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
