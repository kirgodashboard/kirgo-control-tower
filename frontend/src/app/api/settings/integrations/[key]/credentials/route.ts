// POST /api/settings/integrations/[key]/credentials
// Stores integration credentials in Supabase Vault via the store_integration_secret RPC.
// Credentials are encrypted at rest — this route never logs or returns them.

import { NextResponse } from "next/server";
import { makeSupabaseAdmin } from "@/lib/supabase/server";

const VALID_KEYS = ["woocommerce", "shiprocket", "razorpay", "gokwik", "ccavenue", "bank_feed"] as const;

export async function POST(
  req: Request,
  { params }: { params: { key: string } },
) {
  try {
    const integrationKey = params.key;

    if (!(VALID_KEYS as readonly string[]).includes(integrationKey)) {
      return NextResponse.json({ error: "Invalid integration key" }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body.credentials !== "object" || body.credentials === null) {
      return NextResponse.json({ error: "credentials object required" }, { status: 400 });
    }

    const companyId: number = body.company_id ?? 1;
    const credentials: Record<string, string> = body.credentials;

    const db = makeSupabaseAdmin();

    const { data, error } = await db.rpc("store_integration_secret", {
      p_integration_key:    integrationKey,
      p_credentials_json:   credentials,
      p_company_id:         companyId,
    });

    if (error) {
      console.error("[credentials] store_integration_secret error:", error);
      return NextResponse.json({ error: "Failed to store credentials: " + error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, secret_ref: data }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[credentials] Unhandled error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
