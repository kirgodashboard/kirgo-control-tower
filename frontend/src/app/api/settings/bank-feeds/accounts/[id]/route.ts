export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { makeSupabaseAdmin } from "@/lib/supabase/server";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const id = parseInt(params.id, 10);
  if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const db = makeSupabaseAdmin();

  // Toggle active/inactive
  if ("is_active" in body) {
    const { data, error } = await db.rpc("toggle_bank_account", {
      p_id:         id,
      p_is_active:  body.is_active,
      p_company_id: 1,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: data });
  }

  // Full update
  const { bank_name, account_name, account_number_masked, currency, opening_balance_inr, notes } = body;
  const { data, error } = await db.rpc("upsert_bank_account", {
    p_bank_name:             bank_name,
    p_account_name:          account_name,
    p_account_number_masked: account_number_masked ?? null,
    p_currency:              currency ?? "INR",
    p_opening_balance_inr:   opening_balance_inr ?? 0,
    p_notes:                 notes ?? null,
    p_company_id:            1,
    p_id:                    id,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data });
}
