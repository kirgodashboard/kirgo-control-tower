// POST /api/settings/bank-feeds/import
// Reads raw_rows from bank_statement_uploads, applies column mapping, inserts transactions.

import { NextResponse } from "next/server";
import { makeSupabaseAdmin } from "@/lib/supabase/server";
import type { ColumnMapping } from "@/types/bank";

function parseDate(value: string): string | null {
  if (!value) return null;
  const v = value.trim();

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;

  // YYYY-MM-DD
  const ymd = v.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})$/);
  if (ymd) return v.substring(0, 10);

  // DD MMM YYYY  e.g. "01 Jan 2024"
  const months: Record<string, string> = {
    jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",
    jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12",
  };
  const dMonY = v.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (dMonY) {
    const m = months[dMonY[2].toLowerCase()];
    if (m) return `${dMonY[3]}-${m}-${dMonY[1].padStart(2,"0")}`;
  }

  return null;
}

function parseNum(value: string): number {
  if (!value) return 0;
  const n = parseFloat(String(value).replace(/,/g, "").trim());
  return isNaN(n) ? 0 : Math.abs(n);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const {
    upload_id,
    column_mapping,
    save_profile,
    profile_name,
  }: {
    upload_id:      number;
    column_mapping: ColumnMapping;
    save_profile?:  boolean;
    profile_name?:  string;
  } = body;

  if (!upload_id || !column_mapping) {
    return NextResponse.json({ error: "upload_id and column_mapping required" }, { status: 400 });
  }
  if (!column_mapping.date || !column_mapping.narration) {
    return NextResponse.json({ error: "date and narration columns must be mapped" }, { status: 400 });
  }

  const db = makeSupabaseAdmin();

  // Fetch the upload record
  const { data: upload, error: uploadErr } = await db
    .from("bank_statement_uploads")
    .select("id, bank_account_id, raw_rows, profile_id")
    .eq("id", upload_id)
    .single();

  if (uploadErr || !upload) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }
  if (!upload.raw_rows || !Array.isArray(upload.raw_rows)) {
    return NextResponse.json({ error: "No raw data found for this upload" }, { status: 422 });
  }

  // Normalise rows
  const transactions = (upload.raw_rows as Record<string, string>[])
    .map(row => {
      const dateVal = row[column_mapping.date!] ?? "";
      const date    = parseDate(dateVal);
      if (!date) return null;

      const narration = (row[column_mapping.narration!] ?? "").trim();
      if (!narration) return null;

      let debit  = 0;
      let credit = 0;

      if (column_mapping.debit)  debit  = parseNum(row[column_mapping.debit]  ?? "");
      if (column_mapping.credit) credit = parseNum(row[column_mapping.credit] ?? "");

      const balance = column_mapping.balance
        ? parseNum(row[column_mapping.balance] ?? "") || undefined
        : undefined;

      return { date, narration, debit, credit, balance: balance ?? null };
    })
    .filter(Boolean);

  if (transactions.length === 0) {
    return NextResponse.json({ error: "No valid rows found after mapping" }, { status: 422 });
  }

  // Optionally save import profile
  let profileId = upload.profile_id;
  if (save_profile && profile_name?.trim()) {
    const { data: prof } = await db
      .from("bank_import_profiles")
      .insert({
        bank_account_id:    upload.bank_account_id,
        company_id:         1,
        profile_name:       profile_name.trim(),
        date_column:        column_mapping.date!,
        description_column: column_mapping.narration!,
        debit_column:       column_mapping.debit  ?? null,
        credit_column:      column_mapping.credit ?? null,
        balance_column:     column_mapping.balance ?? null,
      })
      .select("id")
      .single();
    if (prof) profileId = prof.id;
  }

  if (profileId && profileId !== upload.profile_id) {
    await db.from("bank_statement_uploads").update({ profile_id: profileId }).eq("id", upload_id);
  }

  // Run bulk import via RPC
  const { data: result, error: importErr } = await db.rpc("import_bank_transactions", {
    p_account_id:   upload.bank_account_id,
    p_upload_id:    upload_id,
    p_transactions: transactions,
    p_company_id:   1,
  });

  if (importErr) {
    await db.from("bank_statement_uploads").update({ status: "failed", error_summary: importErr.message }).eq("id", upload_id);
    return NextResponse.json({ error: importErr.message }, { status: 500 });
  }

  return NextResponse.json(result, { status: 200 });
}
