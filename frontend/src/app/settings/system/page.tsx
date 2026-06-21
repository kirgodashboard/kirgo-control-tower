"use client";

import { Server, Database, Cpu, HardDrive, Clock, RefreshCw, CheckCircle2, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { useSystemInfo } from "@/lib/hooks/use-company";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchIntegrationSummary } from "@/lib/data/integrations";
import { formatDate } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

function StatCard({ icon: Icon, label, value, sub }: {
  icon: React.ElementType; label: string; value: string; sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-violet-400" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn("text-sm font-medium text-foreground", mono && "font-mono text-xs")}>
        {value}
      </span>
    </div>
  );
}

export default function SystemPage() {
  const { data: sys, isLoading: sysLoading, isFetching } = useSystemInfo();
  const { data: integrations, isLoading: intLoading } = useQuery({
    queryKey: ["integration-summary"],
    queryFn: () => fetchIntegrationSummary(),
    staleTime: 30_000,
  });
  const qc = useQueryClient();

  const activeIntegrations = integrations?.filter(i => i.is_enabled) ?? [];
  const runningJobs = integrations?.filter(i => i.latest_is_running) ?? [];
  const failedJobs = integrations?.filter(i =>
    i.last_failure_at && (!i.last_success_at || i.last_failure_at > i.last_success_at)
  ) ?? [];

  function refresh() {
    qc.invalidateQueries({ queryKey: ["system-info"] });
    qc.invalidateQueries({ queryKey: ["integration-summary"] });
  }

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="System"
        subtitle="Platform status, database info, and sync health"
      >
        <button
          onClick={refresh}
          disabled={isFetching}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
          Refresh
        </button>
      </PageHeader>

      {sysLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={Database} label="DB Tables"    value={String(sys?.table_count ?? "—")} sub="public schema" />
            <StatCard icon={HardDrive} label="DB Size"    value={sys?.db_size ?? "—"} />
            <StatCard icon={Cpu}       label="Active Jobs" value={String(sys?.active_jobs ?? "—")} sub="sync jobs" />
            <StatCard icon={Server}    label="Running Now" value={String(sys?.running_jobs ?? "—")} sub="last 1h" />
          </div>

          {/* Platform info */}
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Platform
            </p>
            <Row label="App Version"     value={sys?.app_version ?? "—"} />
            <Row label="Database"        value={sys?.db_version ?? "—"} mono />
            <Row label="Server Time"     value={sys?.server_time ? new Date(sys.server_time).toLocaleString("en-IN") : "—"} />
          </div>

          {/* Integration health */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Sync Queue
              </p>
            </div>
            {intLoading ? (
              <div className="flex items-center justify-center h-20">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="divide-y divide-border">
                {activeIntegrations.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-muted-foreground">No active integrations</p>
                ) : (
                  activeIntegrations.map(i => (
                    <div key={i.integration_key} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{i.display_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {i.last_success_at
                            ? `Last sync ${formatDate(i.last_success_at)}`
                            : "Never synced"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {i.latest_is_running ? (
                          <span className="flex items-center gap-1.5 text-xs text-amber-400">
                            <Loader2 className="h-3 w-3 animate-spin" /> Running
                          </span>
                        ) : failedJobs.some(f => f.integration_key === i.integration_key) ? (
                          <span className="text-xs text-red-400">Failed</span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" /> OK
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Build info */}
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Build
            </p>
            <Row label="Framework"      value="Next.js 14 (App Router)" />
            <Row label="Runtime"        value="Node.js (Vercel Fluid Compute)" />
            <Row label="Database"       value="Supabase PostgreSQL 15" />
            <Row label="Auth"           value="Supabase Auth" />
            <Row label="Vault"          value="Supabase Vault (AES-256)" />
          </div>
        </>
      )}
    </div>
  );
}
