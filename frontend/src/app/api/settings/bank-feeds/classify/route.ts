// POST /api/settings/bank-feeds/classify
// Applies bank_classification_rules to unclassified transactions.

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { makeSupabaseAdmin } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const accountId: number | null = body.account_id ?? null;

  const db = makeSupabaseAdmin();
  const { data, error } = await db.rpc("apply_bank_classification_rules", {
    p_account_id: accountId,
    p_company_id: 1,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? { classified: 0, skipped: 0 });
}
