export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { makeSupabaseAdmin } from "@/lib/supabase/server";

export async function GET() {
  const db = makeSupabaseAdmin();
  const { data, error } = await db.rpc("get_bank_accounts", { p_company_id: 1 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { bank_name, account_name, account_number_masked, currency, opening_balance_inr, notes } = body;

  if (!bank_name || !account_name) {
    return NextResponse.json({ error: "bank_name and account_name are required" }, { status: 400 });
  }

  const db = makeSupabaseAdmin();
  const { data, error } = await db.rpc("upsert_bank_account", {
    p_bank_name:             bank_name,
    p_account_name:          account_name,
    p_account_number_masked: account_number_masked ?? null,
    p_currency:              currency ?? "INR",
    p_opening_balance_inr:   opening_balance_inr ?? 0,
    p_notes:                 notes ?? null,
    p_company_id:            1,
    p_id:                    null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data }, { status: 201 });
}
