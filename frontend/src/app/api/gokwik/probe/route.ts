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

async function probeEndpoint(
  url:   string,
  label: string,
  creds: { merchant_id: string; api_key: string; api_secret: string },
): Promise<ProbeResult> {
  const today = new Date().toISOString().slice(0, 10);
  const params = new URLSearchParams({
    sortKey: "created_at", sortOrder: "-1",
    start_dt: today, end_dt: today,
    mode: "live", page: "1", pageSize: "1",
  });
  const fullUrl = `${url}?${params}`;
  try {
    const res = await fetch(fullUrl, {
      method: "GET",
      headers: {
        Authorization:    `Bearer ${creds.api_key}`,
        "X-Merchant-Id":  creds.merchant_id,
        "X-App-Secret":   creds.api_secret,
      },
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.text();
    return { label, url: fullUrl, status: res.status, body: body.slice(0, 500), ok: res.ok, error: null };
  } catch (e) {
    return { label, url: fullUrl, status: null, body: null, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
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

  return NextResponse.json({
    probe_timestamp: probeTimestamp,
    credentials: {
      loaded:               !!creds,
      merchant_id_present:  !!creds?.merchant_id,
      api_key_present:       !!creds?.api_key,
      api_secret_present:   !!creds?.api_secret,
      error:                credError,
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
