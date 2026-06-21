"use client";

import { ShieldCheck, AlertTriangle, CheckCircle2, XCircle, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { useSettingsDataQuality } from "@/lib/hooks/use-company";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

type Severity = "ok" | "warn" | "error";

interface CheckItem {
  label: string;
  value: number;
  unit: string;
  severity: Severity;
  href?: string;
  action: string;
}

function trafficLight(value: number, warn: number, error: number): Severity {
  if (value === 0) return "ok";
  if (value < warn) return "warn";
  if (value >= error) return "error";
  return "warn";
}

function SeverityIcon({ s }: { s: Severity }) {
  if (s === "ok")    return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (s === "warn")  return <AlertTriangle className="h-4 w-4 text-amber-400" />;
  return <XCircle className="h-4 w-4 text-red-400" />;
}

function SeverityBadge({ s, count }: { s: Severity; count: number }) {
  return (
    <span className={cn(
      "text-2xl font-bold tabular-nums",
      s === "ok"   ? "text-emerald-400" :
      s === "warn" ? "text-amber-400" :
      "text-red-400"
    )}>
      {count}
    </span>
  );
}

function CheckRow({ item }: { item: CheckItem }) {
  return (
    <div className={cn(
      "flex items-center justify-between gap-4 p-4 rounded-xl border transition-colors",
      item.severity === "ok"   ? "border-emerald-500/20 bg-emerald-500/5" :
      item.severity === "warn" ? "border-amber-500/20  bg-amber-500/5"  :
      "border-red-500/20 bg-red-500/5"
    )}>
      <div className="flex items-center gap-3">
        <SeverityIcon s={item.severity} />
        <div>
          <p className="text-sm font-medium text-foreground">{item.label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{item.action}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="text-right">
          <SeverityBadge s={item.severity} count={item.value} />
          <p className="text-[10px] text-muted-foreground">{item.unit}</p>
        </div>
        {item.href && item.value > 0 && (
          <Link
            href={item.href}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            Fix <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </div>
    </div>
  );
}

export default function SettingsDataQualityPage() {
  const { data, isLoading, isFetching } = useSettingsDataQuality();
  const qc = useQueryClient();

  const checks: CheckItem[] = data ? [
    {
      label:    "Unclassified Bank Transactions",
      value:    data.unclassified_bank_tx,
      unit:     "transactions",
      severity: trafficLight(data.unclassified_bank_tx, 10, 50),
      href:     "/dashboard/bank-classification",
      action:   "Withdrawals without an expense category",
    },
    {
      label:    "Unclassified Expenses",
      value:    data.unclassified_expenses,
      unit:     "expenses",
      severity: trafficLight(data.unclassified_expenses, 5, 20),
      href:     "/dashboard/expenses",
      action:   "Expenses with no head assigned",
    },
    {
      label:    "Failed Syncs (Last 7 Days)",
      value:    data.failed_syncs_7d,
      unit:     "failed runs",
      severity: trafficLight(data.failed_syncs_7d, 1, 5),
      href:     "/dashboard/integrations",
      action:   "Integration sync jobs that ended in error",
    },
    {
      label:    "Products Missing Cost Price",
      value:    data.products_missing_cost,
      unit:     "SKUs",
      severity: trafficLight(data.products_missing_cost, 5, 20),
      href:     "/dashboard/profitability",
      action:   "SKUs with no cost of goods configured",
    },
    {
      label:    "Orders Without Shipment",
      value:    data.orders_without_shipment,
      unit:     "orders (30d)",
      severity: trafficLight(data.orders_without_shipment, 10, 30),
      href:     "/dashboard/operations",
      action:   "Processing orders with no AWB assigned",
    },
  ] : [];

  const score = data
    ? Math.round((checks.filter(c => c.severity === "ok").length / checks.length) * 100)
    : 0;

  const overallSeverity: Severity = score === 100 ? "ok" : score >= 60 ? "warn" : "error";

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Data Quality"
        subtitle="Action items — resolve these to keep your dashboards accurate"
      >
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ["settings-data-quality"] })}
          disabled={isFetching}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
          Refresh
        </button>
      </PageHeader>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Score card */}
          <div className={cn(
            "rounded-xl border p-5 flex items-center gap-5",
            overallSeverity === "ok"   ? "border-emerald-500/30 bg-emerald-500/5" :
            overallSeverity === "warn" ? "border-amber-500/30  bg-amber-500/5"  :
            "border-red-500/30 bg-red-500/5",
          )}>
            <ShieldCheck className={cn(
              "h-10 w-10 flex-shrink-0",
              overallSeverity === "ok"   ? "text-emerald-400" :
              overallSeverity === "warn" ? "text-amber-400" :
              "text-red-400",
            )} />
            <div>
              <p className={cn(
                "text-3xl font-bold tabular-nums",
                overallSeverity === "ok"   ? "text-emerald-400" :
                overallSeverity === "warn" ? "text-amber-400" :
                "text-red-400",
              )}>
                {score}%
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {score === 100
                  ? "All checks passing — data is clean"
                  : `${checks.filter(c => c.severity !== "ok").length} of ${checks.length} checks need attention`
                }
              </p>
            </div>
          </div>

          {/* Checks */}
          <div className="space-y-3">
            {checks.map(c => <CheckRow key={c.label} item={c} />)}
          </div>

          {/* Link to full dashboard */}
          <div className="flex justify-end">
            <Link
              href="/dashboard/data-quality"
              className="flex items-center gap-1.5 text-sm text-violet-400 hover:text-violet-300 transition-colors"
            >
              View full data quality dashboard <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
