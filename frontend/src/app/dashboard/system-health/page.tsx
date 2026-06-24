"use client";

import { PageHeader } from "@/components/ui/page-header";
import { useSystemHealth } from "@/lib/hooks/use-system-health";
import { useDataTrustLatest, useRunDataTrustCheck } from "@/lib/hooks/use-governance";
import { formatINR, formatCount } from "@/lib/utils/format";
import {
  CheckCircle2, XCircle, AlertTriangle, Clock, RefreshCw,
  Loader2, Database, Wifi, Shield, Banknote, Package, ShieldCheck,
} from "lucide-react";

function fmtDate(s: string | null) {
  if (!s) return "Never";
  const d = new Date(s);
  const now = new Date();
  const diffH = Math.round((now.getTime() - d.getTime()) / 3_600_000);
  if (diffH < 1)  return "< 1 hour ago";
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.round(diffH / 24);
  return `${diffD}d ago`;
}

function statusColor(status: string | null, isEnabled: boolean) {
  if (!isEnabled) return "text-muted-foreground";
  if (!status)    return "text-muted-foreground";
  if (status === "completed") return "text-emerald-500";
  if (status === "failed")    return "text-red-500";
  if (status === "running")   return "text-amber-500";
  return "text-muted-foreground";
}

function statusIcon(status: string | null, isEnabled: boolean) {
  if (!isEnabled)             return <XCircle className="h-4 w-4 text-muted-foreground/40" />;
  if (!status)                return <Clock className="h-4 w-4 text-muted-foreground" />;
  if (status === "completed") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === "failed")    return <XCircle className="h-4 w-4 text-red-500" />;
  if (status === "running")   return <RefreshCw className="h-4 w-4 text-amber-500 animate-spin" />;
  return <Clock className="h-4 w-4 text-muted-foreground" />;
}

function scoreColor(score: number) {
  if (score >= 90) return "text-emerald-500";
  if (score >= 70) return "text-amber-500";
  return "text-red-500";
}

function scoreBg(score: number) {
  if (score >= 90) return "bg-emerald-500";
  if (score >= 70) return "bg-amber-500";
  return "bg-red-500";
}

function MetricTile({
  icon, label, value, sub, status,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: string;
  status?: "green" | "amber" | "red" | "neutral";
}) {
  const dot =
    status === "green"   ? "bg-emerald-500" :
    status === "amber"   ? "bg-amber-500" :
    status === "red"     ? "bg-red-500" :
    "bg-muted-foreground/30";
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground/60">{icon}</span>
        <span className={`h-2 w-2 rounded-full ${dot}`} />
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function trustTone(status: string | undefined) {
  if (status === "GREEN") return { text: "text-emerald-500", bg: "bg-emerald-500", chip: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" };
  if (status === "AMBER") return { text: "text-amber-500", bg: "bg-amber-500", chip: "bg-amber-500/10 text-amber-500 border-amber-500/20" };
  if (status === "RED")   return { text: "text-red-500", bg: "bg-red-500", chip: "bg-red-500/10 text-red-500 border-red-500/20" };
  return { text: "text-muted-foreground", bg: "bg-muted-foreground/30", chip: "bg-muted text-muted-foreground border-border" };
}

function DataTrustPanel() {
  const { data: trust, isLoading } = useDataTrustLatest();
  const runCheck = useRunDataTrustCheck();
  const tone = trustTone(trust?.status);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Data Trust Score</p>
        </div>
        <button
          onClick={() => runCheck.mutate()}
          disabled={runCheck.isPending}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground hover:border-primary/40 transition-colors disabled:opacity-60"
        >
          {runCheck.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Run integrity check
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : !trust ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No integrity run yet. Click “Run integrity check”.</p>
      ) : (
        <>
          <div className="flex items-end gap-4">
            <p className={`text-5xl font-black leading-none tabular-nums ${tone.text}`}>{Math.round(trust.trust_score)}</p>
            <div className="mb-1">
              <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${tone.chip}`}>{trust.status}</span>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {trust.checks.filter((c) => c.status === "GREEN").length}/{trust.checks.length} checks passing
              </p>
            </div>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
            <div className={`h-2 rounded-full transition-all duration-500 ${tone.bg}`} style={{ width: `${trust.trust_score}%` }} />
          </div>

          <div className="mt-4 divide-y divide-border/40">
            {trust.checks.map((c) => {
              const ct = trustTone(c.status);
              return (
                <div key={c.key} className="flex items-center gap-3 py-2.5">
                  <span className={`h-2 w-2 flex-shrink-0 rounded-full ${ct.bg}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">{c.label}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{c.detail}</p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className={`text-xs font-medium ${ct.text}`}>{c.status}</p>
                    <p className="text-[11px] tabular-nums text-muted-foreground">{String(c.actual)}</p>
                  </div>
                </div>
              );
            })}
          </div>
          {trust.run_at && (
            <p className="mt-3 text-[11px] text-muted-foreground">Last run {fmtDate(trust.run_at)}</p>
          )}
        </>
      )}
    </div>
  );
}

export default function SystemHealthPage() {
  const { data: health, isLoading, isFetching, refetch } = useSystemHealth();

  const score = health?.data_quality_score ?? 0;
  const integrations = health?.integrations ?? [];
  const enabledCount  = integrations.filter((i) => i.is_enabled).length;
  const healthyCount  = integrations.filter((i) => i.is_enabled && i.last_status === "completed").length;
  const failedCount   = integrations.filter((i) => i.is_enabled && i.last_status === "failed").length;

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader
          title="System Health"
          subtitle="Data quality, integration status, and reconciliation overview"
        />
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground hover:border-primary/40 transition-colors disabled:opacity-60 flex-shrink-0"
        >
          {isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* ── Data Trust Score (Data Integrity Agent) ────────────────────── */}
          <DataTrustPanel />

          {/* ── Data Quality Score ─────────────────────────────────────────── */}
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Data Quality Score</p>
            <div className="flex items-end gap-4">
              <p className={`text-5xl font-black tabular-nums leading-none ${scoreColor(score)}`}>{score}</p>
              <p className="text-muted-foreground text-sm mb-1">/ 100</p>
            </div>
            <div className="mt-4 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${scoreBg(score)}`}
                style={{ width: `${score}%` }}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span className={health?.unclassified_orders ? "text-amber-400" : "text-emerald-400"}>
                {health?.unclassified_orders ?? 0} unclassified orders
              </span>
              <span className={health?.unclassified_bank ? "text-amber-400" : "text-emerald-400"}>
                {health?.unclassified_bank ?? 0} unclassified bank txns
              </span>
              <span className={health?.sync_failures_7d ? "text-red-400" : "text-emerald-400"}>
                {health?.sync_failures_7d ?? 0} sync failures (7d)
              </span>
            </div>
          </div>

          {/* ── KPI strip ──────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <MetricTile
              icon={<Package className="h-4 w-4" />}
              label="Total Orders"
              value={formatCount(health?.total_orders ?? 0)}
              sub={health?.latest_order_at ? `Latest ${fmtDate(health.latest_order_at)}` : undefined}
              status={health?.total_orders ? "green" : "neutral"}
            />
            <MetricTile
              icon={<Package className="h-4 w-4" />}
              label="Total Shipments"
              value={formatCount(health?.total_shipments ?? 0)}
              sub={health?.latest_shipment_at ? `Latest ${fmtDate(health.latest_shipment_at)}` : undefined}
              status={health?.total_shipments ? "green" : "neutral"}
            />
            <MetricTile
              icon={<Database className="h-4 w-4" />}
              label="Customers"
              value={formatCount(health?.total_customers ?? 0)}
              status={health?.total_customers ? "green" : "neutral"}
            />
            <MetricTile
              icon={<Shield className="h-4 w-4" />}
              label="Unclassified Orders"
              value={formatCount(health?.unclassified_orders ?? 0)}
              status={!health?.unclassified_orders ? "green" : health.unclassified_orders > 10 ? "red" : "amber"}
            />
            <MetricTile
              icon={<Banknote className="h-4 w-4" />}
              label="COD Outstanding"
              value={formatINR(health?.cod_outstanding_inr ?? 0)}
              sub={`${formatCount(health?.cod_outstanding_count ?? 0)} shipments`}
              status={!health?.cod_outstanding_count ? "green" : "amber"}
            />
          </div>

          {/* ── Integration Status ─────────────────────────────────────────── */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Wifi className="h-4 w-4 text-muted-foreground" />
                <p className="text-[13px] font-semibold text-foreground">Integration Health</p>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="text-emerald-400">{healthyCount} healthy</span>
                {failedCount > 0 && <span className="text-red-400">{failedCount} failed</span>}
                <span>{enabledCount} / {integrations.length} enabled</span>
              </div>
            </div>

            {integrations.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">No integrations configured.</div>
            ) : (
              <div className="divide-y divide-border/40">
                {integrations.map((int) => (
                  <div key={int.key} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-shrink-0">{statusIcon(int.last_status, int.is_enabled)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground truncate">{int.name}</p>
                        {!int.is_enabled && (
                          <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">disabled</span>
                        )}
                      </div>
                      {int.error_summary && (
                        <p className="text-[11px] text-red-400 mt-0.5 truncate">{int.error_summary}</p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-xs font-medium ${statusColor(int.last_status, int.is_enabled)}`}>
                        {int.is_enabled ? (int.last_status ?? "Not run") : "Disabled"}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{fmtDate(int.last_run_at)}</p>
                    </div>
                    {int.records_fetched != null && (
                      <div className="text-right flex-shrink-0 ml-4 hidden sm:block">
                        <p className="text-xs tabular-nums text-muted-foreground">{formatCount(int.records_fetched)}</p>
                        <p className="text-[11px] text-muted-foreground">records</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
