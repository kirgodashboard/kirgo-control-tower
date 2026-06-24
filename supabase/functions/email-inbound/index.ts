// email-inbound — webhook target for the dedicated import mailbox (Part D2/D3).
// Provider (Cloudflare Email Routing worker / Postmark / SendGrid Inbound) POSTs
// a normalized JSON payload; this function identifies the source, dedupes,
// parses the attachment, and imports via the settlement RPCs. Idempotent.
//
// Auth: verify_jwt is disabled (external webhook); we require a shared secret
// header `x-webhook-secret` matching INBOUND_WEBHOOK_SECRET.
//
// Expected payload (provider-agnostic):
// { "message_id": "...", "from": "...", "subject": "...", "company_id": 1,
//   "attachments": [{ "filename": "...", "content_type": "...", "content_base64": "..." }] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

interface Attachment { filename: string; content_type?: string; content_base64: string; }
interface InboundPayload {
  message_id: string; from?: string; subject?: string; company_id?: number;
  attachments?: Attachment[];
}

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

function norm(s: string): string { return s.toLowerCase().replace(/[^a-z0-9]/g, ""); }

function detectSource(from: string, subject: string, filename: string, headers: string[]): string | null {
  const hay = `${from} ${subject} ${filename}`.toLowerCase();
  if (/gokwik/.test(hay) || headers.some((h) => norm(h).includes("gokwikorderid"))) return "gokwik";
  if (/ccavenue|cca\b/.test(hay) || headers.some((h) => norm(h).includes("crfid"))) return "ccavenue";
  return null;
}

function findCol(headers: string[], cands: string[]): string | null {
  for (const h of headers) if (cands.some((c) => norm(h).includes(norm(c)))) return h;
  return null;
}
function num(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = parseFloat(String(v).replace(/[,\s₹]/g, "").trim());
  return isNaN(n) ? 0 : n;
}
function toDate(v: string): string | null {
  if (!v) return null;
  let m = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = v.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})/);
  if (m) return v.substring(0, 10);
  return null;
}

function parseRows(bytes: Uint8Array): Record<string, string>[] {
  const wb = XLSX.read(bytes, { type: "array", cellText: true, cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" });
  if (raw.length < 2) return [];
  let hdr = 0;
  for (let i = 0; i < Math.min(raw.length, 10); i++) {
    if ((raw[i] as string[]).filter((c) => String(c).trim() !== "").length >= 3) { hdr = i; break; }
  }
  const headers = (raw[hdr] as string[]).map((h) => String(h).trim());
  return (raw.slice(hdr + 1) as string[][])
    .filter((r) => r.some((c) => String(c).trim() !== ""))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, String(r[i] ?? "").trim()])));
}

function transform(source: string, rows: Record<string, string>[]): Record<string, unknown>[] {
  if (rows.length === 0) return [];
  const h = Object.keys(rows[0]);
  if (source === "gokwik") {
    const co = findCol(h, ["gokwikorderid", "orderid", "merchantorderid"])!;
    const ca = findCol(h, ["settlementamount", "grandtotal", "amount"])!;
    const cd = findCol(h, ["settlementdate", "date", "createdat"]);
    const cu = findCol(h, ["utr", "reference"]);
    const cs = findCol(h, ["status", "orderstatus"]);
    return rows.map((r) => ({
      gokwik_order_id: r[co], amount_inr: num(r[ca]),
      settlement_date: cd ? toDate(r[cd]) : null, utr_number: cu ? r[cu] || null : null,
      status: cs ? r[cs] || "settled" : "settled",
    })).filter((x) => x.gokwik_order_id);
  }
  // ccavenue
  const cc = findCol(h, ["crfid", "crf", "settlementreference"])!;
  const ca = findCol(h, ["bankamount", "remittedamount", "netamount", "amount"])!;
  const cd = findCol(h, ["remittancedate", "settlementdate", "date"]);
  const cu = findCol(h, ["utr", "bankreference"]);
  const cn = findCol(h, ["ordercount", "transactioncount"]);
  return rows.map((r) => ({
    crf_id: r[cc], bank_amount_inr: num(r[ca]),
    settlement_date: cd ? toDate(r[cd]) : null, utr_number: cu ? r[cu] || null : null,
    order_count: cn ? Math.round(num(r[cn])) : 0,
  })).filter((x) => x.crf_id);
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const secret = Deno.env.get("INBOUND_WEBHOOK_SECRET");
  if (secret && req.headers.get("x-webhook-secret") !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: InboundPayload;
  try { payload = await req.json(); } catch { return new Response("Bad JSON", { status: 400 }); }
  if (!payload.message_id) return new Response("Missing message_id", { status: 400 });

  const companyId = payload.company_id ?? 1;
  const from = payload.from ?? "";
  const subject = payload.subject ?? "";

  // Idempotency: one email_imports row per (company, message_id)
  const { data: emailRow, error: emailErr } = await db.from("email_imports").insert({
    company_id: companyId, email_message_id: payload.message_id, sender: from, subject,
    received_at: new Date().toISOString(), status: "processing",
    attachment_count: payload.attachments?.length ?? 0,
  }).select("id").single();

  if (emailErr) {
    // Unique violation → already processed; idempotent no-op
    if (emailErr.code === "23505") return new Response(JSON.stringify({ ok: true, status: "duplicate_email" }), { status: 200 });
    return new Response(JSON.stringify({ ok: false, error: emailErr.message }), { status: 500 });
  }
  const emailImportId = emailRow!.id as number;
  const summary: unknown[] = [];

  for (const att of payload.attachments ?? []) {
    try {
      const bytes = Uint8Array.from(atob(att.content_base64), (c) => c.charCodeAt(0));
      const hash = await sha256(bytes);
      const rows = parseRows(bytes);
      const headers = rows[0] ? Object.keys(rows[0]) : [];
      const source = detectSource(from, subject, att.filename, headers);

      const { data: attRow, error: attErr } = await db.from("email_attachments").insert({
        email_import_id: emailImportId, company_id: companyId, filename: att.filename,
        content_type: att.content_type ?? null, size_bytes: bytes.length, content_hash: hash,
        detected_source: source, status: "pending",
      }).select("id").single();
      if (attErr) {
        if (attErr.code === "23505") { summary.push({ filename: att.filename, status: "duplicate_attachment" }); continue; }
        throw new Error(attErr.message);
      }
      const attId = attRow!.id as number;

      if (!source) {
        await db.from("email_attachments").update({ status: "skipped" }).eq("id", attId);
        summary.push({ filename: att.filename, status: "unidentified_source" });
        continue;
      }

      const records = transform(source, rows);
      const { data: imp } = await db.from("settlement_imports").insert({
        gateway: source, company_id: companyId, file_name: att.filename, file_size_bytes: bytes.length,
        source: "email", email_from: from, email_subject: subject, status: "processing", row_count: rows.length,
      }).select("id").single();
      const importId = imp!.id as number;

      const rpc = source === "gokwik" ? "import_gokwik_settlements" : "import_ccavenue_settlements";
      const { data: res, error: impErr } = await db.rpc(rpc, { p_import_id: importId, p_rows: records, p_company_id: companyId });
      if (impErr) throw new Error(impErr.message);
      const r = (res ?? {}) as { imported?: number; duplicates?: number; failed?: number };

      await db.from("import_batches").insert({
        company_id: companyId, source, origin: "email", email_attachment_id: attId, settlement_import_id: importId,
        status: "completed", records_imported: r.imported ?? 0, records_duplicate: r.duplicates ?? 0,
        records_failed: r.failed ?? 0, completed_at: new Date().toISOString(),
      });
      await db.from("email_attachments").update({ status: "imported" }).eq("id", attId);
      summary.push({ filename: att.filename, source, ...r });
    } catch (e) {
      summary.push({ filename: att.filename, status: "failed", error: e instanceof Error ? e.message : String(e) });
    }
  }

  await db.from("email_imports").update({
    status: "processed", processed_at: new Date().toISOString(),
    detected_source: (summary.find((s) => (s as { source?: string }).source) as { source?: string } | undefined)?.source ?? null,
  }).eq("id", emailImportId);

  return new Response(JSON.stringify({ ok: true, email_import_id: emailImportId, attachments: summary }), {
    headers: { "Content-Type": "application/json" },
  });
});
