// Supabase Edge Function: sync-ccavenue
// Pulls COD remittance (CRF) data from CCAvenue Reconciliation API.
// Auth: AES-128-CBC encrypted requests (merchant_id + access_code + working_key).
// Writes to: ccavenue_settlements (upsert on crf_id).
// Also patches: shipments.utr_number + shipments.remitted_inr for matched CRF rows.
// Auto-links: bank_transactions.linked_settlement_id where UTR matches.

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

const CCA_API = "https://api.ccavenue.com/apis/servlet/DoWebTrans";

// ─── Credentials ─────────────────────────────────────────────────────────────

interface CCACredentials {
  merchant_id:  string;
  access_code:  string;
  working_key:  string;
}

async function loadCredentials(
  db:        ReturnType<typeof makeSupabaseAdmin>,
  secretRef: string,
): Promise<CCACredentials> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .schema("vault")
    .from("decrypted_secrets")
    .select("decrypted_secret")
    .eq("name", secretRef)
    .single();
  if (error || !data) throw new Error(`Vault secret '${secretRef}' not found: ${error?.message}`);
  return JSON.parse(data.decrypted_secret) as CCACredentials;
}

// ─── AES-128-CBC encryption (CCAvenue's scheme) ───────────────────────────────
// Key  = MD5(working_key) → 16 bytes
// IV   = same 16 bytes as key
// CCAvenue encodes cipher as lowercase hex string.

// Pure-JS MD5 — no external imports (Web Crypto doesn't support MD5)
function md5Bytes(input: string): Uint8Array {
  const msg = new TextEncoder().encode(input);
  const len = msg.length;
  const padLen = ((55 - len % 64 + 64) % 64) + 1;
  const total = len + padLen + 8;
  const buf = new Uint8Array(total);
  buf.set(msg);
  buf[len] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, (len * 8) >>> 0, true);
  dv.setUint32(total - 4, Math.floor(len / 0x20000000), true);

  let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;
  const T = Array.from({ length: 64 }, (_, i) => (4294967296 * Math.abs(Math.sin(i + 1))) >>> 0);
  const S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,
             5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,
             4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,
             6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];

  for (let i = 0; i < total; i += 64) {
    const M = Array.from({ length: 16 }, (_, j) => dv.getUint32(i + j * 4, true));
    const aa = a, bb = b, cc = c, dd = d;
    for (let j = 0; j < 64; j++) {
      let f: number; let g: number;
      if (j < 16)      { f = (b & c) | (~b & d); g = j; }
      else if (j < 32) { f = (d & b) | (~d & c); g = (5*j+1) % 16; }
      else if (j < 48) { f = b ^ c ^ d;           g = (3*j+5) % 16; }
      else             { f = c ^ (b | ~d);         g = (7*j) % 16; }
      f = (f + a + T[j] + M[g]) >>> 0;
      const rot = S[j];
      a = d; d = c; c = b;
      b = (b + ((f << rot) | (f >>> (32 - rot)))) >>> 0;
    }
    a = (a + aa) >>> 0; b = (b + bb) >>> 0;
    c = (c + cc) >>> 0; d = (d + dd) >>> 0;
  }

  const out = new Uint8Array(16);
  const rv = new DataView(out.buffer);
  rv.setUint32(0, a, true); rv.setUint32(4, b, true);
  rv.setUint32(8, c, true); rv.setUint32(12, d, true);
  return out;
}

async function getKeyAndIv(workingKey: string): Promise<{ key: CryptoKey; iv: Uint8Array }> {
  const keyBytes = md5Bytes(workingKey);
  const key = await crypto.subtle.importKey(
    "raw", keyBytes, { name: "AES-CBC" }, false, ["encrypt", "decrypt"],
  );
  return { key, iv: keyBytes };  // CCAvenue uses same bytes for IV
}

async function ccaEncrypt(plainText: string, workingKey: string): Promise<string> {
  const { key, iv } = await getKeyAndIv(workingKey);
  const data = new TextEncoder().encode(plainText);
  const cipher = await crypto.subtle.encrypt({ name: "AES-CBC", iv }, key, data);
  return Array.from(new Uint8Array(cipher))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function ccaDecrypt(hexCipher: string, workingKey: string): Promise<string> {
  const { key, iv } = await getKeyAndIv(workingKey);
  const bytes = new Uint8Array(
    (hexCipher.match(/.{2}/g) ?? []).map(h => parseInt(h, 16)),
  );
  const plain = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, key, bytes);
  return new TextDecoder().decode(plain);
}

// ─── CCAvenue API call ────────────────────────────────────────────────────────

interface CCAOrder {
  Order_No:        string;   // merchant order number (WC order ID)
  Tracking_No?:    string;   // AWB code
  Payment_Mode?:   string;   // "COD" | "Online"
  Order_AMT?:      string;
  Order_Status?:   string;
  CRF_ID?:         string;   // COD batch ID — links to shipments.cod_crf_id
  Remittance_Date?: string;  // DD-MM-YYYY
  UTR_No?:         string;   // bank remittance reference
  Remitted_AMT?:   string;   // amount CCAvenue sent to bank in this CRF
  // Some API versions use different casing
  crf_id?:         string;
  utr_no?:         string;
  remittance_date?: string;
  remitted_amt?:   string;
  order_no?:       string;
  payment_mode?:   string;
}

interface CCAResponse {
  Order_Result?: {
    Pagination_Count?: string;
    Order_Detail?:     CCAOrder | CCAOrder[];
  };
  // Error case
  error_code?:    string;
  error_message?: string;
}

function ddmmyyyy(isoDate: string): string {
  // "2026-01-15" → "15-01-2026"
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  return `${d}-${m}-${y}`;
}

function parseDate(raw: string | undefined): string | null {
  if (!raw) return null;
  if (/^\d{2}-\d{2}-\d{4}$/.test(raw)) {
    const [d, m, y] = raw.split("-");
    return `${y}-${m}-${d}`;
  }
  return raw.slice(0, 10); // assume ISO already
}

function coalesce<T>(...vals: (T | undefined | null)[]): T | undefined {
  return vals.find(v => v !== undefined && v !== null && v !== "") as T | undefined;
}

async function fetchPage(
  creds:    CCACredentials,
  fromDate: string,
  toDate:   string,
  page:     number,
  pageSize: number,
): Promise<CCAOrder[]> {
  const reqJson = JSON.stringify({
    merchant_id: creds.merchant_id,
    fromDate:    ddmmyyyy(fromDate),
    toDate:      ddmmyyyy(toDate),
    pageNo:      String(page),
    pageSize:    String(pageSize),
  });

  const encReq = await ccaEncrypt(reqJson, creds.working_key);

  const body = new URLSearchParams({
    enc_request:   encReq,
    access_code:   creds.access_code,
    request_type:  "JSON",
    response_type: "JSON",
    command:       "reconciliate",
    version:       "1.1",
  });

  const res = await fetchWithRetry(CCA_API, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    body.toString(),
  });

  const text = await res.text();

  // Response may be plain JSON or "enc_response=HEX"
  let decoded: string;
  if (text.startsWith("enc_response=")) {
    const hexPart = new URLSearchParams(text).get("enc_response") ?? "";
    decoded = await ccaDecrypt(hexPart, creds.working_key);
  } else {
    decoded = text;
  }

  let parsed: CCAResponse;
  try { parsed = JSON.parse(decoded); }
  catch { throw new Error(`CCAvenue API bad JSON: ${decoded.slice(0, 200)}`); }

  if (parsed.error_code || parsed.error_message) {
    throw new Error(`CCAvenue API error ${parsed.error_code}: ${parsed.error_message}`);
  }

  const detail = parsed.Order_Result?.Order_Detail;
  if (!detail) return [];
  return Array.isArray(detail) ? detail : [detail];
}

// ─── Group orders into CRF batches ───────────────────────────────────────────

interface CrfBatch {
  crf_id:          string;
  settlement_date: string | null;
  utr_number:      string | null;
  bank_amount_inr: number;
  order_nos:       string[];
}

function groupByCrf(orders: CCAOrder[]): Map<string, CrfBatch> {
  const map = new Map<string, CrfBatch>();

  for (const o of orders) {
    const crfId = coalesce(o.CRF_ID, o.crf_id);
    if (!crfId) continue;  // skip non-COD / no CRF

    const mode = coalesce(o.Payment_Mode, o.payment_mode) ?? "";
    if (!mode.toLowerCase().includes("cod")) continue;

    const orderNo  = coalesce(o.Order_No, o.order_no) ?? "";
    const utr      = coalesce(o.UTR_No, o.utr_no) ?? null;
    const remAmt   = parseFloat(coalesce(o.Remitted_AMT, o.remitted_amt) ?? "0") || 0;
    const remDate  = parseDate(coalesce(o.Remittance_Date, o.remittance_date));

    if (!map.has(crfId)) {
      map.set(crfId, {
        crf_id:          crfId,
        settlement_date: remDate,
        utr_number:      utr,
        bank_amount_inr: remAmt,
        order_nos:       [],
      });
    }
    const batch = map.get(crfId)!;
    if (orderNo) batch.order_nos.push(orderNo);
    if (!batch.utr_number && utr) batch.utr_number = utr;
    if (!batch.settlement_date && remDate) batch.settlement_date = remDate;
    // bank_amount_inr is per-batch, keep the max seen (same value on all rows of a batch)
    if (remAmt > batch.bank_amount_inr) batch.bank_amount_inr = remAmt;
  }

  return map;
}

// ─── Main sync ────────────────────────────────────────────────────────────────

async function syncSettlements(
  db:    ReturnType<typeof makeSupabaseAdmin>,
  job:   SyncJob,
  runId: number,
  creds: CCACredentials,
  after: string,
): Promise<{ counters: RunCounters; watermarkTo: string }> {
  const counters: RunCounters = {
    records_fetched: 0, records_inserted: 0,
    records_updated: 0, records_skipped: 0, records_failed: 0,
  };

  const fromDate   = after.slice(0, 10);
  const toDate     = new Date().toISOString().slice(0, 10);
  let   page       = 1;
  let   hasMore    = true;
  let   watermarkTo = after;
  const allOrders: CCAOrder[] = [];

  // Fetch all pages
  while (hasMore) {
    const page_orders = await fetchPage(creds, fromDate, toDate, page, job.batch_size);
    counters.records_fetched += page_orders.length;
    allOrders.push(...page_orders);
    hasMore = page_orders.length === job.batch_size;
    page++;
  }

  // Group into CRF batches
  const batches = groupByCrf(allOrders);

  for (const [crfId, batch] of batches) {
    try {
      // Upsert settlement record
      const { error: upsertErr } = await db
        .from("ccavenue_settlements")
        .upsert({
          crf_id:          crfId,
          settlement_date: batch.settlement_date,
          utr_number:      batch.utr_number,
          bank_amount_inr: batch.bank_amount_inr,
          order_count:     batch.order_nos.length,
          synced_at:       new Date().toISOString(),
        }, { onConflict: "crf_id", ignoreDuplicates: false });

      if (upsertErr) throw upsertErr;
      counters.records_inserted++;

      // Patch shipments: set utr_number + remitted_inr for all rows in this CRF
      if (batch.utr_number || batch.bank_amount_inr > 0) {
        await db
          .from("shipments")
          .update({
            ...(batch.utr_number      ? { utr_number:    batch.utr_number }      : {}),
            ...(batch.bank_amount_inr ? { remitted_inr:  batch.bank_amount_inr } : {}),
            ...(batch.settlement_date ? { cod_remittance_date: batch.settlement_date } : {}),
          })
          .eq("cod_crf_id", crfId);
      }

      // Auto-link bank_transactions where UTR matches
      if (batch.utr_number) {
        const { data: settlement } = await db
          .from("ccavenue_settlements")
          .select("id")
          .eq("crf_id", crfId)
          .single();

        if (settlement) {
          await db
            .from("bank_transactions")
            .update({ linked_settlement_id: settlement.id })
            .or(
              `reference_number.eq.${batch.utr_number},extracted_reference.eq.${batch.utr_number}`,
            )
            .is("linked_settlement_id", null);
        }
      }

      if (batch.settlement_date && batch.settlement_date > watermarkTo.slice(0, 10)) {
        watermarkTo = batch.settlement_date + "T00:00:00.000Z";
      }
    } catch (err) {
      counters.records_failed++;
      await recordSyncError(
        db, runId, job.integration_key, job.entity_type,
        crfId, "UNKNOWN",
        err instanceof Error ? err.message : String(err),
        batch,
      );
    }
  }

  return { counters, watermarkTo };
}

// ─── Entry point ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const db    = makeSupabaseAdmin();
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

    if (!job.secret_ref) throw new Error("No secret_ref for CCAvenue");

    const creds = await loadCredentials(db, job.secret_ref);
    const after = computeWatermarkFrom(job);

    const result = await syncSettlements(db, job, runId, creds, after);

    const status = resolveRunStatus(result.counters);
    await completeSyncRun(db, runId, status, result.counters, result.watermarkTo, null, { after });
    if (status !== "failed") await advanceWatermark(db, job.id, result.watermarkTo);

    return new Response(JSON.stringify({ ok: true, status, ...result.counters }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sync-ccavenue]", msg);
    if (runId) {
      await makeSupabaseAdmin()
        .from("sync_runs")
        .update({ status: "failed", completed_at: new Date().toISOString(), error_summary: msg })
        .eq("id", runId)
        .catch(console.error);
    }
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
