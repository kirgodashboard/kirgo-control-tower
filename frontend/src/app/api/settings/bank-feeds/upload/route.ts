// POST /api/settings/bank-feeds/upload
// Accepts multipart/form-data: file + bank_account_id
// Parses CSV or XLSX, auto-detects column mapping, stores raw_rows, returns preview.

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { makeSupabaseAdmin } from "@/lib/supabase/server";
import * as XLSX from "xlsx";
import type { ColumnMapping } from "@/types/bank";

const DATE_KEYS      = ["date", "dt", "txndate", "valuedate", "postingdate", "transactiondate"];
const NARRATION_KEYS = ["narration", "description", "particulars", "remarks", "details", "reference",
                        "transactionremarks", "narrationraw"];
const DEBIT_KEYS     = ["debit", "withdrawal", "dr", "debitamount", "withdrawalamtinr", "debit(inr)",
                        "withdrawalamt"];
const CREDIT_KEYS    = ["credit", "deposit", "cr", "creditamount", "depositamtinr", "credit(inr)",
                        "depositamt"];
const BALANCE_KEYS   = ["balance", "closingbalance", "runningbalance", "avlbal", "avlbalance",
                        "balance(inr)", "closingbalanceinr"];

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

function detectMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  for (const h of headers) {
    const n = normalize(h);
    if (!mapping.date      && DATE_KEYS.some(k => n.includes(k)))      mapping.date      = h;
    if (!mapping.narration && NARRATION_KEYS.some(k => n.includes(k))) mapping.narration = h;
    if (!mapping.debit     && DEBIT_KEYS.some(k => n.includes(k)))     mapping.debit     = h;
    if (!mapping.credit    && CREDIT_KEYS.some(k => n.includes(k)))    mapping.credit    = h;
    if (!mapping.balance   && BALANCE_KEYS.some(k => n.includes(k)))   mapping.balance   = h;
  }
  return mapping;
}

function parseNum(v: unknown): number {
  if (v == null || v === "") return 0;
  const s = String(v).replace(/,/g, "").trim();
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

export async function POST(req: Request) {
  const formData = await req.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Invalid form data" }, { status: 400 });

  const file           = formData.get("file") as File | null;
  const accountIdRaw   = formData.get("bank_account_id") as string | null;
  const profileIdRaw   = formData.get("profile_id") as string | null;

  if (!file)        return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!accountIdRaw) return NextResponse.json({ error: "bank_account_id required" }, { status: 400 });

  const bankAccountId = parseInt(accountIdRaw, 10);
  const profileId     = profileIdRaw ? parseInt(profileIdRaw, 10) : null;

  // Parse file
  const bytes    = await file.arrayBuffer();
  const workbook = XLSX.read(Buffer.from(bytes), { type: "buffer", cellText: true, cellDates: false });
  const sheet    = workbook.Sheets[workbook.SheetNames[0]];
  const raw      = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" });

  if (raw.length < 2) {
    return NextResponse.json({ error: "File has no data rows" }, { status: 422 });
  }

  // Find the header row (first row with >= 3 non-empty cells)
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(raw.length, 10); i++) {
    const nonEmpty = (raw[i] as string[]).filter(c => String(c).trim() !== "").length;
    if (nonEmpty >= 3) { headerRowIdx = i; break; }
  }

  const headers   = (raw[headerRowIdx] as string[]).map(h => String(h).trim()).filter(Boolean);
  const dataRows  = (raw.slice(headerRowIdx + 1) as string[][])
    .filter(r => r.some(c => String(c).trim() !== ""));

  if (headers.length === 0) {
    return NextResponse.json({ error: "Could not detect header row" }, { status: 422 });
  }

  const detectedMapping = detectMapping(headers);
  const previewRows = dataRows.slice(0, 5).map(r =>
    headers.map((_, i) => String(r[i] ?? "").trim())
  );

  // Store raw_rows in bank_statement_uploads
  const rawRowsForStorage = dataRows.map(r =>
    Object.fromEntries(headers.map((h, i) => [h, String(r[i] ?? "").trim()]))
  );

  const db = makeSupabaseAdmin();
  const { data: uploadData, error: uploadErr } = await db
    .from("bank_statement_uploads")
    .insert({
      bank_account_id: bankAccountId,
      company_id:      1,
      file_name:       file.name,
      file_size_bytes: file.size,
      status:          "pending",
      row_count:       dataRows.length,
      profile_id:      profileId,
      raw_rows:        rawRowsForStorage,
    })
    .select("id")
    .single();

  if (uploadErr || !uploadData) {
    return NextResponse.json({ error: uploadErr?.message ?? "Failed to create upload" }, { status: 500 });
  }

  // If profile_id provided, fetch profile mapping to override detected
  let finalMapping = detectedMapping;
  if (profileId) {
    const { data: profile } = await db
      .from("bank_import_profiles")
      .select("date_column,description_column,debit_column,credit_column,balance_column")
      .eq("id", profileId)
      .single();
    if (profile) {
      finalMapping = {
        date:      profile.date_column,
        narration: profile.description_column,
        debit:     profile.debit_column ?? undefined,
        credit:    profile.credit_column ?? undefined,
        balance:   profile.balance_column ?? undefined,
      };
    }
  }

  return NextResponse.json({
    upload_id:        uploadData.id,
    headers,
    preview_rows:     previewRows,
    detected_mapping: finalMapping,
    total_rows:       dataRows.length,
  });
}
