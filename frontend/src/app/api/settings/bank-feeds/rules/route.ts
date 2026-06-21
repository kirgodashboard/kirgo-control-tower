import { NextResponse } from "next/server";
import { makeSupabaseAdmin } from "@/lib/supabase/server";

export async function GET() {
  const db = makeSupabaseAdmin();
  const { data, error } = await db.rpc("get_bank_classification_rules", { p_company_id: 1 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { pattern, expense_head, category_id, priority, id } = body;

  if (!pattern || !expense_head) {
    return NextResponse.json({ error: "pattern and expense_head required" }, { status: 400 });
  }

  const db = makeSupabaseAdmin();
  const { data, error } = await db.rpc("upsert_bank_classification_rule", {
    p_pattern:      pattern,
    p_expense_head: expense_head,
    p_category_id:  category_id ?? null,
    p_priority:     priority ?? 100,
    p_company_id:   1,
    p_id:           id ?? null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data }, { status: id ? 200 : 201 });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = parseInt(searchParams.get("id") ?? "", 10);
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const db = makeSupabaseAdmin();
  const { error } = await db
    .from("bank_classification_rules")
    .update({ is_active: false })
    .eq("id", id)
    .eq("company_id", 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
