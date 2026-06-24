// POST /api/settings/integrations/[key]/test
// Reads credentials from Vault, attempts a real connection, updates connection_status.

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { makeSupabaseAdmin } from "@/lib/supabase/server";

const VALID_KEYS = ["woocommerce", "shiprocket", "razorpay", "gokwik", "ccavenue", "bank_feed"];

export async function POST(
  req: Request,
  { params }: { params: { key: string } },
) {
  const integrationKey = params.key;

  if (!VALID_KEYS.includes(integrationKey)) {
    return NextResponse.json({ error: "Invalid integration key" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const companyId: number = body.company_id ?? 1;

  let db: ReturnType<typeof makeSupabaseAdmin>;
  try {
    db = makeSupabaseAdmin();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server configuration error";
    console.error("[test] makeSupabaseAdmin error:", err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }

  // Retrieve credentials from Vault
  const { data: creds, error: credsErr } = await db.rpc("get_integration_secret", {
    p_integration_key: integrationKey,
    p_company_id:      companyId,
  });

  if (credsErr || !creds) {
    await db.rpc("update_integration_status", {
      p_integration_key: integrationKey,
      p_status:          "error",
      p_error:           "No credentials configured. Save credentials first.",
      p_company_id:      companyId,
    });
    return NextResponse.json({ success: false, error: "No credentials configured" }, { status: 422 });
  }

  // Attempt connection based on integration type
  let testError: string | null = null;

  try {
    switch (integrationKey) {
      case "woocommerce": {
        const { store_url, consumer_key, consumer_secret } = creds as Record<string, string>;
        const url = `${store_url?.replace(/\/$/, "")}/wp-json/wc/v3/orders?per_page=1`;
        const token = Buffer.from(`${consumer_key}:${consumer_secret}`).toString("base64");
        const res = await fetch(url, {
          headers: { Authorization: `Basic ${token}` },
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) testError = `WooCommerce API returned ${res.status}`;
        break;
      }

      case "shiprocket": {
        const { email, password } = creds as Record<string, string>;
        const loginRes = await fetch("https://apiv2.shiprocket.in/v1/external/auth/login", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ email, password }),
          signal:  AbortSignal.timeout(10_000),
        });
        const loginJson = await loginRes.json().catch(() => ({}));
        if (!loginRes.ok || !loginJson.token) {
          testError = loginJson.message ?? `Login failed (${loginRes.status}) — check API User credentials`;
        }
        break;
      }

      case "razorpay": {
        const { key_id, key_secret } = creds as Record<string, string>;
        const token = Buffer.from(`${key_id}:${key_secret}`).toString("base64");
        const res = await fetch("https://api.razorpay.com/v1/payments?count=1", {
          headers: { Authorization: `Basic ${token}` },
          signal:  AbortSignal.timeout(10_000),
        });
        if (!res.ok) testError = `Razorpay API returned ${res.status}`;
        break;
      }

      case "gokwik":
      case "ccavenue":
        // Verify credentials are present and non-empty — live API test requires vendor access
        for (const [k, v] of Object.entries(creds as Record<string, string>)) {
          if (!v?.trim()) { testError = `${k} cannot be empty`; break; }
        }
        break;

      case "bank_feed":
        // No API connection to test for statement upload
        break;
    }
  } catch (err: unknown) {
    testError = err instanceof Error ? err.message : "Connection timeout";
  }

  const status = testError ? "error" : "ok";

  await db.rpc("update_integration_status", {
    p_integration_key: integrationKey,
    p_status:          status,
    p_error:           testError,
    p_company_id:      companyId,
  });

  if (testError) {
    return NextResponse.json({ success: false, error: testError }, { status: 200 });
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
