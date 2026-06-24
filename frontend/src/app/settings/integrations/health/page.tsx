"use client";

import { useIntegrationHealth } from "@/lib/hooks/use-integrations";
import { useSyncHealth } from "@/lib/hooks/use-sync-health";
import { PageHeader } from "@/components/ui/page-header";
import {
  getHealthTrafficLight,
  getHealthStatusLabel,
  INTEGRATION_ICONS,
  type IntegrationHealth,
} from "@/types/integrations";
import {
  CheckCircle2, XCircle, AlertTriangle, Clock, RefreshCw,
  Loader2, Database, ArrowUpDown, Calendar, Zap,
} from "lucide-react";
import { formatCount } from "@/lib/utils/format";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtAgo(ts: string | null): string {
  if (!ts) return "—";
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60)   return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

function fmtDate(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtLag(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

// ── Traffic light indicator ───────────────────────────────────────────────────

function StatusBadge({ h }: { h: IntegrationHealth }) {
  const tl = getHealthTrafficLight(h);
  const label = getHealthStatusLabel(h);
  const cfg = {
    green: { dot: "bg-emerald-500", text: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
    amber: { dot: "bg-amber-500",   text: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/20"   },
    red:   { dot: "bg-red-500",     text: "text-red-400",     bg: "bg-red-500/10 border-red-500/20"       },
    grey:  { dot: "bg-muted-foreground", text: "text-muted-foreground", bg: "bg-muted border-border"    },
  }[tl];

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${cfg.bg} ${cfg.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot} ${tl === "green" ? "animate-pulse" : ""}`} />
      {label}
    </span>
  );
}

// ── Status row icon ───────────────────────────────────────────────────────────

function Check({ ok, na }: { ok: boolean; na?: boolean }) {
  if (na) return <span className="text-[11px] text-muted-foreground">N/A</span>;
  return ok
    ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
    : <XCircle className="h-4 w-4 text-muted-foreground/40" />;
}

// ── Summary strip ─────────────────────────────────────────────────────────────

function SummaryStrip({ rows }: { rows: IntegrationHealth[] }) {
  const healthy = rows.filter(r => getHealthTrafficLight(r) === "green").length;
  const failing = rows.filter(r => getHealthTrafficLight(r) === "red").length;
  const amber   = rows.filter(r => getHealthTrafficLight(r) === "amber").length;
  const grey    = rows.filter(r => getHealthTrafficLight(r) === "grey").length;

  return (
    <div className="grid grid-cols-4 gap-3">
      {[
        { label: "Healthy",      value: healthy, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
        { label: "Failing",      value: failing, color: "text-red-400",     bg: "bg-red-500/10 border-red-500/20"         },
        { label: "Needs Attention", value: amber, color: "text-amber-400",  bg: "bg-amber-500/10 border-amber-500/20"     },
        { label: "Not Configured", value: grey,  color: "text-muted-foreground", bg: "bg-muted border-border"            },
      ].map(({ label, value, color, bg }) => (
        <div key={label} className={`rounded-xl border p-4 ${bg}`}>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
          <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
        </div>
      ))}
    </div>
  );
}

// ── Sync Execution Monitor (per-job, powered by get_sync_health) ─────────────

function SyncExecutionMonitor() {
  const { data: jobs, isLoading } = useSyncHealth();

  const cronScheduleLabel = "Every 4 hours (0 */4 * * *)";
  const green = (jobs ?? []).filter(j => j.health_status === "green").length;
  const amber = (jobs ?? []).filter(j => j.health_status === "amber").length;
  const red   = (jobs ?? []).filter(j => j.health_status === "red").length;
  const inactive = (jobs ?? []).filter(j => !j.is_active).length;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        Auto Sync Execution Monitor
      </h2>

      {/* Cron status banner */}
      <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-5 py-3.5">
        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-emerald-400">Vercel Cron Active</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Schedule: {cronScheduleLabel} · GET /api/sync/schedule · Retry engine: 5 min → 15 min → 60 min (max 3 attempts)
          </p>
        </div>
        <div className="flex gap-4 flex-shrink-0">
          {[
            { label: "Healthy",   v: green,    c: "text-emerald-400" },
            { label: "Lagging",   v: amber,    c: "text-amber-400" },
            { label: "Failed",    v: red,      c: "text-red-400" },
            { label: "Inactive",  v: inactive, c: "text-muted-foreground" },
          ].map(({ label, v, c }) => (
            <div key={label} className="text-center">
              <p className={`text-lg font-bold tabular-nums ${c}`}>{v}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Per-job table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <p className="text-[13px] font-semibold text-foreground">Sync Job Execution Log</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">One row per sync job — actual run history from the database</p>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="border-b border-border bg-muted/30">
                <tr>
                  {["","Integration","Entity","Active","Last Run","Last Success","Last Failed","Lag","Runs 24h","✓","✗","Records"].map((h, i) => (
                    <th key={i} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(jobs ?? []).map((j) => {
                  const dotColor = {
                    green:   "bg-emerald-500",
                    amber:   "bg-amber-500",
                    red:     "bg-red-500",
                    unknown: "bg-muted-foreground",
                  }[j.health_status ?? "unknown"];
                  const lagAlert = j.lag_hours !== null && j.lag_hours > 48;
                  return (
                    <tr key={j.job_id} className="border-b border-border/40 hover:bg-muted/20 last:border-0">
                      <td className="px-3 py-2">
                        <span className={`h-2 w-2 rounded-full inline-block flex-shrink-0 ${dotColor}`} />
                      </td>
                      <td className="px-3 py-2 font-medium whitespace-nowrap">{j.integration_key}</td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{j.entity_type}</td>
                      <td className="px-3 py-2">
                        {j.is_active
                          ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          : <XCircle className="h-3.5 w-3.5 text-muted-foreground/40" />}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{fmtAgo(j.last_run_at)}</td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{fmtAgo(j.last_success_at)}</td>
                      <td className={`px-3 py-2 whitespace-nowrap ${j.last_failed_at && (!j.last_success_at || j.last_failed_at > j.last_success_at) ? "text-red-400" : "text-muted-foreground"}`}>
                        {fmtAgo(j.last_failed_at)}
                      </td>
                      <td className={`px-3 py-2 tabular-nums whitespace-nowrap ${lagAlert ? "text-amber-400 font-medium" : "text-muted-foreground"}`}>
                        {fmtLag(j.lag_hours)}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{j.runs_24h}</td>
                      <td className="px-3 py-2 tabular-nums text-emerald-400">{j.success_24h}</td>
                      <td className={`px-3 py-2 tabular-nums ${Number(j.failed_24h) > 0 ? "text-red-400 font-medium" : "text-muted-foreground"}`}>
                        {j.failed_24h}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{formatCount(j.records_last_run)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Last error detail for any failed job */}
        {(jobs ?? []).filter(j => j.last_error && j.health_status === "red").slice(0, 3).map(j => (
          <div key={j.job_id} className="px-5 py-3 bg-red-500/5 border-t border-red-500/20">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-red-400 mb-1 flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3" /> {j.integration_key}/{j.entity_type}
            </p>
            <p className="text-[11px] text-red-300 font-mono break-all">{j.last_error}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Integration card ──────────────────────────────────────────────────────────

function IntegrationCard({ h }: { h: IntegrationHealth }) {
  const tl = getHealthTrafficLight(h);
  const borderColor =
    tl === "green" ? "border-emerald-500/20" :
    tl === "red"   ? "border-red-500/20" :
    tl === "amber" ? "border-amber-500/20" :
    "border-border";

  const isSyncing = h.is_configured && h.is_enabled;

  return (
    <div className={`rounded-xl border ${borderColor} bg-card overflow-hidden`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{INTEGRATION_ICONS[h.integration_key] ?? "🔌"}</span>
          <div>
            <p className="text-[14px] font-semibold text-foreground">{h.display_name}</p>
            <p className="text-[11px] text-muted-foreground font-mono">{h.integration_key}</p>
          </div>
        </div>
        <StatusBadge h={h} />
      </div>

      {/* Status checklist */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 px-5 py-4 border-b border-border">
        {[
          { label: "Configured",     ok: h.is_configured },
          { label: "Authenticated",  ok: h.is_authenticated },
          { label: "Enabled",        ok: h.is_enabled },
          { label: "Syncing",        ok: h.success_runs > 0,        na: !isSyncing },
        ].map(({ label, ok, na }) => (
          <div key={label} className="flex items-center gap-2">
            <Check ok={ok} na={na} />
            <span className="text-[12px] text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-px bg-border">
        {[
          {
            icon: <Clock className="h-3 w-3" />,
            label: "Last Sync",
            value: isSyncing ? fmtAgo(h.last_success_at) : "—",
          },
          {
            icon: <Calendar className="h-3 w-3" />,
            label: "Latest Record",
            value: h.latest_local_record_at ? fmtDate(h.latest_local_record_at) : "—",
          },
          {
            icon: <Database className="h-3 w-3" />,
            label: "Records in DB",
            value: isSyncing ? formatCount(h.local_record_count) : "—",
          },
          {
            icon: <Zap className="h-3 w-3" />,
            label: "Sync Lag",
            value: isSyncing ? fmtLag(h.sync_lag_hours) : "—",
            alert: h.sync_lag_hours !== null && h.sync_lag_hours > 48,
          },
          {
            icon: <ArrowUpDown className="h-3 w-3" />,
            label: "Runs (✓ / ✗)",
            value: isSyncing ? `${h.success_runs} / ${h.failed_runs}` : "—",
            alert: h.failed_runs > 0 && h.success_runs === 0,
          },
          {
            icon: <CheckCircle2 className="h-3 w-3" />,
            label: "Total Imported",
            value: isSyncing ? formatCount(h.total_fetched) : "—",
          },
        ].map(({ icon, label, value, alert }) => (
          <div key={label} className="flex flex-col gap-1 bg-card px-4 py-3">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              {icon}
              <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
            </div>
            <p className={`text-[13px] font-medium tabular-nums ${alert ? "text-red-400" : "text-foreground"}`}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Error detail */}
      {h.last_error_summary && (
        <div className="px-5 py-3 bg-red-500/5 border-t border-red-500/20">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-red-400 mb-1 flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3" /> Last Error
          </p>
          <p className="text-[11px] text-red-300 font-mono break-all leading-relaxed">
            {h.last_error_summary}
          </p>
        </div>
      )}

      {/* Test error */}
      {h.test_error && (
        <div className="px-5 py-3 bg-amber-500/5 border-t border-amber-500/20">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400 mb-1">
            Connection Test Error
          </p>
          <p className="text-[11px] text-amber-300 font-mono break-all">{h.test_error}</p>
        </div>
      )}

      {/* Blocker notes */}
      {tl === "red" && !h.last_error_summary && h.is_configured && (
        <div className="px-5 py-3 bg-red-500/5 border-t border-red-500/20">
          <p className="text-[11px] text-red-300">
            All {h.failed_runs} sync {h.failed_runs === 1 ? "run" : "runs"} failed with no recoverable records.
            Check edge function logs in Supabase dashboard.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function IntegrationHealthPage() {
  const { data, isLoading, isFetching, refetch, dataUpdatedAt } = useIntegrationHealth();
  const rows = data ?? [];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Integration Health"
          subtitle="End-to-end status across all data pipelines — configured, authenticated, syncing, reconciled"
        />
        <div className="flex items-center gap-2 flex-shrink-0">
          {dataUpdatedAt > 0 && (
            <span className="text-[11px] text-muted-foreground">
              Updated {fmtAgo(new Date(dataUpdatedAt).toISOString())}
            </span>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground hover:border-primary/40 transition-colors disabled:opacity-60"
          >
            {isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Refresh
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <SummaryStrip rows={rows} />

          {/* Traffic-light grouped sections */}
          {(["red", "amber", "green", "grey"] as const).map((tl) => {
            const group = rows.filter(r => getHealthTrafficLight(r) === tl);
            if (group.length === 0) return null;
            const heading = {
              red:   "Failing — Immediate Action Required",
              amber: "Needs Attention",
              green: "Healthy",
              grey:  "Not Configured",
            }[tl];
            const headingColor = {
              red: "text-red-400", amber: "text-amber-400",
              green: "text-emerald-400", grey: "text-muted-foreground",
            }[tl];
            return (
              <div key={tl} className="flex flex-col gap-3">
                <h2 className={`text-[11px] font-semibold uppercase tracking-widest ${headingColor}`}>
                  {heading}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {group.map(h => <IntegrationCard key={h.integration_key} h={h} />)}
                </div>
              </div>
            );
          })}

          <SyncExecutionMonitor />

          {/* Audit report */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <p className="text-[13px] font-semibold text-foreground">Full Audit Report</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Raw data from all integrations — as of last refresh</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="border-b border-border bg-muted/30">
                  <tr>
                    {["Integration","Status","Configured","Auth","Enabled","Last Sync","Latest Record","Records","Lag","Runs ✓","Runs ✗","Fetched"].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(h => {
                    const tl = getHealthTrafficLight(h);
                    const dotColor = { green: "bg-emerald-500", amber: "bg-amber-500", red: "bg-red-500", grey: "bg-muted-foreground" }[tl];
                    return (
                      <tr key={h.integration_key} className="border-b border-border/40 hover:bg-muted/20 last:border-0">
                        <td className="px-3 py-2 font-medium whitespace-nowrap">
                          <span className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full flex-shrink-0 ${dotColor}`} />
                            {h.display_name}
                          </span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{getHealthStatusLabel(h)}</td>
                        <td className="px-3 py-2"><Check ok={h.is_configured} /></td>
                        <td className="px-3 py-2"><Check ok={h.is_authenticated} /></td>
                        <td className="px-3 py-2"><Check ok={h.is_enabled} /></td>
                        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{fmtAgo(h.last_success_at)}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{fmtDate(h.latest_local_record_at)}</td>
                        <td className="px-3 py-2 tabular-nums text-right">{formatCount(h.local_record_count)}</td>
                        <td className={`px-3 py-2 tabular-nums ${h.sync_lag_hours !== null && h.sync_lag_hours > 48 ? "text-amber-400" : ""}`}>
                          {fmtLag(h.sync_lag_hours)}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-emerald-400">{h.success_runs}</td>
                        <td className={`px-3 py-2 tabular-nums ${h.failed_runs > 0 && h.success_runs === 0 ? "text-red-400 font-medium" : "text-muted-foreground"}`}>
                          {h.failed_runs}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">{formatCount(h.total_fetched)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
