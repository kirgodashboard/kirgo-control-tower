// GET /api/gokwik/probe
// Diagnostic endpoint — loads GoKwik credentials from Vault, probes multiple
// endpoint variants, and returns full debug info. Read-only diagnostic only.

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { makeSupabaseAdmin } from "@/lib/supabase/server";

const ENDPOINTS_TO_TRY = [
  { label: "v3 dashboard (current)",     url: "https://api.gokwik.co/v3/api/dashboard/orders/all" },
  { label: "v1 merchant orders",         url: "https://api.gokwik.co/v1/merchant/orders" },
  { label: "v2 merchant orders",         url: "https://api.gokwik.co/v2/merchant/orders" },
  { label: "v3 merchant orders",         url: "https://api.gokwik.co/v3/merchant/orders" },
  { label: "v3 api orders",              url: "https://api.gokwik.co/v3/api/orders" },
  { label: "v3 dashboard orders (no /all)", url: "https://api.gokwik.co/v3/api/dashboard/orders" },
];

interface ProbeResult {
  label:    string;
  url:      string;
  status:   number | null;
  body:     string | null;
  ok:       boolean;
  error:    string | null;
}

type Creds = { merchant_id: string; api_key: string; api_secret: string };

// Multiple auth-header schemes to test empirically. GoKwik docs indicate
// appid/appsecret are passed as direct headers (not Authorization: Bearer).
function authSchemes(creds: Creds): Array<{ label: string; headers: Record<string, string> }> {
  return [
    { label: "Bearer + X-App-Secret (current)", headers: {
      Authorization: `Bearer ${creds.api_key}`, "X-Merchant-Id": creds.merchant_id, "X-App-Secret": creds.api_secret } },
    { label: "appid/appsecret headers (GoKwik docs)", headers: {
      appid: creds.api_key, appsecret: creds.api_secret, "merchant-id": creds.merchant_id } },
    { label: "app-id/app-secret headers", headers: {
      "app-id": creds.api_key, "app-secret": creds.api_secret, "merchant-id": creds.merchant_id } },
    { label: "x-app-id/x-app-secret headers", headers: {
      "x-app-id": creds.api_key, "x-app-secret": creds.api_secret, "x-merchant-id": creds.merchant_id } },
    { label: "KP-MERCHANT-ID + appid/appsecret", headers: {
      appid: creds.api_key, appsecret: creds.api_secret, "KP-MERCHANT-ID": creds.merchant_id } },
  ];
}

async function probeEndpoint(
  url:   string,
  label: string,
  creds: Creds,
): Promise<ProbeResult> {
  const today = new Date().toISOString().slice(0, 10);
  const params = new URLSearchParams({
    sortKey: "created_at", sortOrder: "-1",
    start_dt: today, end_dt: today,
    mode: "live", page: "1", pageSize: "1",
  });
  const fullUrl = `${url}?${params}`;

  // Try each auth scheme; return the first non-401/403 (or the last attempt's detail)
  const schemes = authSchemes(creds);
  const attempts: Array<{ scheme: string; status: number | null; snippet: string | null }> = [];
  let best: ProbeResult | null = null;

  for (const { label: schemeLabel, headers } of schemes) {
    try {
      const res = await fetch(fullUrl, { method: "GET", headers, signal: AbortSignal.timeout(10_000) });
      const body = await res.text();
      attempts.push({ scheme: schemeLabel, status: res.status, snippet: body.slice(0, 120) });
      const result: ProbeResult = {
        label: `${label} [${schemeLabel}]`, url: fullUrl,
        status: res.status, body: body.slice(0, 300), ok: res.ok, error: null,
      };
      if (res.ok) return result;             // success — stop immediately
      if (res.status !== 401 && res.status !== 403 && !best) best = result; // non-auth error is informative
    } catch (e) {
      attempts.push({ scheme: schemeLabel, status: null, snippet: e instanceof Error ? e.message : String(e) });
    }
  }

  // No scheme succeeded — report all attempts in the body for diagnosis
  return best ?? {
    label, url: fullUrl, status: 401, ok: false, error: "All auth schemes failed",
    body: JSON.stringify(attempts),
  };
}

// Test token-exchange login flow: POST appid/appsecret to candidate auth
// endpoints; a 2xx with a token field confirms GoKwik needs JWT auth.
const AUTH_ENDPOINTS = [
  "https://api.gokwik.co/v3/api/auth/login",
  "https://api.gokwik.co/v3/api/dashboard/auth/login",
  "https://api.gokwik.co/v3/api/login",
  "https://api.gokwik.co/v1/auth/login",
  "https://api.gokwik.co/v3/api/dashboard/login",
];

async function probeAuthExchange(creds: Creds): Promise<Array<Record<string, unknown>>> {
  const bodies = [
    { app_id: creds.api_key, app_secret: creds.api_secret, merchant_id: creds.merchant_id },
    { appid: creds.api_key, appsecret: creds.api_secret, merchant_id: creds.merchant_id },
    { api_key: creds.api_key, api_secret: creds.api_secret, merchant_id: creds.merchant_id },
  ];
  const results: Array<Record<string, unknown>> = [];
  for (const url of AUTH_ENDPOINTS) {
    for (const body of bodies) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(8_000),
        });
        const text = await res.text();
        results.push({ url, bodyKeys: Object.keys(body).join(","), status: res.status, snippet: text.slice(0, 150) });
        if (res.ok) return results; // found a working login
      } catch (e) {
        results.push({ url, status: null, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }
  return results;
}

export async function GET() {
  const db = makeSupabaseAdmin();
  const probeTimestamp = new Date().toISOString();

  // 1 — pull credentials from Vault
  let creds: { merchant_id: string; api_key: string; api_secret: string } | null = null;
  let credError: string | null = null;
  try {
    const { data, error } = await db.rpc("get_integration_secret", {
      p_integration_key: "gokwik",
      p_company_id: 1,
    });
    if (error || !data) credError = error?.message ?? "No credentials found in Vault for gokwik";
    else creds = data as { merchant_id: string; api_key: string; api_secret: string };
  } catch (e) {
    credError = e instanceof Error ? e.message : String(e);
  }

  // 2 — last sync run for gokwik
  const { data: gkJob } = await db
    .from("sync_jobs")
    .select("id")
    .eq("integration_key", "gokwik")
    .single();

  const { data: lastRun } = gkJob
    ? await db
        .from("sync_runs")
        .select("id, started_at, completed_at, status, error_summary")
        .eq("sync_job_id", gkJob.id)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  // 3 — probe all endpoint variants (only if credentials are available)
  let endpointResults: ProbeResult[] = [];
  if (creds) {
    endpointResults = await Promise.all(
      ENDPOINTS_TO_TRY.map(({ label, url }) => probeEndpoint(url, label, creds!))
    );
  }

  const working = endpointResults.filter(r => r.ok);
  const recommendation = working.length > 0
    ? `Working endpoint found: ${working[0].url}`
    : "No endpoint returned 2xx. Check merchant_id or contact GoKwik support.";

  // 4 — probe token-exchange login flow
  const authResults = creds ? await probeAuthExchange(creds) : [];
  const authWorking = authResults.find(r => typeof r.status === "number" && (r.status as number) >= 200 && (r.status as number) < 300);

  return NextResponse.json({
    probe_timestamp: probeTimestamp,
    credentials: {
      loaded:               !!creds,
      merchant_id_present:  !!creds?.merchant_id,
      api_key_present:       !!creds?.api_key,
      api_secret_present:   !!creds?.api_secret,
      error:                credError,
    },
    auth_exchange: {
      working_login: authWorking ?? null,
      attempts:      authResults,
    },
    endpoint_probe: {
      tested:         endpointResults.length,
      working_count:  working.length,
      recommendation,
      results:        endpointResults,
    },
    last_sync_run: lastRun ?? null,
  });
}
