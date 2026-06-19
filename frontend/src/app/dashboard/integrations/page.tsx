"use client";

import { useState } from "react";
import { RefreshCw, Zap, CheckCircle, AlertTriangle, XCircle,
         Clock, ChevronDown, ChevronUp, Loader2, Plug } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import {
  useIntegrationSummary,
  useRecentSyncRuns,
  useSyncJobs,
  useTriggerSync,
} from "@/lib/hooks/use-integrations";
import {
  deriveTrafficLight,
  INTEGRATION_ICONS,
  type IntegrationSummary,
  type SyncJob,
  type SyncRun,
  type TrafficLight,
} from "@/types/integrations";

// ─── Formatting helpers ────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)       return "Just now";
  if (diff < 3600)     return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)    return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatDuration(secs: number | null): string {
  if (!secs) return "—";
  if (secs < 60) return `${Math.round(secs)}s`;
  return `${Math.floor(secs / 60)}m ${Math.round(secs % 60)}s`;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ─── Traffic light components ─────────────────────────────────────────────────

const trafficDot: Record<TrafficLight, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-400 animate-pulse",
  red:   "bg-red-500",
  grey:  "bg-muted-foreground/40",
};

const trafficLabel: Record<TrafficLight, string> = {
  green: "Healthy",
  amber: "Warning",
  red:   "Failed",
  grey:  "Not configured",
};

const trafficText: Record<TrafficLight, string> = {
  green: "text-emerald-400",
  amber: "text-amber-400",
  red:   "text-red-400",
  grey:  "text-muted-foreground",
};

const trafficBorder: Record<TrafficLight, string> = {
  green: "border-emerald-500/20",
  amber: "border-amber-400/20",
  red:   "border-red-500/20",
  grey:  "border-border",
};

// ─── Run status badge ─────────────────────────────────────────────────────────

function RunStatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const styles: Record<string, string> = {
    success: "bg-emerald-500/10 text-emerald-400",
    partial: "bg-amber-400/10 text-amber-400",
    failed:  "bg-red-500/10 text-red-400",
    running: "bg-violet-500/10 text-violet-400",
  };
  const icons: Record<string, React.ReactNode> = {
    success: <CheckCircle className="h-3 w-3" />,
    partial: <AlertTriangle className="h-3 w-3" />,
    failed:  <XCircle className="h-3 w-3" />,
    running: <Loader2 className="h-3 w-3 animate-spin" />,
  };
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold",
      styles[status] ?? "bg-muted text-muted-foreground")}>
      {icons[status]}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ─── Sync Jobs expander panel ──────────────────────────────────────────────────

function JobsPanel({
  integrationKey,
  onTrigger,
  triggeringJobId,
}: {
  integrationKey: string;
  onTrigger: (jobId: number) => void;
  triggeringJobId: number | null;
}) {
  const { data: jobs = [], isLoading } = useSyncJobs(integrationKey);

  if (isLoading) return (
    <div className="h-12 rounded-lg skeleton mx-4 mb-4" />
  );

  return (
    <div className="px-4 pb-4 pt-2 border-t border-border/40 space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
        Sync Jobs
      </p>
      {jobs.map((j: SyncJob) => (
        <div key={j.id}
          className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-background/60 border border-border/40">
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium text-foreground">{j.display_label}</p>
            <p className="text-[11px] text-muted-foreground">
              {j.schedule_label ?? "Manual only"} ·{" "}
              {j.watermark_value
                ? `Last: ${relativeTime(j.watermark_value)}`
                : "Never synced"}
            </p>
          </div>
          <button
            onClick={() => onTrigger(j.id)}
            disabled={triggeringJobId === j.id}
            className="flex items-center gap-1.5 h-7 px-3 rounded-md bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {triggeringJobId === j.id
              ? <><Loader2 className="h-3 w-3 animate-spin" /> Syncing…</>
              : <><Zap className="h-3 w-3" /> Sync Now</>}
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Integration Card ─────────────────────────────────────────────────────────

function IntegrationCard({
  s,
  expanded,
  onToggle,
}: {
  s: IntegrationSummary;
  expanded: boolean;
  onToggle: () => void;
}) {
  const light  = deriveTrafficLight(s);
  const icon   = INTEGRATION_ICONS[s.integration_key] ?? "🔌";
  const { mutate: trigger, isPending } = useTriggerSync();
  const [triggeringJobId, setTriggeringJobId] = useState<number | null>(null);

  const handleTrigger = (jobId: number) => {
    setTriggeringJobId(jobId);
    trigger(jobId, {
      onSettled: () => setTriggeringJobId(null),
    });
  };

  return (
    <div className={cn(
      "rounded-xl border bg-card transition-colors",
      trafficBorder[light],
    )}>
      {/* Card header */}
      <button
        onClick={onToggle}
        className="w-full text-left p-4 sm:p-5"
      >
        <div className="flex items-start gap-4">
          {/* Icon + traffic light */}
          <div className="flex flex-col items-center gap-2 pt-0.5">
            <span className="text-2xl leading-none">{icon}</span>
            <span className={cn("h-2 w-2 rounded-full flex-shrink-0", trafficDot[light])} />
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <p className="text-[16px] font-bold text-foreground">{s.display_name}</p>
                <span className={cn("text-[11px] font-semibold", trafficText[light])}>
                  {s.latest_is_running ? "Syncing…" : trafficLabel[light]}
                </span>
              </div>
              {expanded
                ? <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                : <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
            </div>

            <p className="text-[12px] text-muted-foreground mt-0.5 mb-3">{s.description}</p>

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCell
                label="Last success"
                value={relativeTime(s.last_success_at)}
                highlight={light === "green"}
              />
              <StatCell
                label="Last failure"
                value={relativeTime(s.last_failure_at)}
                highlight={light === "red" && !!s.last_failure_at}
                danger={!!s.last_failure_at}
              />
              <StatCell
                label="Records synced"
                value={formatCount(s.total_records_inserted + s.total_records_updated)}
              />
              <StatCell
                label="Avg duration"
                value={formatDuration(s.avg_duration_secs)}
              />
            </div>

            {/* Failure error */}
            {s.last_failure_error && light === "red" && (
              <p className="mt-2 text-[11px] text-red-400 bg-red-500/5 border border-red-500/15 rounded-md px-2.5 py-1.5 truncate">
                {s.last_failure_error}
              </p>
            )}
          </div>
        </div>
      </button>

      {/* Expanded jobs panel */}
      {expanded && (
        <JobsPanel
          integrationKey={s.integration_key}
          onTrigger={handleTrigger}
          triggeringJobId={isPending ? triggeringJobId : null}
        />
      )}
    </div>
  );
}

function StatCell({
  label, value, highlight, danger,
}: {
  label: string; value: string; highlight?: boolean; danger?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={cn("text-[13px] font-semibold mt-0.5",
        danger     ? "text-red-400" :
        highlight  ? "text-emerald-400" :
                     "text-foreground"
      )}>
        {value}
      </p>
    </div>
  );
}

// ─── Recent Runs Table ────────────────────────────────────────────────────────

function RecentRunsTable({ runs, isLoading }: { runs: SyncRun[]; isLoading: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-5 py-3.5 border-b border-border">
        <p className="text-[14px] font-semibold text-foreground">Recent Sync Runs</p>
        <p className="text-[12px] text-muted-foreground mt-0.5">Last 25 runs across all integrations</p>
      </div>

      {isLoading ? (
        <div className="h-40 m-4 rounded-lg skeleton" />
      ) : runs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Clock className="h-8 w-8 text-muted-foreground mb-3 opacity-40" />
          <p className="text-[14px] font-semibold text-foreground">No sync runs yet</p>
          <p className="text-[12px] text-muted-foreground">Run a manual sync or wait for the schedule to kick in.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/60">
                {["Integration","Entity","Trigger","Status","Started","Duration","Inserted","Updated","Failed"].map((h) => (
                  <th key={h}
                    className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-border/30 hover:bg-accent/20">
                  <td className="px-3 py-2 text-[12px] font-medium text-foreground whitespace-nowrap">
                    {INTEGRATION_ICONS[r.integration_key]} {r.display_name}
                  </td>
                  <td className="px-3 py-2 text-[12px] text-muted-foreground capitalize">
                    {r.entity_type.replace(/_/g, " ")}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-muted-foreground capitalize">
                    {r.triggered_by}
                  </td>
                  <td className="px-3 py-2">
                    <RunStatusBadge status={r.status} />
                  </td>
                  <td className="px-3 py-2 text-[12px] text-muted-foreground whitespace-nowrap">
                    {relativeTime(r.started_at)}
                  </td>
                  <td className="px-3 py-2 text-[12px] text-muted-foreground tabular-nums">
                    {formatDuration(r.duration_secs)}
                  </td>
                  <td className="px-3 py-2 text-[12px] tabular-nums text-emerald-400 font-medium">
                    {r.records_inserted > 0 ? `+${r.records_inserted}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-[12px] tabular-nums text-foreground">
                    {r.records_updated > 0 ? r.records_updated : "—"}
                  </td>
                  <td className="px-3 py-2 text-[12px] tabular-nums">
                    {r.records_failed > 0
                      ? <span className="text-red-400 font-semibold">{r.records_failed}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Health summary bar ───────────────────────────────────────────────────────

function HealthBar({ integrations }: { integrations: IntegrationSummary[] }) {
  const lights = integrations.map(deriveTrafficLight);
  const green  = lights.filter((l) => l === "green").length;
  const amber  = lights.filter((l) => l === "amber").length;
  const red    = lights.filter((l) => l === "red").length;
  const grey   = lights.filter((l) => l === "grey").length;

  return (
    <div className="flex items-center gap-4 flex-wrap">
      {green > 0 && (
        <span className="flex items-center gap-1.5 text-[12px] font-medium text-emerald-400">
          <CheckCircle className="h-3.5 w-3.5" /> {green} healthy
        </span>
      )}
      {amber > 0 && (
        <span className="flex items-center gap-1.5 text-[12px] font-medium text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" /> {amber} warning
        </span>
      )}
      {red > 0 && (
        <span className="flex items-center gap-1.5 text-[12px] font-medium text-red-400">
          <XCircle className="h-3.5 w-3.5" /> {red} failed
        </span>
      )}
      {grey > 0 && (
        <span className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
          <Plug className="h-3.5 w-3.5" /> {grey} not configured
        </span>
      )}
    </div>
  );
}

// ─── Static fallback — always visible even before migration is applied ────────

const STATIC_INTEGRATIONS: IntegrationSummary[] = [
  {
    integration_key: "woocommerce",
    display_name: "WooCommerce",
    description: "Pull orders, products, and customers from the WooCommerce store REST API",
    is_enabled: false, connection_status: "unconfigured", last_tested_at: null,
    active_job_count: 3,
    last_success_at: null, last_success_inserted: 0, last_success_updated: 0,
    last_failure_at: null, last_failure_error: null,
    total_records_inserted: 0, total_records_updated: 0, total_records_failed: 0,
    avg_duration_secs: null,
    latest_run_id: null, latest_run_status: null,
    latest_run_started: null, latest_run_entity: null, latest_is_running: false,
  },
  {
    integration_key: "shiprocket",
    display_name: "Shiprocket",
    description: "Sync shipment status, AWB tracking, COD remittances, and RTO events",
    is_enabled: false, connection_status: "unconfigured", last_tested_at: null,
    active_job_count: 2,
    last_success_at: null, last_success_inserted: 0, last_success_updated: 0,
    last_failure_at: null, last_failure_error: null,
    total_records_inserted: 0, total_records_updated: 0, total_records_failed: 0,
    avg_duration_secs: null,
    latest_run_id: null, latest_run_status: null,
    latest_run_started: null, latest_run_entity: null, latest_is_running: false,
  },
  {
    integration_key: "razorpay",
    display_name: "Razorpay",
    description: "Sync prepaid payment records and settlement batches from Razorpay",
    is_enabled: false, connection_status: "unconfigured", last_tested_at: null,
    active_job_count: 2,
    last_success_at: null, last_success_inserted: 0, last_success_updated: 0,
    last_failure_at: null, last_failure_error: null,
    total_records_inserted: 0, total_records_updated: 0, total_records_failed: 0,
    avg_duration_secs: null,
    latest_run_id: null, latest_run_status: null,
    latest_run_started: null, latest_run_entity: null, latest_is_running: false,
  },
  {
    integration_key: "gokwik",
    display_name: "GoKwik",
    description: "Sync GoKwik prepaid orders and gateway settlements",
    is_enabled: false, connection_status: "unconfigured", last_tested_at: null,
    active_job_count: 1,
    last_success_at: null, last_success_inserted: 0, last_success_updated: 0,
    last_failure_at: null, last_failure_error: null,
    total_records_inserted: 0, total_records_updated: 0, total_records_failed: 0,
    avg_duration_secs: null,
    latest_run_id: null, latest_run_status: null,
    latest_run_started: null, latest_run_entity: null, latest_is_running: false,
  },
  {
    integration_key: "bank_feed",
    display_name: "Bank Feed",
    description: "Ingest HDFC bank transactions via Account Aggregator or statement upload",
    is_enabled: false, connection_status: "unconfigured", last_tested_at: null,
    active_job_count: 1,
    last_success_at: null, last_success_inserted: 0, last_success_updated: 0,
    last_failure_at: null, last_failure_error: null,
    total_records_inserted: 0, total_records_updated: 0, total_records_failed: 0,
    avg_duration_secs: null,
    latest_run_id: null, latest_run_status: null,
    latest_run_started: null, latest_run_entity: null, latest_is_running: false,
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const { data: liveData, isLoading: intLoading, isError, refetch } =
    useIntegrationSummary();
  const { data: runs = [], isLoading: runsLoading } = useRecentSyncRuns();
  const [expanded, setExpanded] = useState<string | null>(null);

  const toggle = (key: string) => setExpanded((p) => (p === key ? null : key));

  // Use live data if available; fall back to static list (pre-migration or RPC error)
  const integrations: IntegrationSummary[] =
    liveData && liveData.length > 0 ? liveData : STATIC_INTEGRATIONS;

  return (
    <div className="min-h-full p-4 sm:p-6 space-y-6">
      <PageHeader
        title="Integrations"
        subtitle="Live API sync status · auto-refreshes every 30 s"
      >
        <div className="flex items-center gap-3 flex-wrap">
          {!intLoading && <HealthBar integrations={integrations} />}
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </PageHeader>

      {/* Migration notice — shown only when RPC isn't available yet */}
      {isError && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5">
          <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-[13px] font-semibold text-amber-400">Migration not yet applied</p>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Apply <code className="text-[11px] bg-muted px-1 py-0.5 rounded">supabase/migrations/20260620_integrations_schema.sql</code>{" "}
              in Supabase SQL Editor to activate live sync status. Showing static layout below.
            </p>
          </div>
        </div>
      )}

      {/* Integration cards */}
      {intLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-32 rounded-xl skeleton" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {integrations.map((s) => (
            <IntegrationCard
              key={s.integration_key}
              s={s}
              expanded={expanded === s.integration_key}
              onToggle={() => toggle(s.integration_key)}
            />
          ))}
        </div>
      )}

      {/* Recent runs */}
      <RecentRunsTable runs={runs} isLoading={runsLoading} />

      {/* Setup note */}
      <div className="rounded-xl border border-border bg-card/50 p-4">
        <div className="flex items-start gap-2.5">
          <Plug className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-[12px] font-semibold text-foreground mb-1">
              Activating an integration
            </p>
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              Store API credentials in{" "}
              <code className="text-[11px] bg-muted px-1 py-0.5 rounded">Supabase Vault</code>{" "}
              under the key name shown in{" "}
              <code className="text-[11px] bg-muted px-1 py-0.5 rounded">integration_settings.secret_ref</code>,
              then set{" "}
              <code className="text-[11px] bg-muted px-1 py-0.5 rounded">is_enabled = true</code>{" "}
              and{" "}
              <code className="text-[11px] bg-muted px-1 py-0.5 rounded">connection_status = 'ok'</code>{" "}
              for that row. Deploy the matching Edge Function via the Supabase CLI.
              See <code className="text-[11px] bg-muted px-1 py-0.5 rounded">docs/INTEGRATIONS_ARCHITECTURE.md</code>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
