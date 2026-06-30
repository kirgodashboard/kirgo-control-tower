"use client";

import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { useDataQuality } from "@/lib/hooks/use-data-quality";
import { useSystemHealth } from "@/lib/hooks/use-system-health";
import { useAuditRuns, useAuditKpiResults, useRunKpiAudit } from "@/lib/hooks/use-audit";
import { formatINR, formatCount } from "@/lib/utils/format";
import {
  CheckCircle2, AlertTriangle, XCircle, RefreshCw, Clock,
  ArrowRight, Play, ChevronDown, Loader2, Wifi,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types & helpers ───────────────────────────────────────────────────────────

type Rag = "green" | "amber" | "red";

const RAG_STYLE: Record<Rag, { badge: string; dot: string; icon: string; row: string }> = {
  green: {
    badge: "bg-emerald-500/10 border-emerald-500/20 text-emerald-500",
    dot:   "bg-emerald-500",
    icon:  "text-emerald-500",
    row:   "",
  },
  amber: {
    badge: "bg-amber-500/10 border-amber-500/20 text-amber-500",
    dot:   "bg-amber-500",
    icon:  "text-amber-500",
    row:   "",
  },
  red: {
    badge: "bg-red-500/10 border-red-500/20 text-red-500",
    dot:   "bg-red-500",
    icon:  "text-red-500",
    row:   "",
  },
};

function RagIcon({ rag, size = "h-4 w-4" }: { rag: Rag; size?: string }) {
  const cls = cn(size, RAG_STYLE[rag].icon);
  if (rag === "green") return <CheckCircle2 className={cls} />;
  if (rag === "amber") return <AlertTriangle className={cls} />;
  return <XCircle className={cls} />;
}

function domainRag(rags: Rag[]): Rag {
  if (rags.includes("red"))   return "red";
  if (rags.includes("amber")) return "amber";
  return "green";
}

function lastSyncLabel(ts: string | null): string {
  if (!ts) return "Never";
  const h = (Date.now() - new Date(ts).getTime()) / 3_600_000;
  if (h < 1)  return "< 1h ago";
  if (h < 24) return `${Math.floor(h)}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function lastSyncRag(ts: string | null): Rag {
  if (!ts) return "red";
  const h = (Date.now() - new Date(ts).getTime()) / 3_600_000;
  if (h < 25) return "green";
  if (h < 72) return "amber";
  return "red";
}

function syncStatusRag(status: string | null, enabled: boolean): Rag {
  if (!enabled)              return "amber";
  if (!status)               return "amber";
  if (status === "completed") return "green";
  if (status === "failed")    return "red";
  if (status === "running")   return "amber";
  return "amber";
}

function fmtDate(s: string | null) {
  if (!s) return "Never";
  const d = new Date(s);
  const diffH = Math.round((Date.now() - d.getTime()) / 3_600_000);
  if (diffH < 1)  return "< 1h ago";
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.round(diffH / 24)}d ago`;
}

// ── Alert row ─────────────────────────────────────────────────────────────────

function AlertRow({
  rag, label, value, detail, actionHref, actionLabel,
}: {
  rag: Rag; label: string; value: string | number;
  detail?: string; actionHref?: string; actionLabel?: string;
}) {
  const s = RAG_STYLE[rag];
  return (
    <div className="flex items-center justify-between py-3 border-b border-border/60 last:border-0">
      <div className="flex items-start gap-2.5 min-w-0">
        <div className="mt-0.5 flex-shrink-0">
          <RagIcon rag={rag} />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-foreground leading-tight">{label}</p>
          {detail && <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>}
          {actionHref && rag !== "green" && (
            <Link
              href={actionHref}
              className="inline-flex items-center gap-1 text-[11px] text-violet-400 hover:text-violet-300 mt-1"
            >
              {actionLabel ?? "Fix"} <ArrowRight className="h-2.5 w-2.5" />
            </Link>
          )}
        </div>
      </div>
      <span className={cn("ml-3 flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-md border", s.badge)}>
        {value}
      </span>
    </div>
  );
}

// ── Alerts panel ──────────────────────────────────────────────────────────────

function AlertsPanel() {
  const { data, isLoading, refetch } = useDataQuality();

  if (isLoading) return (
    <div className="rounded-xl border border-border bg-card p-5 h-48 animate-pulse" />
  );
  if (!data) return null;

  const items: { rag: Rag; label: string; value: string | number; detail?: string; actionHref?: string; actionLabel?: string }[] = [
    {
      rag: data.unclassified_bank_count === 0 ? "green" : data.unclassified_bank_count <= 10 ? "amber" : "red",
      label: "Unclassified bank debits",
      value: data.unclassified_bank_count === 0 ? "None" : data.unclassified_bank_count,
      detail: "Bank withdrawals not yet categorised",
      actionHref: "/dashboard/bank-classification",
      actionLabel: "Classify now",
    },
    {
      rag: data.missing_expense_count === 0 ? "green" : data.missing_expense_count <= 5 ? "amber" : "red",
      label: "Missing expense records",
      value: data.missing_expense_count === 0 ? "None" : data.missing_expense_count,
      detail: "Debits ≥ ₹500 with no linked expense",
      actionHref: "/dashboard/bank-classification",
      actionLabel: "Link expenses",
    },
    {
      rag: data.cod_variance_inr === 0 ? "green" : data.cod_variance_inr < 10000 ? "amber" : "red",
      label: "COD outstanding",
      value: data.cod_variance_inr === 0 ? "Settled" : formatINR(data.cod_variance_inr),
      detail: "Unremitted Shiprocket COD amounts",
      actionHref: "/dashboard/operations",
      actionLabel: "View COD reconciliation",
    },
    {
      rag: data.unclassified_order_count === 0 ? "green" : data.unclassified_order_count <= 20 ? "amber" : "red",
      label: "Unclassified orders",
      value: data.unclassified_order_count === 0 ? "None" : data.unclassified_order_count,
      detail: "Orders with no commercial classification",
      actionHref: "/dashboard/order-classification",
      actionLabel: "Classify orders",
    },
    {
      rag: data.out_of_stock_count === 0 ? "green" : data.out_of_stock_count <= 2 ? "amber" : "red",
      label: "Out of stock SKUs",
      value: data.out_of_stock_count === 0 ? "None" : `${data.out_of_stock_count} SKUs`,
      detail: "Active SKUs with zero inventory",
      actionHref: "/dashboard/inventory",
      actionLabel: "View inventory",
    },
    {
      rag: data.low_stock_count === 0 ? "green" : data.low_stock_count <= 3 ? "amber" : "red",
      label: "Low stock SKUs",
      value: data.low_stock_count === 0 ? "None" : `${data.low_stock_count} SKUs`,
      detail: "At or below reorder point",
      actionHref: "/dashboard/inventory",
      actionLabel: "View inventory",
    },
    {
      rag: data.sync_failures_7d === 0 ? "green" : data.sync_failures_7d <= 2 ? "amber" : "red",
      label: "Sync failures (7 days)",
      value: data.sync_failures_7d === 0 ? "None" : data.sync_failures_7d,
      detail: "Failed integration runs in the last week",
    },
    {
      rag: lastSyncRag(data.last_sync_at),
      label: "Last successful sync",
      value: lastSyncLabel(data.last_sync_at),
      detail: data.last_sync_at
        ? new Date(data.last_sync_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
        : "No completed runs",
    },
  ];

  const overallRag = domainRag(items.map((i) => i.rag));
  const issueCount = items.filter((i) => i.rag !== "green").length;

  const bannerStyle = RAG_STYLE[overallRag];
  const bannerText = {
    green: "All clear — no data issues detected",
    amber: `${issueCount} item${issueCount !== 1 ? "s" : ""} need review`,
    red:   `${issueCount} issue${issueCount !== 1 ? "s" : ""} require action`,
  }[overallRag];

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Alerts
        </p>
        <button
          onClick={() => refetch()}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      {/* Overall banner */}
      <div className={cn("flex items-center gap-2.5 px-5 py-3 border-b border-border/60", bannerStyle.badge)}>
        <RagIcon rag={overallRag} size="h-3.5 w-3.5" />
        <p className="text-xs font-medium">{bannerText}</p>
      </div>

      {/* Rows */}
      <div className="px-5 divide-y divide-border/0">
        {items.map((item, i) => (
          <AlertRow key={i} {...item} />
        ))}
      </div>
    </div>
  );
}

// ── Integrations panel ────────────────────────────────────────────────────────

function IntegrationsPanel() {
  const { data: health, isLoading } = useSystemHealth();
  const integrations = health?.integrations ?? [];

  const healthyCount = integrations.filter((i) => i.is_enabled && i.last_status === "completed").length;
  const failedCount  = integrations.filter((i) => i.is_enabled && i.last_status === "failed").length;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Wifi className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Integrations
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-emerald-500">{healthyCount} syncing</span>
          {failedCount > 0 && <span className="text-red-500">{failedCount} failed</span>}
        </div>
      </div>

      {isLoading ? (
        <div className="py-10 text-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" />
        </div>
      ) : integrations.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No integrations configured.</p>
      ) : (
        <div className="divide-y divide-border/40">
          {integrations.map((int) => {
            const rag = syncStatusRag(int.last_status, int.is_enabled);
            return (
              <div key={int.key} className="flex items-center gap-3 px-5 py-3">
                <div className="flex-shrink-0">
                  <span className={cn("h-2 w-2 rounded-full block flex-shrink-0", RAG_STYLE[rag].dot)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{int.name}</p>
                    {!int.is_enabled && (
                      <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        disabled
                      </span>
                    )}
                  </div>
                  {int.error_summary && (
                    <p className="text-[11px] text-red-400 mt-0.5 truncate">{int.error_summary}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={cn("text-xs font-medium", RAG_STYLE[rag].icon)}>
                    {!int.is_enabled ? "Disabled" : int.last_status ?? "Not run"}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{fmtDate(int.last_run_at)}</p>
                </div>
                {int.records_fetched != null && (
                  <div className="text-right flex-shrink-0 ml-3 hidden sm:block">
                    <p className="text-xs tabular-nums text-foreground">{formatCount(int.records_fetched)}</p>
                    <p className="text-[11px] text-muted-foreground">records</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── KPI Integrity panel ───────────────────────────────────────────────────────

function IntegrityPanel() {
  const [open, setOpen]         = useState(false);
  const { data: runs = [] }     = useAuditRuns(10);
  const runMutation             = useRunKpiAudit();
  const latestRun               = runs[0] ?? null;
  const { data: results = [] }  = useAuditKpiResults(latestRun?.id ?? null);

  async function handleRun() {
    setOpen(true);
    await runMutation.mutateAsync();
  }

  const failures = results.filter((r) => r.status === "fail");

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-3 border-b border-border hover:bg-muted/30 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            KPI Integrity Check
          </p>
          {latestRun && (
            <span className={cn(
              "text-[10px] font-medium px-1.5 py-0.5 rounded border",
              latestRun.failed > 0
                ? "bg-red-500/10 text-red-500 border-red-500/20"
                : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
            )}>
              {latestRun.failed > 0 ? `${latestRun.failed} mismatch${latestRun.failed !== 1 ? "es" : ""}` : `${latestRun.passed} passed`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); handleRun(); }}
            disabled={runMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-violet-600/90 hover:bg-violet-600 px-2.5 py-1 text-xs font-medium text-white transition-colors disabled:opacity-60"
          >
            {runMutation.isPending
              ? <><Loader2 className="h-3 w-3 animate-spin" /> Running…</>
              : <><Play className="h-3 w-3" /> Run check</>}
          </button>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </div>
      </button>

      {open && (
        <div>
          {!latestRun ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No audit run yet. Click "Run check" to validate all dashboard KPIs.
            </p>
          ) : results.length === 0 ? (
            <div className="py-8 text-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" />
            </div>
          ) : (
            <>
              {failures.length > 0 && (
                <div className="px-5 py-3 bg-red-500/5 border-b border-border/60">
                  <p className="text-xs text-red-400 font-medium">
                    {failures.length} KPI{failures.length !== 1 ? "s" : ""} show a discrepancy between what the dashboard displays and what the source data calculates.
                  </p>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-muted-foreground border-b border-border">
                      <th className="px-5 py-2 font-medium">KPI</th>
                      <th className="px-5 py-2 text-right font-medium">Dashboard</th>
                      <th className="px-5 py-2 text-right font-medium">Calculated</th>
                      <th className="px-5 py-2 text-center font-medium">Match</th>
                      <th className="px-5 py-2 font-medium hidden sm:table-cell">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr key={r.id} className="border-t border-border/50">
                        <td className="px-5 py-2.5">
                          <p className="font-medium">{r.kpi_name}</p>
                          <p className="text-[11px] text-muted-foreground">{r.dashboard_name}</p>
                        </td>
                        <td className="px-5 py-2.5 text-right font-mono tabular-nums text-sm">
                          {r.dashboard_value ?? "—"}
                        </td>
                        <td className="px-5 py-2.5 text-right font-mono tabular-nums text-sm">
                          {r.calculated_value ?? "—"}
                        </td>
                        <td className="px-5 py-2.5 text-center">
                          {r.status === "pass"
                            ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                            : <XCircle className="h-4 w-4 text-red-500 mx-auto" />}
                        </td>
                        <td className="px-5 py-2.5 text-xs text-muted-foreground hidden sm:table-cell">
                          {r.likely_cause ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-5 py-2 border-t border-border/60">
                <p className="text-[11px] text-muted-foreground">
                  Last run {new Date(latestRun.started_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  · {latestRun.tests_run} tests · {latestRun.passed} passed · {latestRun.failed} failed
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HealthPage() {
  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        title="Health"
        subtitle="Alerts to fix, integration sync status, and KPI validation"
        backHref="/review"
      />

      {/* Two-column on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <AlertsPanel />
        <IntegrationsPanel />
      </div>

      {/* Full-width integrity check */}
      <IntegrityPanel />

      {/* Legend */}
      <div className="flex items-center gap-5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Green — OK
        </span>
        <span className="flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Amber — review soon
        </span>
        <span className="flex items-center gap-1.5">
          <XCircle className="h-3.5 w-3.5 text-red-500" /> Red — action needed
        </span>
        <span className="flex items-center gap-1.5 ml-auto">
          <Clock className="h-3.5 w-3.5" /> Refreshes every 60s
        </span>
      </div>
    </div>
  );
}
