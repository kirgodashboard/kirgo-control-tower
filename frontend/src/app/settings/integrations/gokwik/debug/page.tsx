"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, AlertCircle, CheckCircle2, XCircle, Clock } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import Link from "next/link";

interface ProbeResult {
  probe_timestamp: string;
  config: {
    base_url: string;
    endpoint_url: string;
    method: string;
    auth_method: string;
    auth_note: string;
  };
  credentials: {
    loaded: boolean;
    merchant_id_present: boolean;
    api_key_present: boolean;
    error: string | null;
  };
  probe: {
    status_code: number | null;
    response_body: string | null;
    error: string | null;
  };
  last_sync_run: {
    id: number;
    started_at: string;
    completed_at: string;
    status: string;
    error_summary: string;
  } | null;
}

function StatusChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${
      ok ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
    }`}>
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {label}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-4 py-3 border-b border-border last:border-0">
      <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground pt-0.5">{label}</span>
      <div className="text-sm font-mono break-all">{children}</div>
    </div>
  );
}

function HttpStatusBadge({ code }: { code: number | null }) {
  if (code === null) return <span className="text-muted-foreground">—</span>;
  const color = code < 300 ? "text-emerald-500" : code < 500 ? "text-amber-500" : "text-red-500";
  return <span className={`font-bold ${color}`}>{code}</span>;
}

export default function GoKwikDebugPage() {
  const [data, setData] = useState<ProbeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const runProbe = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/gokwik/probe");
      if (!res.ok) throw new Error(`Probe API returned ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { runProbe(); }, [runProbe]);

  const fmtTs = (ts: string) =>
    new Date(ts).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });

  return (
    <div className="space-y-6 p-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <PageHeader
          title="GoKwik — API Diagnostics"
          subtitle="Read-only probe. Does not trigger a sync or create sync_run records."
        />
        <div className="flex items-center gap-3">
          <Link
            href="/settings/integrations"
            className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Integrations
          </Link>
          <button
            onClick={runProbe}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/40 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Re-probe
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4">
          <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-500">{error}</p>
        </div>
      )}

      {loading && !data && (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Probing GoKwik API…
        </div>
      )}

      {data && (
        <div className="space-y-4">
          {/* Config */}
          <section className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-5 py-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Endpoint Configuration</h2>
            </div>
            <div className="px-5">
              <Row label="Base URL">
                <span className="text-foreground">{data.config.base_url}</span>
              </Row>
              <Row label="Orders Endpoint">
                <span className="text-foreground">
                  <span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{data.config.method}</span>
                  {data.config.endpoint_url}
                </span>
              </Row>
              <Row label="Auth Method">
                <span className="text-foreground">{data.config.auth_method}</span>
              </Row>
              <Row label="Auth Note">
                <span className="text-muted-foreground">{data.config.auth_note}</span>
              </Row>
            </div>
          </section>

          {/* Credentials */}
          <section className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-5 py-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Vault Credentials</h2>
            </div>
            <div className="px-5">
              <Row label="Loaded from Vault">
                <StatusChip ok={data.credentials.loaded} label={data.credentials.loaded ? "Yes" : "No"} />
              </Row>
              <Row label="merchant_id">
                <StatusChip ok={data.credentials.merchant_id_present} label={data.credentials.merchant_id_present ? "Present" : "Missing"} />
              </Row>
              <Row label="api_key">
                <StatusChip ok={data.credentials.api_key_present} label={data.credentials.api_key_present ? "Present" : "Missing"} />
              </Row>
              {data.credentials.error && (
                <Row label="Vault Error">
                  <span className="text-red-500">{data.credentials.error}</span>
                </Row>
              )}
            </div>
          </section>

          {/* Live Probe Result */}
          <section className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-5 py-3 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Live Probe Result</h2>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {fmtTs(data.probe_timestamp)} IST
              </span>
            </div>
            <div className="px-5">
              <Row label="HTTP Status">
                <HttpStatusBadge code={data.probe.status_code} />
              </Row>
              <Row label="Auth Succeeded">
                {data.probe.status_code === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : data.probe.status_code === 401 || data.probe.status_code === 403 ? (
                  <StatusChip ok={false} label="No — auth rejected" />
                ) : data.probe.status_code === 404 ? (
                  <StatusChip ok={true} label="Yes — wrong endpoint, auth passed" />
                ) : data.probe.status_code < 300 ? (
                  <StatusChip ok={true} label="Yes" />
                ) : (
                  <StatusChip ok={false} label="Unknown" />
                )}
              </Row>
              {data.probe.error && (
                <Row label="Network Error">
                  <span className="text-red-500">{data.probe.error}</span>
                </Row>
              )}
              <Row label="Response Body">
                {data.probe.response_body ? (
                  <pre className="max-h-64 overflow-auto rounded-lg bg-muted p-3 text-xs text-foreground whitespace-pre-wrap">
                    {(() => {
                      try {
                        return JSON.stringify(JSON.parse(data.probe.response_body), null, 2);
                      } catch {
                        return data.probe.response_body;
                      }
                    })()}
                  </pre>
                ) : (
                  <span className="text-muted-foreground">No body captured</span>
                )}
              </Row>
            </div>
          </section>

          {/* Last Sync Run */}
          <section className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-5 py-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Last Sync Run (Historical)</h2>
            </div>
            <div className="px-5">
              {data.last_sync_run ? (
                <>
                  <Row label="Run ID">#{data.last_sync_run.id}</Row>
                  <Row label="Started At">
                    <span>{fmtTs(data.last_sync_run.started_at)} IST</span>
                  </Row>
                  <Row label="Completed At">
                    <span>{data.last_sync_run.completed_at ? fmtTs(data.last_sync_run.completed_at) + " IST" : "—"}</span>
                  </Row>
                  <Row label="Status">
                    <StatusChip ok={data.last_sync_run.status === "success"} label={data.last_sync_run.status} />
                  </Row>
                  <Row label="Error Summary">
                    <span className="text-red-500">{data.last_sync_run.error_summary ?? "—"}</span>
                  </Row>
                </>
              ) : (
                <div className="py-4 text-sm text-muted-foreground">No sync runs found for GoKwik.</div>
              )}
            </div>
          </section>

          {/* Finding Summary */}
          <section className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5 space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-amber-500">Diagnosis</h2>
            <ul className="space-y-1.5 text-sm text-foreground">
              <li>• <strong>Auth:</strong> No separate login/auth endpoint — GoKwik uses stateless Bearer API key. Auth status is inferred from HTTP response code.</li>
              <li>• <strong>404 cause:</strong> The endpoint <code className="rounded bg-muted px-1 py-0.5 text-xs">POST /v1/merchant/orders</code> does not exist at <code className="rounded bg-muted px-1 py-0.5 text-xs">api.gokwik.co</code>. A 404 after credentials load means auth passed but the URL is wrong.</li>
              <li>• <strong>Action required:</strong> Confirm the correct orders endpoint from GoKwik dashboard or API docs before re-enabling sync.</li>
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
