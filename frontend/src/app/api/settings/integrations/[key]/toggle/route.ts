// PATCH /api/settings/integrations/[key]/toggle
// Enables or disables an integration.

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { makeSupabaseAdmin } from "@/lib/supabase/server";

const VALID_KEYS = ["woocommerce", "shiprocket", "razorpay", "gokwik", "ccavenue", "bank_feed"];

export async function PATCH(
  req: Request,
  { params }: { params: { key: string } },
) {
  const integrationKey = params.key;

  if (!VALID_KEYS.includes(integrationKey)) {
    return NextResponse.json({ error: "Invalid integration key" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled boolean required" }, { status: 400 });
  }

  const companyId: number = body.company_id ?? 1;

  try {
    const db = makeSupabaseAdmin();

    const { error } = await db.rpc("toggle_integration_enabled", {
      p_integration_key: integrationKey,
      p_is_enabled:      body.enabled,
      p_company_id:      companyId,
    });

    if (error) {
      console.error("[toggle] toggle_integration_enabled error:", error);
      return NextResponse.json({ error: "Failed to update toggle: " + error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, enabled: body.enabled }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[toggle] Unhandled error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
