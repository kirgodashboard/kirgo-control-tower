"use client";

import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  RefreshCw,
  Play,
  Settings2,
  Loader2,
  ChevronDown,
  ChevronUp,
  ToggleLeft,
  ToggleRight,
  ShieldCheck,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";
import { fetchIntegrationSummary } from "@/lib/data/integrations";
import { formatDate } from "@/lib/utils/format";
import {
  type IntegrationSummary,
  type ConnectionStatus,
  CREDENTIAL_SCHEMAS,
  INTEGRATION_ICONS,
} from "@/types/integrations";

// ── constants ─────────────────────────────────────────────────────────────────

const INTEGRATION_ORDER = ["woocommerce", "shiprocket", "razorpay", "gokwik", "ccavenue", "bank_feed"];

const INTEGRATION_DISPLAY: Record<string, { name: string; description: string }> = {
  woocommerce: { name: "WooCommerce",  description: "Pull orders, products and customers from your WooCommerce store" },
  shiprocket:  { name: "Shiprocket",   description: "Sync shipment status, AWB tracking, COD remittances and RTO events" },
  razorpay:    { name: "Razorpay",     description: "Sync prepaid payment records and settlement batches" },
  gokwik:      { name: "GoKwik",       description: "Sync GoKwik prepaid orders and gateway settlements" },
  ccavenue:    { name: "CCAvenue",     description: "Sync CCAvenue payment gateway transactions and settlements" },
  bank_feed:   { name: "Bank Feed",    description: "CSV/XLSX statement upload for HDFC, ICICI, Axis, SBI and more" },
};

const COMING_SOON = [
  { key: "hdfc_direct",     icon: "🏦", name: "HDFC Bank (Direct API)",  description: "Real-time transaction feed via HDFC corporate banking API" },
  { key: "meta_ads",        icon: "📘", name: "Meta Ads",                description: "Sync ad spend, impressions and ROAS from Meta Ads Manager" },
  { key: "google_ads",      icon: "🎯", name: "Google Ads",              description: "Import campaign spend, conversions and keyword performance" },
  { key: "google_analytics",icon: "📈", name: "Google Analytics 4",      description: "Pull sessions, conversions and attribution data from GA4" },
];

// ── status helpers ────────────────────────────────────────────────────────────

function StatusBadge({ status, isRunning }: { status: ConnectionStatus; isRunning: boolean }) {
  if (isRunning) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-amber-400/10 text-amber-400 border-amber-400/20">
        <Loader2 className="h-3 w-3 animate-spin" /> Syncing
      </span>
    );
  }
  switch (status) {
    case "ok":
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
          <CheckCircle2 className="h-3 w-3" /> Connected
        </span>
      );
    case "error":
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-red-500/10 text-red-400 border-red-500/20">
          <XCircle className="h-3 w-3" /> Error
        </span>
      );
    case "rate_limited":
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-amber-400/10 text-amber-400 border-amber-400/20">
          <AlertCircle className="h-3 w-3" /> Rate Limited
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-muted text-muted-foreground border-border">
          <Clock className="h-3 w-3" /> Not configured
        </span>
      );
  }
}

// ── credential form ───────────────────────────────────────────────────────────

function CredentialForm({
  integrationKey,
  onSaved,
  onCancel,
}: {
  integrationKey: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const fields = CREDENTIAL_SCHEMAS[integrationKey] ?? [];
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f.key, ""])),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(`/api/settings/integrations/${integrationKey}/credentials`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ credentials: values }),
        });
        const json = await res.json().catch(() => ({ success: false, error: `Server error (${res.status}) — check SUPABASE_SERVICE_ROLE_KEY env var` }));
        if (!res.ok || !json.success) throw new Error(json.error ?? "Failed to save");
        onSaved();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setSaving(false);
      }
    },
    [integrationKey, values, onSaved],
  );

  if (fields.length === 0) {
    return (
      <div className="px-5 py-4 bg-muted/30 border-t border-border rounded-b-xl">
        <p className="text-[12px] text-muted-foreground flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-500 flex-shrink-0" />
          Bank Feed uses statement file upload — no API credentials required.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="px-5 py-4 bg-muted/20 border-t border-border rounded-b-xl space-y-3"
    >
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
        API Credentials
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {fields.map((field) => (
          <div key={field.key} className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">
              {field.label}
              {field.required && <span className="text-red-400 ml-0.5">*</span>}
            </label>
            <input
              type={field.type}
              value={values[field.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
              placeholder={field.placeholder}
              required={field.required}
              autoComplete="off"
              className="w-full h-8 px-3 rounded-md border border-border bg-background text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>
        ))}
      </div>
      {error && (
        <p className="text-[12px] text-red-400 flex items-center gap-1.5">
          <XCircle className="h-3.5 w-3.5" /> {error}
        </p>
      )}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="h-8 px-4 rounded-md bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-[12px] font-semibold transition-colors flex items-center gap-1.5"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {saving ? "Saving…" : "Save Credentials"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-8 px-3 rounded-md border border-border text-[12px] text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
        <span className="ml-auto text-[10px] text-muted-foreground flex items-center gap-1">
          <ShieldCheck className="h-3 w-3 text-emerald-500" />
          Stored in Supabase Vault — never plaintext
        </span>
      </div>
    </form>
  );
}

// ── integration card ──────────────────────────────────────────────────────────

function IntegrationCard({ integration }: { integration: IntegrationSummary }) {
  const queryClient = useQueryClient();
  const [configOpen, setConfigOpen] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const meta = INTEGRATION_DISPLAY[integration.integration_key] ?? {
    name: integration.display_name,
    description: integration.description,
  };
  const icon = INTEGRATION_ICONS[integration.integration_key] ?? "🔌";

  async function handleToggle() {
    if (toggling) return;
    setToggling(true);
    const newEnabled = !integration.is_enabled;
    try {
      const res = await fetch(`/api/settings/integrations/${integration.integration_key}/toggle`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ enabled: newEnabled }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) console.error("[toggle]", json.error);
    } finally {
      setToggling(false);
      await queryClient.invalidateQueries({ queryKey: ["integration-summary-settings"] });
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/settings/integrations/${integration.integration_key}/test`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({}),
      });
      const json = await res.json();
      setTestResult({
        ok:  json.success === true,
        msg: json.success ? "Connection successful" : (json.error ?? "Connection failed"),
      });
    } catch {
      setTestResult({ ok: false, msg: "Request failed" });
    } finally {
      setTesting(false);
      await queryClient.invalidateQueries({ queryKey: ["integration-summary-settings"] });
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      await fetch(`/api/settings/integrations/${integration.integration_key}/sync`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({}),
      });
    } finally {
      setSyncing(false);
      await queryClient.invalidateQueries({ queryKey: ["integration-summary-settings"] });
    }
  }

  const isBankFeed = integration.integration_key === "bank_feed";
  const lastSync = integration.last_success_at ?? integration.latest_run_started;
  const hasSecret = integration.secret_configured;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Card header */}
      <div className="px-5 py-4 flex items-start gap-4">
        {/* Icon */}
        <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center text-[20px] flex-shrink-0">
          {icon}
        </div>

        {/* Name + status */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[14px] font-semibold text-foreground">{meta.name}</h3>
            <StatusBadge
              status={integration.connection_status}
              isRunning={integration.latest_is_running}
            />
            {hasSecret && (
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-500">
                <ShieldCheck className="h-3 w-3" /> Vault
              </span>
            )}
          </div>
          <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">{meta.description}</p>
          {lastSync && (
            <p className="text-[11px] text-muted-foreground mt-1">
              Last sync: <span className="text-foreground">{formatDate(lastSync)}</span>
            </p>
          )}
        </div>

        {/* Enable toggle */}
        <button
          onClick={handleToggle}
          disabled={toggling}
          title={integration.is_enabled ? "Disable integration" : "Enable integration"}
          className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          {toggling
            ? <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
            : integration.is_enabled
              ? <ToggleRight className="h-7 w-7 text-violet-500" />
              : <ToggleLeft  className="h-7 w-7" />
          }
        </button>
      </div>

      {/* Test result banner */}
      {testResult && (
        <div className={cn(
          "mx-5 mb-3 px-3 py-2 rounded-lg text-[12px] flex items-center gap-2",
          testResult.ok
            ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
            : "bg-red-500/10 text-red-400 border border-red-500/20",
        )}>
          {testResult.ok
            ? <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
            : <XCircle      className="h-3.5 w-3.5 flex-shrink-0" />
          }
          {testResult.msg}
        </div>
      )}

      {/* Action bar */}
      <div className="px-5 pb-4 flex items-center gap-2 flex-wrap">
        {!isBankFeed && (
          <button
            onClick={handleTest}
            disabled={testing}
            className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50 transition-colors"
          >
            {testing
              ? <Loader2  className="h-3.5 w-3.5 animate-spin" />
              : <CheckCircle2 className="h-3.5 w-3.5" />
            }
            Test Connection
          </button>
        )}

        {!isBankFeed && (
          <button
            onClick={handleSync}
            disabled={syncing || integration.latest_is_running}
            className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50 transition-colors"
          >
            {(syncing || integration.latest_is_running)
              ? <Loader2    className="h-3.5 w-3.5 animate-spin" />
              : <Play       className="h-3.5 w-3.5" />
            }
            Sync Now
          </button>
        )}

        <button
          onClick={() => { setConfigOpen((o) => !o); setTestResult(null); }}
          className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-violet-500/30 bg-violet-500/5 text-[12px] text-violet-400 hover:bg-violet-500/10 transition-colors"
        >
          <Settings2 className="h-3.5 w-3.5" />
          Configure
          {configOpen
            ? <ChevronUp   className="h-3 w-3" />
            : <ChevronDown className="h-3 w-3" />
          }
        </button>

        {/* Sync stats */}
        {integration.active_job_count > 0 && (
          <span className="ml-auto text-[11px] text-muted-foreground">
            {integration.active_job_count} job{integration.active_job_count !== 1 ? "s" : ""}
            {integration.total_records_inserted > 0 && (
              <> · {integration.total_records_inserted.toLocaleString()} records</>
            )}
          </span>
        )}
      </div>

      {/* Expandable credential form */}
      {configOpen && (
        <CredentialForm
          integrationKey={integration.integration_key}
          onSaved={async () => {
            setConfigOpen(false);
            await queryClient.invalidateQueries({ queryKey: ["integration-summary-settings"] });
          }}
          onCancel={() => setConfigOpen(false)}
        />
      )}
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function IntegrationSettingsPage() {
  const queryClient = useQueryClient();

  const { data: integrations = [], isLoading, refetch } = useQuery({
    queryKey: ["integration-summary-settings"],
    queryFn:  fetchIntegrationSummary,
    staleTime: 30_000,
  });

  // Ensure all 6 integrations are shown even before DB rows exist
  const allKeys = INTEGRATION_ORDER;
  const byKey = Object.fromEntries(integrations.map((i) => [i.integration_key, i]));

  const rows: IntegrationSummary[] = allKeys.map(
    (key) =>
      byKey[key] ?? {
        integration_key:        key,
        display_name:           INTEGRATION_DISPLAY[key]?.name ?? key,
        description:            INTEGRATION_DISPLAY[key]?.description ?? "",
        is_enabled:             false,
        connection_status:      "unconfigured" as const,
        last_tested_at:         null,
        secret_configured:      false,
        active_job_count:       0,
        last_success_at:        null,
        last_success_inserted:  0,
        last_success_updated:   0,
        last_failure_at:        null,
        last_failure_error:     null,
        total_records_inserted: 0,
        total_records_updated:  0,
        total_records_failed:   0,
        avg_duration_secs:      null,
        latest_run_id:          null,
        latest_run_status:      null,
        latest_run_started:     null,
        latest_run_entity:      null,
        latest_is_running:      false,
      },
  );

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        title="Integrations"
        subtitle="Configure API credentials, test connections, and manage sync schedules"
      >
        <button
          onClick={() => { refetch(); queryClient.invalidateQueries({ queryKey: ["integration-summary-settings"] }); }}
          className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </PageHeader>

      {/* Security notice */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04]">
        <ShieldCheck className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
        <p className="text-[12px] text-muted-foreground leading-relaxed">
          All credentials are encrypted with AES-256 and stored exclusively in{" "}
          <span className="text-foreground font-medium">Supabase Vault</span>.
          Only secret references (not raw keys) appear in the database.
          Credentials are never logged or returned by API routes.
        </p>
      </div>

      {/* Live integration cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-40 rounded-xl skeleton" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {rows.map((integration) => (
            <IntegrationCard key={integration.integration_key} integration={integration} />
          ))}
        </div>
      )}

      {/* Coming Soon */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Coming Soon
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {COMING_SOON.map(({ key, icon, name, description }) => (
            <div
              key={key}
              className="rounded-xl border border-dashed border-border bg-card/50 px-5 py-4 flex items-start gap-4 opacity-60"
            >
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center text-[20px] flex-shrink-0">
                {icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-[14px] font-semibold text-foreground">{name}</h3>
                  <span className="px-1.5 py-0.5 rounded-md bg-muted text-[10px] font-semibold text-muted-foreground border border-border">
                    Coming Soon
                  </span>
                </div>
                <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
