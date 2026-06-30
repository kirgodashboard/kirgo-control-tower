"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Megaphone, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { ExecKpiRow } from "@/features/executive/kpi-row";
import { PaymentSplitDonut } from "@/features/executive/payment-split-donut";
import { CustomerKpiRow } from "@/features/customers/kpi-row";
import { TopCitiesTable } from "@/features/customers/top-cities-table";
import { OpsKpiRow } from "@/features/operations/kpi-row";
import { ProfitabilityKpiRow } from "@/features/profitability/kpi-row";
import { AlertPanel } from "@/features/director/alert-panel";
import { ForecastInsightCards } from "@/features/director/forecast-cards";
import { KpiCard } from "@/components/ui/kpi-card";
import { useInventoryKpis } from "@/lib/hooks/use-inventory";
import { useBankKpis } from "@/lib/hooks/use-bank";
import { usePeriodComparison } from "@/lib/hooks/use-executive";
import { useProfitabilityKpis } from "@/lib/hooks/use-profitability";
import { formatINR, formatCount, formatPct } from "@/lib/utils/format";
import { getReviewPeriodDates } from "@/lib/utils/date-ranges";
import type { ReviewPeriod } from "@/lib/utils/date-ranges";

const PERIODS: { key: ReviewPeriod; label: string }[] = [
  { key: "today",      label: "Today"       },
  { key: "yesterday",  label: "Yesterday"   },
  { key: "7d",         label: "7 Days"      },
  { key: "30d",        label: "30 Days"     },
  { key: "60d",        label: "60 Days"     },
  { key: "90d",        label: "90 Days"     },
  { key: "mtd",        label: "This Month"  },
  { key: "prev_month", label: "Prev Month"  },
  { key: "fy",         label: "Fin. Year"   },
  { key: "all",        label: "All Time"    },
];

const SECTIONS = [
  { id: "exec",         label: "Executive"     },
  { id: "sales",        label: "Sales"         },
  { id: "customers",    label: "Customers"     },
  { id: "inventory",    label: "Inventory"     },
  { id: "operations",   label: "Operations"    },
  { id: "marketing",    label: "Marketing"     },
  { id: "forecasting",  label: "Forecasting"   },
  { id: "data-quality", label: "Data Quality"  },
  { id: "profitability",label: "Profitability" },
  { id: "banking",      label: "Bank & Cash"   },
];

export default function BusinessReviewPage() {
  const [period, setPeriod] = useState<ReviewPeriod>("30d");
  const dr = getReviewPeriodDates(period);

  return (
    <div className="min-h-full">
      {/* ── Sticky Header ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-3 px-4 sm:px-6 pt-3 pb-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground flex-shrink-0">
            Period
          </span>
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
            {PERIODS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setPeriod(key)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap flex-shrink-0",
                  period === key
                    ? "bg-violet-500/20 text-violet-400 border border-violet-500/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-muted-foreground hidden sm:block flex-shrink-0 ml-auto">
            {dr.label}
          </span>
        </div>
        <div className="flex items-center gap-0.5 px-4 sm:px-6 pb-2 overflow-x-auto scrollbar-hide">
          {SECTIONS.map(({ id, label }) => (
            <a
              key={id}
              href={`#${id}`}
              className="px-2.5 py-1 rounded-md text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent whitespace-nowrap transition-colors"
            >
              {label}
            </a>
          ))}
        </div>
      </div>

      {/* ── Sections ──────────────────────────────────────────────────────── */}
      <div className="p-4 sm:p-6 space-y-10">

        {/* 1 · Executive Summary */}
        <section id="exec" className="scroll-mt-24 space-y-4">
          <SectionHeader label="Executive Summary" />
          <ExecKpiRow start={dr.start} end={dr.end} />
          <DrillDown href="/dashboard/executive" label="Full Executive Review" />
        </section>

        {/* 2 · Sales Performance */}
        <section id="sales" className="scroll-mt-24 space-y-4">
          <SectionHeader label="Sales Performance" />
          <SalesSection start={dr.start} end={dr.end} />
          <DrillDown href="/dashboard/sales-register" label="Orders Register" />
        </section>

        {/* 3 · Customer Intelligence */}
        <section id="customers" className="scroll-mt-24 space-y-4">
          <SectionHeader label="Customer Intelligence" />
          <CustomerKpiRow start={dr.start} end={dr.end} />
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
              Top Cities by Revenue
            </p>
            <TopCitiesTable />
          </div>
          <DrillDown href="/dashboard/customers" label="Customer Analytics" />
        </section>

        {/* 4 · Inventory Intelligence */}
        <section id="inventory" className="scroll-mt-24 space-y-4">
          <SectionHeader label="Inventory Intelligence" />
          <InventorySection />
          <DrillDown href="/dashboard/inventory" label="Stock & Inventory Register" />
        </section>

        {/* 5 · Operations & Fulfilment */}
        <section id="operations" className="scroll-mt-24 space-y-4">
          <SectionHeader label="Operations & Fulfilment" />
          <OpsKpiRow start={dr.start} end={dr.end} />
          <DrillDown href="/dashboard/logistics" label="Logistics Register" />
        </section>

        {/* 6 · Marketing & Channels */}
        <section id="marketing" className="scroll-mt-24 space-y-4">
          <SectionHeader label="Marketing & Channels" />
          <MarketingPlaceholder />
        </section>

        {/* 7 · Forecasting */}
        <section id="forecasting" className="scroll-mt-24 space-y-4">
          <SectionHeader label="Forecasting" />
          <ForecastInsightCards />
          <DrillDown href="/dashboard/forecasting" label="Full Forecast" />
        </section>

        {/* 8 · Data Quality & Exceptions */}
        <section id="data-quality" className="scroll-mt-24 space-y-4">
          <SectionHeader label="Data Quality & Exceptions" />
          <div className="rounded-xl border border-border bg-card p-4">
            <AlertPanel />
          </div>
          <DrillDown href="/dashboard/health" label="Health & Alerts Center" />
        </section>

        {/* 9 · Profitability */}
        <section id="profitability" className="scroll-mt-24 space-y-4">
          <SectionHeader label="Profitability" />
          <ProfitabilityKpiRow start={dr.start} end={dr.end} />
          <MiniWaterfall start={dr.start} end={dr.end} />
          <DrillDown href="/dashboard/profitability" label="Full P&L Analysis" />
        </section>

        {/* 10 · Bank & Cash Position */}
        <section id="banking" className="scroll-mt-24 space-y-4">
          <SectionHeader label="Bank & Cash Position" />
          <BankSection start={dr.start} end={dr.end} />
          <DrillDown href="/dashboard/banking" label="Banking Dashboard" />
        </section>

      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
      {label}
    </p>
  );
}

function DrillDown({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-center gap-2 py-2.5 rounded-lg border border-border/50 hover:border-violet-500/30 hover:bg-violet-500/5 text-[12px] text-muted-foreground hover:text-violet-400 transition-all group"
    >
      {label}
      <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
    </Link>
  );
}

// ── Sales Section ────────────────────────────────────────────────────────────

function SalesSection({ start, end }: { start: string; end: string }) {
  const { data: cmp, isLoading } = usePeriodComparison(start, end);

  const revChange = cmp?.revenue_change_pct ?? 0;
  const ordChange = cmp?.orders_change_pct ?? 0;
  const isRevUp = revChange >= 0;
  const isOrdUp = ordChange >= 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Period comparison cards */}
      <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
            Revenue vs Prior Period
          </p>
          {isLoading ? (
            <div className="h-16 rounded-lg animate-pulse bg-muted mt-2" />
          ) : (
            <>
              <p className="text-2xl font-bold tabular-nums text-foreground mt-2">
                {formatINR(cmp?.current_revenue ?? 0)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Prior: {formatINR(cmp?.prior_revenue ?? 0)}
              </p>
              <div className={cn(
                "flex items-center gap-1 mt-2 text-xs font-medium",
                isRevUp ? "text-emerald-500" : "text-red-500",
              )}>
                {isRevUp
                  ? <TrendingUp className="h-3 w-3" />
                  : <TrendingDown className="h-3 w-3" />}
                {isRevUp ? "+" : ""}{formatPct(Math.abs(revChange))} vs prior period
              </div>
            </>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
            Orders vs Prior Period
          </p>
          {isLoading ? (
            <div className="h-16 rounded-lg animate-pulse bg-muted mt-2" />
          ) : (
            <>
              <p className="text-2xl font-bold tabular-nums text-foreground mt-2">
                {formatCount(cmp?.current_orders ?? 0)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Prior: {formatCount(cmp?.prior_orders ?? 0)}
              </p>
              <div className={cn(
                "flex items-center gap-1 mt-2 text-xs font-medium",
                isOrdUp ? "text-emerald-500" : "text-red-500",
              )}>
                {isOrdUp
                  ? <TrendingUp className="h-3 w-3" />
                  : <TrendingDown className="h-3 w-3" />}
                {isOrdUp ? "+" : ""}{formatPct(Math.abs(ordChange))} vs prior period
              </div>
            </>
          )}
        </div>
      </div>

      {/* Payment split */}
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
          Payment Mix
        </p>
        <PaymentSplitDonut start={start} end={end} />
      </div>
    </div>
  );
}

// ── Inventory Section ────────────────────────────────────────────────────────

function InventorySection() {
  const { data: kpis, isLoading } = useInventoryKpis();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <KpiCard
        label="Total SKUs"
        value={formatCount(kpis?.total_skus ?? 0)}
        href="/dashboard/inventory"
      />
      <KpiCard
        label="Total Units"
        value={formatCount(kpis?.total_units ?? 0)}
        href="/dashboard/inventory"
      />
      <KpiCard
        label="Stock Value"
        value={formatINR(kpis?.stock_value_inr ?? 0)}
        href="/dashboard/inventory"
      />
      <KpiCard
        label="Low Stock"
        value={formatCount(kpis?.low_stock_count ?? 0)}
        alert={kpis && kpis.low_stock_count > 0 ? "amber" : undefined}
        href="/dashboard/inventory"
      />
      <KpiCard
        label="Out of Stock"
        value={formatCount(kpis?.out_of_stock_count ?? 0)}
        alert={kpis && kpis.out_of_stock_count > 0 ? "red" : undefined}
        href="/dashboard/inventory"
      />
    </div>
  );
}

// ── Marketing Placeholder ────────────────────────────────────────────────────

function MarketingPlaceholder() {
  return (
    <div className="rounded-xl border border-dashed border-border/60 bg-card/40 p-10 text-center">
      <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-muted mx-auto mb-3">
        <Megaphone className="h-5 w-5 text-muted-foreground/50" />
      </div>
      <p className="text-sm font-medium text-muted-foreground">Marketing & Channels</p>
      <p className="text-xs text-muted-foreground/60 mt-1 max-w-xs mx-auto">
        Connect ad platforms (Meta, Google, etc.) to see CAC, ROAS, and channel-level performance
      </p>
    </div>
  );
}

// ── Mini P&L Waterfall ───────────────────────────────────────────────────────

function MiniWaterfall({ start, end }: { start: string; end: string }) {
  const { data: kpis, isLoading } = useProfitabilityKpis(start, end);

  if (isLoading) return <div className="h-40 rounded-xl animate-pulse bg-muted" />;
  if (!kpis) return null;

  const rows: { label: string; value: number; pct?: number; isMinus?: boolean; isTotal?: boolean }[] = [
    { label: "Recognised Revenue",     value: kpis.delivered_revenue_inr,    pct: 100,                          isTotal: true },
    { label: "COGS (landed cost)",      value: kpis.cogs_inr,                 pct: kpis.delivered_revenue_inr > 0 ? (kpis.cogs_inr / kpis.delivered_revenue_inr) * 100 : 0,                          isMinus: true },
    { label: "Gross Profit",            value: kpis.gross_profit_inr,         pct: kpis.gross_margin_pct,        isTotal: true },
    { label: "Ad Spend + Shipping",     value: kpis.ad_spend_inr + kpis.shipping_cost_inr + kpis.cod_charges_inr, pct: kpis.delivered_revenue_inr > 0 ? ((kpis.ad_spend_inr + kpis.shipping_cost_inr + kpis.cod_charges_inr) / kpis.delivered_revenue_inr) * 100 : 0, isMinus: true },
    { label: "Contribution Margin",     value: kpis.contribution_margin_inr,  pct: kpis.contribution_margin_pct, isTotal: true },
    { label: "Net Profit",              value: kpis.net_profit_inr,           pct: kpis.net_margin_pct,          isTotal: true },
  ];

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-4 pt-4 pb-2">
        <p className="text-[13px] font-semibold text-foreground">P&L Waterfall</p>
        <p className="text-[11px] text-muted-foreground/70 mt-0.5">Delivered revenue basis · click for full analysis</p>
      </div>
      {rows.map((row) => (
        <div
          key={row.label}
          className={cn(
            "flex items-center justify-between py-2.5 px-4",
            row.isTotal && !row.isMinus
              ? "border-t border-border/60 bg-muted/20"
              : "border-b border-border/20",
          )}
        >
          <div className="flex items-center gap-2">
            {row.isMinus && <span className="text-[11px] text-muted-foreground w-3">−</span>}
            {!row.isMinus && <span className="w-3" />}
            <span className={cn(
              "text-[12px]",
              row.isTotal ? "font-semibold text-foreground" : "text-muted-foreground",
            )}>
              {row.label}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {row.pct !== undefined && (
              <span className="text-[11px] text-muted-foreground tabular-nums w-12 text-right">
                {formatPct(row.pct)}
              </span>
            )}
            <span className={cn(
              "text-[12px] tabular-nums font-medium w-24 text-right",
              row.isTotal
                ? row.value >= 0 ? "text-emerald-400" : "text-red-400"
                : "text-muted-foreground",
            )}>
              {row.isMinus ? `(${formatINR(row.value)})` : formatINR(row.value)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Bank Section ─────────────────────────────────────────────────────────────

function BankSection({ start, end }: { start: string; end: string }) {
  const { data: kpis, isLoading } = useBankKpis(null, start, end);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  const unclassified = kpis?.unclassified_count ?? 0;
  const netFlow = kpis?.net_flow ?? 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <KpiCard
        label="Current Balance"
        value={kpis?.latest_balance != null ? formatINR(kpis.latest_balance) : "—"}
        href="/dashboard/banking"
      />
      <KpiCard
        label="Total Inflow"
        value={formatINR(kpis?.total_receipts ?? 0)}
        href="/dashboard/banking"
      />
      <KpiCard
        label="Total Outflow"
        value={formatINR(kpis?.total_payments ?? 0)}
        href="/dashboard/banking"
      />
      <KpiCard
        label="Net Flow"
        value={`${netFlow >= 0 ? "+" : ""}${formatINR(Math.abs(netFlow))}`}
        alert={netFlow < 0 ? "amber" : undefined}
        href="/dashboard/banking"
      />
      <KpiCard
        label="Unclassified"
        value={formatCount(unclassified)}
        subValue={unclassified > 0 ? `worth ${formatINR(kpis?.unclassified_amount ?? 0)}` : undefined}
        alert={unclassified > 5 ? "amber" : undefined}
        href="/dashboard/bank"
      />
    </div>
  );
}
