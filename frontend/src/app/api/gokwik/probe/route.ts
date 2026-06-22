// GET /api/gokwik/probe
// Diagnostic endpoint — loads GoKwik credentials from Vault, makes one test
// POST to the orders endpoint, and returns full debug info (status + body).
// Does NOT create a sync_run. Read-only diagnostic only.

import { NextResponse } from "next/server";
import { makeSupabaseAdmin } from "@/lib/supabase/server";

const GK_BASE = "https://api.gokwik.co/v1";
const ENDPOINT_URL = `${GK_BASE}/merchant/orders`;

export async function GET() {
  const db = makeSupabaseAdmin();
  const probeTimestamp = new Date().toISOString();

  // 1 — pull credentials from Vault
  let creds: { merchant_id: string; app_id: string; app_secret: string } | null = null;
  let credError: string | null = null;
  try {
    const { data, error } = await db.rpc("get_integration_secret", {
      p_integration_key: "gokwik",
      p_company_id: 1,
    });
    if (error || !data) credError = error?.message ?? "No credentials found in Vault for gokwik";
    else creds = data as { merchant_id: string; app_id: string; app_secret: string };
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

  // 3 — live HTTP probe (only if credentials are available)
  let probeStatus: number | null = null;
  let probeBody: string | null = null;
  let probeError: string | null = null;

  if (creds) {
    const today = new Date().toISOString().slice(0, 10);
    try {
      const res = await fetch(ENDPOINT_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.app_id}`,
          "Content-Type": "application/json",
          "X-Merchant-Id": creds.merchant_id,
          "X-App-Secret": creds.app_secret,
        },
        body: JSON.stringify({ from_date: today, to_date: today, page: 1, limit: 1 }),
      });
      probeStatus = res.status;
      probeBody = await res.text();
    } catch (e) {
      probeError = e instanceof Error ? e.message : String(e);
    }
  }

  return NextResponse.json({
    probe_timestamp: probeTimestamp,
    config: {
      base_url: GK_BASE,
      endpoint_url: ENDPOINT_URL,
      method: "POST",
      auth_method: "Bearer <api_key> + X-Merchant-Id header",
      auth_note: "GoKwik uses stateless API key auth — no separate /auth or /login endpoint. A 404 means the URL is wrong but auth passed.",
    },
    credentials: {
      loaded: !!creds,
      merchant_id_present: !!creds?.merchant_id,
      app_id_present: !!creds?.app_id,
      app_secret_present: !!creds?.app_secret,
      error: credError,
    },
    probe: {
      status_code: probeStatus,
      response_body: probeBody,
      error: probeError,
    },
    last_sync_run: lastRun ?? null,
  });
}
