// Supabase Edge Function: sync-bank-feed
// Ingests HDFC bank transactions from one of two sources:
//
//   Mode A — Account Aggregator (AA) framework [recommended for production]
//     Uses RBI's AA framework via a Sahamati-certified Financial Information Provider (FIP).
//     Providers: Finvu, Onemoney, CAMS Finserv.
//     Flow: Consent → Data Request → Encrypted payload → Decrypt → Parse → Upsert.
//
//   Mode B — Statement upload [current fallback]
//     Manual HDFC CSV/XLS upload to Supabase Storage.
//     This edge function is invoked after upload to parse and ingest.
//
// Writes to: bank_transactions (existing table — upsert on dedup key).
// Idempotent: skips exact duplicate rows (same date + narration + amount + balance).

import {
  makeSupabaseAdmin,
  completeSyncRun,
  advanceWatermark,
  recordSyncError,
  resolveRunStatus,
  type SyncJob,
  type RunCounters,
} from "../_shared/sync-base.ts";

// ─── HDFC CSV row shape (from bank export) ───────────────────────────────────

interface HdfcRow {
  date:            string;   // "20/06/2026"
  narration:       string;
  ref_number:      string;
  value_date:      string;
  withdrawal_amt:  string;   // debit, may be empty
  deposit_amt:     string;   // credit, may be empty
  closing_balance: string;
}

// ─── Parse HDFC CSV format ───────────────────────────────────────────────────

function parseDate(s: string): string {
  // HDFC format: "20/06/2026" → "2026-06-20"
  const [d, m, y] = s.trim().split("/");
  return `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
}

function parseAmount(s: string): number | null {
  const n = parseFloat(s.replace(/,/g, "").trim());
  return isNaN(n) ? null : n;
}

function parseHdfcCsv(csv: string): HdfcRow[] {
  const lines  = csv.split("\n").map((l) => l.trim()).filter(Boolean);
  const rows: HdfcRow[] = [];

  // HDFC CSV has a header preamble + column header row
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes("narration") &&
        lines[i].toLowerCase().includes("withdrawal")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return rows;

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < 7) continue;
    rows.push({
      date:            cols[0].trim(),
      narration:       cols[1].trim(),
      ref_number:      cols[2].trim(),
      value_date:      cols[3].trim(),
      withdrawal_amt:  cols[4].trim(),
      deposit_amt:     cols[5].trim(),
      closing_balance: cols[6].trim(),
    });
  }
  return rows;
}

// ─── Classify transaction type from narration ────────────────────────────────
// Mirrors the logic in the existing bank statement importer (read-only copy).

function classifyTransactionType(narration: string): string {
  const n = narration.toUpperCase();
  if (n.includes("SHIPROCKET") || n.includes("CRF"))            return "cod_remittance";
  if (n.includes("RAZORPAY"))                                    return "gateway_settlement";
  if (n.includes("BIGFOOT") || n.includes("GOKWIK"))            return "gateway_settlement";
  if (n.includes("INFIBEAM") || n.includes("EASEBUZZ"))         return "gateway_settlement";
  if (n.includes("NEFT") && n.includes("SALARY"))               return "salary";
  if (n.includes("GST") || n.includes("TAX"))                   return "tax";
  if (n.includes("UPI/") || n.startsWith("UPI-"))               return "unclassified";
  if (n.includes("IMPS") || n.includes("NEFT"))                 return "unclassified";
  return "unclassified";
}

function extractCounterparty(narration: string): string | null {
  const match = narration.match(/(?:UPI-|NEFT CR-[A-Z0-9]+-)([\w\s]+?)(?:-|$)/i);
  return match ? match[1].trim() : null;
}

// ─── Mode B: parse uploaded CSV from Supabase Storage ────────────────────────

async function ingestFromStorage(
  db:    ReturnType<typeof makeSupabaseAdmin>,
  job:   SyncJob,
  runId: number,
  filePath: string,
): Promise<{ counters: RunCounters; watermarkTo: string }> {
  const counters: RunCounters = {
    records_fetched: 0, records_inserted: 0,
    records_updated: 0, records_skipped: 0, records_failed: 0,
  };

  const { data: fileData, error: fileErr } = await db
    .storage.from("bank-statements").download(filePath);
  if (fileErr || !fileData) throw new Error(`Cannot download ${filePath}: ${fileErr?.message}`);

  const csv  = await fileData.text();
  const rows = parseHdfcCsv(csv);
  counters.records_fetched = rows.length;
  let watermarkTo = (job.config.full_pull_from as string) ?? "2023-01-01";

  for (const row of rows) {
    try {
      const txDate       = parseDate(row.date);
      const withdrawal   = parseAmount(row.withdrawal_amt);
      const deposit      = parseAmount(row.deposit_amt);
      const balance      = parseAmount(row.closing_balance);
      const txType       = classifyTransactionType(row.narration);
      const counterparty = extractCounterparty(row.narration);

      // Dedup: identical (date + narration + withdrawal + deposit) rows are duplicates
      const { data: existing } = await db
        .from("bank_transactions")
        .select("id")
        .eq("transaction_date",  txDate)
        .eq("narration_raw",     row.narration)
        .eq("withdrawal_inr",    withdrawal ?? 0)
        .eq("deposit_inr",       deposit    ?? 0)
        .maybeSingle();

      if (existing) {
        counters.records_skipped++;
        continue;
      }

      const { error } = await db.from("bank_transactions").insert({
        transaction_date:    txDate,
        value_date:          parseDate(row.value_date),
        narration_raw:       row.narration,
        reference_number:    row.ref_number || null,
        withdrawal_inr:      withdrawal,
        deposit_inr:         deposit,
        closing_balance_inr: balance,
        transaction_type:    txType,
        counterparty,
      });

      if (error) throw error;
      counters.records_inserted++;
      if (txDate > watermarkTo) watermarkTo = txDate;
    } catch (err) {
      counters.records_failed++;
      await recordSyncError(db, runId, job.integration_key, job.entity_type,
        row.ref_number || null, "MAPPING_ERROR",
        err instanceof Error ? err.message : String(err), row);
    }
  }

  return { counters, watermarkTo };
}

// ─── Mode A stub: Account Aggregator ─────────────────────────────────────────
// Full AA implementation requires:
//   1. Merchant registration with a Sahamati-certified AA (Finvu / Onemoney)
//   2. Customer consent flow (one-time setup via Kirgo portal)
//   3. Encrypted FI data fetch + JOSE decryption
// This stub is the integration point — replace with AA SDK when ready.

async function ingestFromAccountAggregator(
  _db:    ReturnType<typeof makeSupabaseAdmin>,
  _job:   SyncJob,
  _runId: number,
): Promise<never> {
  throw new Error(
    "Account Aggregator mode not yet configured. " +
    "Complete onboarding with Finvu/Onemoney and set config.aa_mode=true. " +
    "See docs/INTEGRATIONS_ARCHITECTURE.md §Bank Feed for setup steps."
  );
}

// ─── Entry point ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const db   = makeSupabaseAdmin();
  let runId: number | null = null;

  try {
    const body: { run_id: number; job_id: number; file_path?: string } = await req.json();
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

    const aaMode = (job.config.aa_mode as boolean) ?? false;

    let result: { counters: RunCounters; watermarkTo: string };
    if (aaMode) {
      result = await ingestFromAccountAggregator(db, job, runId);
    } else {
      if (!body.file_path) throw new Error("file_path required for statement upload mode");
      result = await ingestFromStorage(db, job, runId, body.file_path);
    }

    const status = resolveRunStatus(result.counters);
    await completeSyncRun(db, runId, status, result.counters, result.watermarkTo, null, {
      mode: aaMode ? "account_aggregator" : "statement_upload",
    });
    if (status !== "failed") await advanceWatermark(db, job.id, result.watermarkTo);

    return new Response(JSON.stringify({ ok: true, status, ...result.counters }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sync-bank-feed]", msg);
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
