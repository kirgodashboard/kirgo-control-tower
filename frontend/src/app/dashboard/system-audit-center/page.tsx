"use client";

import { useState, useMemo } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { useAuditRuns, useAuditKpiResults, useRunKpiAudit } from "@/lib/hooks/use-audit";
import { formatINR, formatCount } from "@/lib/utils/format";
import { CheckCircle2, XCircle, Play, Loader2, ShieldCheck } from "lucide-react";
import type { AuditKpiResult } from "@/lib/data/audit";

function fmtVal(r: AuditKpiResult, v: number | null) {
  if (v == null) return "—";
  if (r.value_type === "currency") return formatINR(v);
  if (r.value_type === "percent")  return `${v.toFixed(1)}%`;
  return formatCount(v);
}

export default function SystemAuditCenterPage() {
  const { data: runs = [], isLoading } = useAuditRuns(30);
  const runMutation = useRunKpiAudit();
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);

  const activeRunId = selectedRunId ?? runs[0]?.id ?? null;
  const { data: results = [] } = useAuditKpiResults(activeRunId);
  const activeRun = useMemo(() => runs.find((r) => r.id === activeRunId), [runs, activeRunId]);

  async function handleRun() {
    const newId = await runMutation.mutateAsync();
    setSelectedRunId(newId);
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="System Audit Center"
        subtitle="Automated KPI validation — every dashboard value recomputed from source and compared within tolerance"
      >
        <button
          onClick={handleRun}
          disabled={runMutation.isPending}
          className="inline-flex items-center gap-2 rounded-md bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
        >
          {runMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {runMutation.isPending ? "Running audit…" : "Run audit"}
        </button>
      </PageHeader>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Tests run</div>
          <div className="mt-2 text-3xl font-bold tabular-nums">{activeRun?.tests_run ?? "—"}</div>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
          <div className="text-xs font-medium uppercase tracking-wider text-emerald-600">Passed</div>
          <div className="mt-2 text-3xl font-bold tabular-nums text-emerald-500">{activeRun?.passed ?? "—"}</div>
        </div>
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5">
          <div className="text-xs font-medium uppercase tracking-wider text-red-600">Failed</div>
          <div className="mt-2 text-3xl font-bold tabular-nums text-red-500">{activeRun?.failed ?? "—"}</div>
        </div>
      </div>

      {/* Results table */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <ShieldCheck className="h-4 w-4 text-violet-500" />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            KPI validation results{activeRun ? ` · run #${activeRun.id}` : ""}
          </span>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : results.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No audit results yet. Click “Run audit” to validate all dashboards.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-5 py-2 font-medium">Dashboard</th>
                <th className="px-5 py-2 font-medium">KPI</th>
                <th className="px-5 py-2 text-right font-medium">Dashboard</th>
                <th className="px-5 py-2 text-right font-medium">Calculated</th>
                <th className="px-5 py-2 text-right font-medium">Diff</th>
                <th className="px-5 py-2 text-center font-medium">Status</th>
                <th className="px-5 py-2 font-medium">Likely cause</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.id} className="border-t border-border/60">
                  <td className="px-5 py-2.5 text-muted-foreground">{r.dashboard_name}</td>
                  <td className="px-5 py-2.5 font-medium">{r.kpi_name}</td>
                  <td className="px-5 py-2.5 text-right font-mono tabular-nums">{fmtVal(r, r.dashboard_value)}</td>
                  <td className="px-5 py-2.5 text-right font-mono tabular-nums">{fmtVal(r, r.calculated_value)}</td>
                  <td className="px-5 py-2.5 text-right font-mono tabular-nums">{fmtVal(r, r.difference)}</td>
                  <td className="px-5 py-2.5 text-center">
                    {r.status === "pass" ? (
                      <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-500" />
                    ) : (
                      <XCircle className="mx-auto h-4 w-4 text-red-500" />
                    )}
                  </td>
                  <td className="px-5 py-2.5 text-xs text-muted-foreground">{r.likely_cause ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Run history */}
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Audit history</span>
        </div>
        <div className="divide-y divide-border/60">
          {runs.map((run) => (
            <button
              key={run.id}
              onClick={() => setSelectedRunId(run.id)}
              className={`flex w-full items-center justify-between px-5 py-3 text-left text-sm hover:bg-muted/40 ${
                run.id === activeRunId ? "bg-muted/30" : ""
              }`}
            >
              <span className="flex items-center gap-3">
                <span className="font-medium">Run #{run.id}</span>
                <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                  {run.run_type}
                </span>
                <span className="text-xs text-muted-foreground">{new Date(run.started_at).toLocaleString()}</span>
              </span>
              <span className="flex items-center gap-3 text-xs">
                <span className="text-emerald-500">{run.passed} passed</span>
                <span className={run.failed > 0 ? "text-red-500" : "text-muted-foreground"}>{run.failed} failed</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
