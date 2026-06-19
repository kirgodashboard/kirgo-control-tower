// Supabase Edge Function: sync-woocommerce
// Pulls orders, products, or customers from WooCommerce REST API v3.
// Triggered by: /api/sync/trigger (Next.js) or /api/sync/schedule (Vercel Cron).
// Writes to: orders, order_lines, customers (existing tables — no schema change).
// Idempotent: upserts on woocommerce_order_id / woocommerce_customer_id.

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

// ─── WooCommerce API types (minimal — only fields we persist) ─────────────────

interface WcOrder {
  id:                   number;
  number:               string;
  status:               string;
  payment_method:       string;
  payment_method_title: string;
  transaction_id:       string;
  total:                string;
  discount_total:       string;
  shipping_total:       string;
  date_created:         string;
  date_paid:            string | null;
  customer_id:          number;
  billing: {
    city:     string;
    state:    string;
    postcode: string;
  };
  meta_data: Array<{ key: string; value: string }>;
  line_items: Array<{
    id:           number;
    product_id:   number;
    variation_id: number;
    name:         string;
    sku:          string;
    quantity:     number;
    price:        string;
    total:        string;
    subtotal:     string;
  }>;
}

interface WcProduct {
  id:          number;
  name:        string;
  sku:         string;
  status:      string;
  date_modified: string;
}

interface WcCustomer {
  id:           number;
  email:        string;
  first_name:   string;
  last_name:    string;
  date_created: string;
  date_modified: string;
  billing: { phone: string; city: string; state: string; postcode: string };
}

// ─── Credential helpers ───────────────────────────────────────────────────────

interface WcCredentials {
  store_url:       string;
  consumer_key:    string;
  consumer_secret: string;
}

async function loadCredentials(db: ReturnType<typeof makeSupabaseAdmin>, secretRef: string): Promise<WcCredentials> {
  const { data, error } = await db
    .from("vault.decrypted_secrets")
    .select("decrypted_secret")
    .eq("name", secretRef)
    .single();

  if (error || !data) throw new Error(`Vault secret '${secretRef}' not found`);
  return JSON.parse(data.decrypted_secret) as WcCredentials;
}

function basicAuth(key: string, secret: string): string {
  return "Basic " + btoa(`${key}:${secret}`);
}

// ─── Sync: Orders ─────────────────────────────────────────────────────────────

async function syncOrders(
  db:      ReturnType<typeof makeSupabaseAdmin>,
  job:     SyncJob,
  runId:   number,
  creds:   WcCredentials,
  after:   string,
): Promise<{ counters: RunCounters; watermarkTo: string }> {
  const counters: RunCounters = {
    records_fetched: 0, records_inserted: 0,
    records_updated: 0, records_skipped: 0, records_failed: 0,
  };
  let page        = 1;
  let hasMore     = true;
  let watermarkTo = after;
  const apiBase   = creds.store_url.replace(/\/$/, "");
  const headers   = { Authorization: basicAuth(creds.consumer_key, creds.consumer_secret) };

  while (hasMore) {
    const url = `${apiBase}/wp-json/wc/v3/orders?after=${encodeURIComponent(after)}&per_page=${job.batch_size}&page=${page}&orderby=date&order=asc&status=any`;
    const res  = await fetchWithRetry(url, { headers });
    if (!res.ok) throw new Error(`WooCommerce orders API error: ${res.status}`);

    const orders: WcOrder[] = await res.json();
    if (orders.length === 0) break;
    counters.records_fetched += orders.length;

    for (const order of orders) {
      try {
        // Map UTM meta_data
        const meta   = Object.fromEntries(order.meta_data.map((m) => [m.key, m.value]));
        const status = normalizeOrderStatus(order.status);

        const { error: upsertErr, data: upsertData } = await db
          .from("orders")
          .upsert({
            woocommerce_order_id:     order.id,
            woocommerce_order_number: order.number,
            status,
            payment_method:       order.payment_method,
            payment_method_title: order.payment_method_title,
            transaction_id:       order.transaction_id || null,
            order_total_inr:      parseFloat(order.total),
            discount_inr:         parseFloat(order.discount_total),
            shipping_charged_inr: parseFloat(order.shipping_total),
            billing_city:         order.billing.city || null,
            billing_state:        order.billing.state || null,
            billing_pincode:      order.billing.postcode || null,
            ordered_at:           order.date_created,
            paid_at:              order.date_paid || null,
            attribution_source:   meta["_wc_order_attribution_source_type"] || null,
            attribution_medium:   meta["utm_medium"] || null,
            attribution_campaign: meta["utm_campaign"] || null,
            attribution_device:   meta["_wc_order_attribution_device_type"] || null,
          }, {
            onConflict:     "woocommerce_order_id",
            ignoreDuplicates: false,
          })
          .select("id, created_at")
          .single();

        if (upsertErr) throw upsertErr;
        const orderId   = upsertData.id as number;
        const isNew     = upsertData.created_at === null; // heuristic not reliable, count as updated

        // Upsert order lines
        for (const line of order.line_items) {
          await db.from("order_lines").upsert({
            order_id:                orderId,
            woocommerce_line_item_id: line.id,
            sku_raw:                 line.sku || null,
            product_name_raw:        line.name || null,
            quantity:                line.quantity,
            unit_price_inr:          parseFloat(line.price),
            line_total_inr:          parseFloat(line.total),
            line_subtotal_inr:       parseFloat(line.subtotal),
          }, { onConflict: "woocommerce_line_item_id", ignoreDuplicates: false });
        }

        counters.records_updated++;
        // Track latest modified_at for watermark
        if (order.date_created > watermarkTo) watermarkTo = order.date_created;
      } catch (err) {
        counters.records_failed++;
        await recordSyncError(db, runId, job.integration_key, job.entity_type,
          String(order.id), "MAPPING_ERROR",
          err instanceof Error ? err.message : String(err), order);
      }
    }

    hasMore = orders.length === job.batch_size;
    page++;
  }

  return { counters, watermarkTo };
}

function normalizeOrderStatus(s: string): string {
  const valid = ["processing","completed","cancelled","refunded","on-hold","pending","failed"];
  return valid.includes(s) ? s : "processing";
}

// ─── Sync: Products (lightweight — just SKU catalogue refresh) ────────────────

async function syncProducts(
  db:    ReturnType<typeof makeSupabaseAdmin>,
  job:   SyncJob,
  _runId: number,
  creds: WcCredentials,
  after: string,
): Promise<{ counters: RunCounters; watermarkTo: string }> {
  const counters: RunCounters = {
    records_fetched: 0, records_inserted: 0,
    records_updated: 0, records_skipped: 0, records_failed: 0,
  };
  let watermarkTo = after;
  const apiBase   = creds.store_url.replace(/\/$/, "");
  const headers   = { Authorization: basicAuth(creds.consumer_key, creds.consumer_secret) };
  let page        = 1;
  let hasMore     = true;

  while (hasMore) {
    const url = `${apiBase}/wp-json/wc/v3/products?modified_after=${encodeURIComponent(after)}&per_page=${job.batch_size}&page=${page}`;
    const res  = await fetchWithRetry(url, { headers });
    if (!res.ok) throw new Error(`WooCommerce products API: ${res.status}`);
    const products: WcProduct[] = await res.json();
    if (products.length === 0) break;
    counters.records_fetched += products.length;
    counters.records_skipped += products.length; // products table managed separately; log only

    if (products.at(-1)!.date_modified > watermarkTo) {
      watermarkTo = products.at(-1)!.date_modified;
    }

    hasMore = products.length === job.batch_size;
    page++;
  }

  return { counters, watermarkTo };
}

// ─── Sync: Customers ─────────────────────────────────────────────────────────

async function syncCustomers(
  db:    ReturnType<typeof makeSupabaseAdmin>,
  job:   SyncJob,
  runId: number,
  creds: WcCredentials,
  after: string,
): Promise<{ counters: RunCounters; watermarkTo: string }> {
  const counters: RunCounters = {
    records_fetched: 0, records_inserted: 0,
    records_updated: 0, records_skipped: 0, records_failed: 0,
  };
  let watermarkTo = after;
  const apiBase   = creds.store_url.replace(/\/$/, "");
  const headers   = { Authorization: basicAuth(creds.consumer_key, creds.consumer_secret) };
  let page        = 1;
  let hasMore     = true;

  while (hasMore) {
    const url = `${apiBase}/wp-json/wc/v3/customers?modified_after=${encodeURIComponent(after)}&per_page=${job.batch_size}&page=${page}`;
    const res  = await fetchWithRetry(url, { headers });
    if (!res.ok) throw new Error(`WooCommerce customers API: ${res.status}`);
    const customers: WcCustomer[] = await res.json();
    if (customers.length === 0) break;
    counters.records_fetched += customers.length;

    for (const c of customers) {
      try {
        await db.from("customers").upsert({
          woocommerce_customer_id: c.id,
          email:                   c.email,
          full_name:               `${c.first_name} ${c.last_name}`.trim() || null,
          phone:                   c.billing.phone || null,
          city:                    c.billing.city  || null,
          state:                   c.billing.state || null,
          pincode:                 c.billing.postcode || null,
          first_order_at:          c.date_created,
        }, { onConflict: "woocommerce_customer_id", ignoreDuplicates: false });

        counters.records_updated++;
        if (c.date_modified > watermarkTo) watermarkTo = c.date_modified;
      } catch (err) {
        counters.records_failed++;
        await recordSyncError(db, runId, job.integration_key, job.entity_type,
          String(c.id), "MAPPING_ERROR",
          err instanceof Error ? err.message : String(err), c);
      }
    }

    hasMore = customers.length === job.batch_size;
    page++;
  }

  return { counters, watermarkTo };
}

// ─── Entry point ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const db = makeSupabaseAdmin();
  let runId: number | null = null;
  let job:   SyncJob       | null = null;

  try {
    const body: { run_id: number; job_id: number; triggered_by?: string } = await req.json();
    runId = body.run_id;

    // Load job + integration config
    const { data: jobRow, error: jobErr } = await db
      .from("sync_jobs")
      .select("*, integration_settings(config, secret_ref, base_url)")
      .eq("id", body.job_id)
      .single();
    if (jobErr || !jobRow) throw new Error(`Job ${body.job_id} not found`);

    job = {
      ...jobRow,
      config:     (jobRow as Record<string, unknown>).integration_settings?.config ?? {},
      secret_ref: (jobRow as Record<string, unknown>).integration_settings?.secret_ref ?? null,
    } as SyncJob;

    const after = computeWatermarkFrom(job);

    // Load credentials from Vault
    if (!job.secret_ref) throw new Error("No secret_ref configured for WooCommerce");
    const creds = await loadCredentials(db, job.secret_ref);

    let result: { counters: RunCounters; watermarkTo: string };
    switch (job.entity_type) {
      case "orders":
        result = await syncOrders(db, job, runId, creds, after);
        break;
      case "products":
        result = await syncProducts(db, job, runId, creds, after);
        break;
      case "customers":
        result = await syncCustomers(db, job, runId, creds, after);
        break;
      default:
        throw new Error(`Unknown entity_type: ${job.entity_type}`);
    }

    const status = resolveRunStatus(result.counters);
    await completeSyncRun(db, runId, status, result.counters,
      result.watermarkTo, null, { after });

    if (status !== "failed") {
      await advanceWatermark(db, job.id, result.watermarkTo);
    }

    return new Response(JSON.stringify({ ok: true, status, ...result.counters }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sync-woocommerce]", msg);

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
