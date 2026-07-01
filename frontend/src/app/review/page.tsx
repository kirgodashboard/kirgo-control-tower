"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  ChevronDown, ArrowRight, Megaphone, TrendingUp, TrendingDown, CheckCircle,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ExecKpiRow } from "@/features/executive/kpi-row";
import { LaunchTable } from "@/features/executive/launch-table";
import { PaymentSplitDonut } from "@/features/executive/payment-split-donut";
import { CustomerKpiRow } from "@/features/customers/kpi-row";
import { TopCitiesTable } from "@/features/customers/top-cities-table";
import { CustomerGrowthChart } from "@/features/customers/growth-chart";
import { OpsKpiRow } from "@/features/operations/kpi-row";
import { ShipmentFunnelChart } from "@/features/operations/shipment-funnel-chart";
import { CodTable } from "@/features/operations/cod-table";
import { ProfitabilityKpiRow } from "@/features/profitability/kpi-row";
import { ProductPlTable } from "@/features/profitability/pl-tables";
import {
  RevenueCostChart, MarginTrendChart,
} from "@/features/profitability/profitability-charts";
import { AlertPanel } from "@/features/director/alert-panel";
import { ForecastInsightCards } from "@/features/director/forecast-cards";
import { KpiCard } from "@/components/ui/kpi-card";
import { useInventoryKpis, useStockAgeing, useReorderReport } from "@/lib/hooks/use-inventory";
import {
  useBankKpis, useBankAccounts, useBankDailyCashflow, useBankCategoryBreakdown,
} from "@/lib/hooks/use-bank";
import { useReceivablesKpis, useReceivablesAgeing } from "@/lib/hooks/use-receivables";
import { usePeriodComparison } from "@/lib/hooks/use-executive";
import { useProfitabilityKpis } from "@/lib/hooks/use-profitability";
import { formatINR, formatCount, formatPct } from "@/lib/utils/format";
import { getReviewPeriodDates } from "@/lib/utils/date-ranges";
import type { ReviewPeriod } from "@/lib/utils/date-ranges";

type ActivePeriod = ReviewPeriod | "custom";

const REVIEW_PERIODS: { key: ActivePeriod; label: string }[] = [
  { key: "today",      label: "Today"      },
  { key: "yesterday",  label: "Yesterday"  },
  { key: "7d",         label: "7 Days"     },
  { key: "30d",        label: "30 Days"    },
  { key: "60d",        label: "60 Days"    },
  { key: "90d",        label: "90 Days"    },
  { key: "mtd",        label: "This Month" },
  { key: "prev_month", label: "Prev Month" },
  { key: "fy",         label: "Fin. Year"  },
  { key: "all",        label: "All Time"   },
  { key: "custom",     label: "Custom"     },
];

const SECTIONS = [
  { id: "exec",          label: "Executive"     },
  { id: "sales",         label: "Sales"         },
  { id: "customers",     label: "Customers"     },
  { id: "inventory",     label: "Inventory"     },
  { id: "operations",    label: "Operations"    },
  { id: "receivables",   label: "Receivables"   },
  { id: "banking",       label: "Bank & Cash"   },
  { id: "profitability", label: "Profitability" },
  { id: "marketing",     label: "Marketing"     },
  { id: "forecasting",   label: "Forecasting"   },
  { id: "data-quality",  label: "Data Quality"  },
];

// ─────────────────────────────────────────────────────────────────────────────

function BusinessReviewContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const urlPeriod = (searchParams.get("period") as ActivePeriod) ?? "30d";
  const urlCs = searchParams.get("cs") ?? "";
  const urlCe = searchParams.get("ce") ?? "";
  const today = new Date().toISOString().slice(0, 10);

  const [period, setPeriod] = useState<ActivePeriod>(urlPeriod);
  const [customStart, setCustomStart] = useState(
    urlCs || new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10),
  );
  const [customEnd, setCustomEnd] = useState(urlCe || today);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [loadedSections, setLoadedSections] = useState<Set<string>>(new Set());

  const dr: { start: string; end: string; label: string } =
    period === "custom"
      ? {
          start: customStart,
          end: customEnd || today,
          label: `${customStart} → ${customEnd || today}`,
        }
      : getReviewPeriodDates(period as ReviewPeriod);

  const handlePeriodChange = (key: ActivePeriod) => {
    setPeriod(key);
    if (key === "custom") {
      router.replace(`/review?period=custom&cs=${customStart}&ce=${customEnd}`, { scroll: false });
    } else {
      router.replace(`/review?period=${key}`, { scroll: false });
    }
  };

  const handleCustomDate = (start: string, end: string) => {
    setCustomStart(start);
    setCustomEnd(end);
    router.replace(`/review?period=custom&cs=${start}&ce=${end}`, { scroll: false });
  };

  const toggleSection = (id: string) => {
    const willOpen = !openSections.has(id);
    setOpenSections(prev => {
      const next = new Set(prev);
      willOpen ? next.add(id) : next.delete(id);
      return next;
    });
    if (willOpen) {
      setLoadedSections(prev => new Set(prev).add(id));
    }
  };

  const isOpen = (id: string) => openSections.has(id);
  const isLoaded = (id: string) => loadedSections.has(id);

  // Encodes period context into a register link href
  const registerLink = (href: string): string => {
    const p = new URLSearchParams({
      from: "review",
      rp: period,
      start: dr.start,
      end: dr.end,
      rl: dr.label,
      ...(period === "custom" ? { cs: customStart, ce: customEnd } : {}),
    });
    return `${href}?${p.toString()}`;
  };

  return (
    <div className="min-h-full">
      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-3 px-4 sm:px-6 pt-3 pb-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground flex-shrink-0">
            Period
          </span>
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
            {REVIEW_PERIODS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => handlePeriodChange(key)}
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

        {period === "custom" && (
          <div className="flex items-center gap-2 px-4 sm:px-6 pb-2">
            <span className="text-[10px] text-muted-foreground">From</span>
            <input
              type="date"
              value={customStart}
              max={customEnd || today}
              onChange={e => handleCustomDate(e.target.value, customEnd)}
              className="h-6 px-2 rounded-md border border-border bg-card text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
            <span className="text-[10px] text-muted-foreground">to</span>
            <input
              type="date"
              value={customEnd}
              min={customStart}
              max={today}
              onChange={e => handleCustomDate(customStart, e.target.value)}
              className="h-6 px-2 rounded-md border border-border bg-card text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>
        )}

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
        <section id="exec" className="scroll-mt-28 space-y-4">
          <SectionHeader label="Executive Summary" />
          <ExecKpiRow start={dr.start} end={dr.end} />
          <ExpandToggle
            open={isOpen("exec")}
            expandLabel="Launch Performance"
            onToggle={() => toggleSection("exec")}
          />
          <Expanded open={isOpen("exec")} loaded={isLoaded("exec")}>
            <LaunchTable />
          </Expanded>
        </section>

        {/* 2 · Sales Performance */}
        <section id="sales" className="scroll-mt-28 space-y-4">
          <SectionHeader label="Sales Performance" />
          <SalesSection start={dr.start} end={dr.end} />
          <ExpandToggle
            open={isOpen("sales")}
            expandLabel="Period Comparison & Product Breakdown"
            onToggle={() => toggleSection("sales")}
          />
          <Expanded open={isOpen("sales")} loaded={isLoaded("sales")}>
            <SalesComparison start={dr.start} end={dr.end} />
            <div className="rounded-xl border border-border bg-card">
              <div className="px-4 pt-4 pb-2">
                <p className="text-[13px] font-semibold text-foreground">Product P&L</p>
                <p className="text-[11px] text-muted-foreground/70 mt-0.5">Revenue, COGS and margin by product</p>
              </div>
              <div className="p-4">
                <ProductPlTable start={dr.start} end={dr.end} />
              </div>
            </div>
            <RegisterLinkRow href={registerLink("/dashboard/sales-register")} label="Orders Register" />
          </Expanded>
        </section>

        {/* 3 · Customer Intelligence */}
        <section id="customers" className="scroll-mt-28 space-y-4">
          <SectionHeader label="Customer Intelligence" />
          <CustomerKpiRow start={dr.start} end={dr.end} />
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
              Top Cities by Revenue
            </p>
            <TopCitiesTable />
          </div>
          <ExpandToggle
            open={isOpen("customers")}
            expandLabel="Customer Growth Trend"
            onToggle={() => toggleSection("customers")}
          />
          <Expanded open={isOpen("customers")} loaded={isLoaded("customers")}>
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-[12px] font-semibold text-foreground mb-3">Customer Growth</p>
              <CustomerGrowthChart />
            </div>
            <RegisterLinkRow href={registerLink("/dashboard/customers")} label="Customer Analytics" />
          </Expanded>
        </section>

        {/* 4 · Inventory Intelligence */}
        <section id="inventory" className="scroll-mt-28 space-y-4">
          <SectionHeader label="Inventory Intelligence" />
          <InventorySection />
          <ExpandToggle
            open={isOpen("inventory")}
            expandLabel="Stock Ageing & Reorder Alerts"
            onToggle={() => toggleSection("inventory")}
          />
          <Expanded open={isOpen("inventory")} loaded={isLoaded("inventory")}>
            <InventoryExpanded />
            <RegisterLinkRow href={registerLink("/dashboard/inventory")} label="Inventory Register" />
          </Expanded>
        </section>

        {/* 5 · Operations & Fulfilment */}
        <section id="operations" className="scroll-mt-28 space-y-4">
          <SectionHeader label="Operations & Fulfilment" />
          <OpsKpiRow start={dr.start} end={dr.end} />
          <ExpandToggle
            open={isOpen("operations")}
            expandLabel="Shipment Funnel & COD Receivables"
            onToggle={() => toggleSection("operations")}
          />
          <Expanded open={isOpen("operations")} loaded={isLoaded("operations")}>
            <ShipmentFunnelChart />
            <CodTable />
            <RegisterLinkRow href={registerLink("/dashboard/logistics")} label="Logistics Register" />
          </Expanded>
        </section>

        {/* 6 · Receivables */}
        <section id="receivables" className="scroll-mt-28 space-y-4">
          <SectionHeader label="Receivables" />
          <ReceivablesSection />
          <ExpandToggle
            open={isOpen("receivables")}
            expandLabel="Ageing Breakdown & COD Detail"
            onToggle={() => toggleSection("receivables")}
          />
          <Expanded open={isOpen("receivables")} loaded={isLoaded("receivables")}>
            <ReceivablesExpanded />
            <RegisterLinkRow href={registerLink("/dashboard/receivables")} label="Receivables Register" />
          </Expanded>
        </section>

        {/* 7 · Bank & Cash Position */}
        <section id="banking" className="scroll-mt-28 space-y-4">
          <SectionHeader label="Bank & Cash Position" />
          <BankSection start={dr.start} end={dr.end} />
          <ExpandToggle
            open={isOpen("banking")}
            expandLabel="Bank Transactions"
            onToggle={() => toggleSection("banking")}
          />
          <Expanded open={isOpen("banking")} loaded={isLoaded("banking")}>
            <RegisterLinkRow href={registerLink("/dashboard/bank")} label="Open Bank Transactions" />
          </Expanded>
        </section>

        {/* 8 · Profitability */}
        <section id="profitability" className="scroll-mt-28 space-y-4">
          <SectionHeader label="Profitability" />
          <ProfitabilityKpiRow start={dr.start} end={dr.end} />
          <MiniWaterfall start={dr.start} end={dr.end} />
          <div className="flex items-center justify-end">
            <a href="/dashboard/profitability" className="text-[12px] text-violet-400 hover:text-violet-300 transition-colors">
              Trading Account &amp; full P&amp;L →
            </a>
          </div>
          <ExpandToggle
            open={isOpen("profitability")}
            expandLabel="Revenue vs COGS & Margin Trend"
            onToggle={() => toggleSection("profitability")}
          />
          <Expanded open={isOpen("profitability")} loaded={isLoaded("profitability")}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-xl border border-border bg-card p-5">
                <p className="text-[12px] font-semibold text-foreground mb-3">Revenue vs COGS</p>
                <RevenueCostChart start={dr.start} end={dr.end} />
              </div>
              <div className="rounded-xl border border-border bg-card p-5">
                <p className="text-[12px] font-semibold text-foreground mb-3">Gross Margin Trend</p>
                <MarginTrendChart start={dr.start} end={dr.end} />
              </div>
            </div>
          </Expanded>
        </section>

        {/* 9 · Marketing & Channels */}
        <section id="marketing" className="scroll-mt-28 space-y-4">
          <SectionHeader label="Marketing & Channels" />
          <MarketingPlaceholder />
        </section>

        {/* 10 · Forecasting */}
        <section id="forecasting" className="scroll-mt-28 space-y-4">
          <SectionHeader label="Forecasting" />
          <ForecastInsightCards />
        </section>

        {/* 11 · Data Quality & Exceptions */}
        <section id="data-quality" className="scroll-mt-28 space-y-4">
          <SectionHeader label="Data Quality & Exceptions" />
          <div className="rounded-xl border border-border bg-card p-4">
            <AlertPanel />
          </div>
          <RegisterLinkRow href="/dashboard/health" label="Health & Alerts Center" />
        </section>

      </div>
    </div>
  );
}

export default function BusinessReviewPage() {
  return (
    <Suspense>
      <BusinessReviewContent />
    </Suspense>
  );
}

// ── Primitive UI components ───────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
      {label}
    </p>
  );
}

function ExpandToggle({
  open,
  expandLabel,
  collapseLabel = "Collapse",
  onToggle,
}: {
  open: boolean;
  expandLabel: string;
  collapseLabel?: string;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-border/50 hover:border-violet-500/30 hover:bg-violet-500/5 text-[12px] text-muted-foreground hover:text-violet-400 transition-all"
    >
      <span>{open ? collapseLabel : expandLabel}</span>
      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-300", open && "rotate-180")} />
    </button>
  );
}

function Expanded({
  open,
  loaded,
  children,
}: {
  open: boolean;
  loaded: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="grid transition-[grid-template-rows] duration-300 ease-out"
      style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
    >
      <div className="overflow-hidden">
        {loaded && <div className="pt-4 space-y-4 pb-2">{children}</div>}
      </div>
    </div>
  );
}

function RegisterLinkRow({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-border/50 hover:border-violet-500/30 hover:bg-violet-500/5 text-[12px] text-muted-foreground hover:text-violet-400 transition-all"
    >
      {label}
      <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}

// ── Sales Section (always visible — payment mix only) ─────────────────────────

function SalesSection({ start, end }: { start: string; end: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
        Payment Mix
      </p>
      <PaymentSplitDonut start={start} end={end} />
    </div>
  );
}

// ── Sales Comparison (in expand — avoids duplicate of ExecKpiRow) ─────────────

function SalesComparison({ start, end }: { start: string; end: string }) {
  const { data: cmp, isLoading } = usePeriodComparison(start, end);

  const revChange = cmp?.revenue_change_pct ?? 0;
  const ordChange = cmp?.orders_change_pct ?? 0;
  const isRevUp = revChange >= 0;
  const isOrdUp = ordChange >= 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              {isRevUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
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
              {isOrdUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {isOrdUp ? "+" : ""}{formatPct(Math.abs(ordChange))} vs prior period
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Receivables Expanded ──────────────────────────────────────────────────────

function ReceivablesExpanded() {
  const { data: ageing = [], isLoading } = useReceivablesAgeing();

  const bucketConfig = [
    { key: "0-7",   label: "0–7 days",   color: "text-emerald-400", bg: "bg-emerald-400/10" },
    { key: "8-15",  label: "8–15 days",  color: "text-amber-400",   bg: "bg-amber-400/10"   },
    { key: "16-30", label: "16–30 days", color: "text-orange-400",  bg: "bg-orange-400/10"  },
    { key: "30+",   label: "30+ days",   color: "text-red-400",     bg: "bg-red-400/10"     },
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-4">
        Receivables Ageing
      </p>
      {isLoading ? (
        <div className="h-20 animate-pulse bg-muted rounded-lg" />
      ) : ageing.length === 0 ? (
        <p className="text-[12px] text-muted-foreground text-center py-4">No outstanding receivables</p>
      ) : (
        <div className="space-y-2">
          {ageing.map((bucket, i) => {
            const cfg = bucketConfig[i] ?? { label: bucket.bucket_label, color: "text-muted-foreground", bg: "bg-muted" };
            return (
              <div key={bucket.bucket} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
                <div className="flex items-center gap-2">
                  <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium border", cfg.bg, cfg.color,
                    cfg.color === "text-emerald-400" ? "border-emerald-400/20" :
                    cfg.color === "text-amber-400"   ? "border-amber-400/20"   :
                    cfg.color === "text-orange-400"  ? "border-orange-400/20"  :
                    "border-red-400/20"
                  )}>
                    {bucket.bucket_label}
                  </span>
                  <span className="text-[12px] text-muted-foreground">{bucket.order_count} orders</span>
                </div>
                <span className="text-[13px] tabular-nums font-semibold text-foreground">
                  {formatINR(bucket.amount_inr)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Inventory Section ─────────────────────────────────────────────────────────

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
      <KpiCard label="Total SKUs"   value={formatCount(kpis?.total_skus ?? 0)} />
      <KpiCard label="Total Units"  value={formatCount(kpis?.total_units ?? 0)} />
      <KpiCard label="Stock Value"  value={formatINR(kpis?.stock_value_inr ?? 0)} />
      <KpiCard
        label="Low Stock"
        value={formatCount(kpis?.low_stock_count ?? 0)}
        alert={kpis && kpis.low_stock_count > 0 ? "amber" : undefined}
      />
      <KpiCard
        label="Out of Stock"
        value={formatCount(kpis?.out_of_stock_count ?? 0)}
        alert={kpis && kpis.out_of_stock_count > 0 ? "red" : undefined}
      />
    </div>
  );
}

// ── Inventory Expanded ────────────────────────────────────────────────────────

function InventoryExpanded() {
  const { data: ageing = [], isLoading: ageLoad } = useStockAgeing();
  const { data: reorder = [], isLoading: reorderLoad } = useReorderReport();

  const buckets = { fresh: 0, watch: 0, slow: 0, dead: 0 };
  const bucketValues = { fresh: 0, watch: 0, slow: 0, dead: 0 };
  for (const row of ageing) {
    buckets[row.age_bucket] += row.current_stock;
    bucketValues[row.age_bucket] += row.stock_value_inr ?? 0;
  }

  const alerts = reorder.filter(r => r.current_stock <= r.reorder_point);

  const bucketConfig = [
    { key: "fresh" as const, label: "Fresh (< 30d)",  color: "text-emerald-400", bg: "bg-emerald-400/10" },
    { key: "watch" as const, label: "Watch (30-60d)", color: "text-amber-400",   bg: "bg-amber-400/10"   },
    { key: "slow"  as const, label: "Slow (60-90d)",  color: "text-orange-400",  bg: "bg-orange-400/10"  },
    { key: "dead"  as const, label: "Dead (90d+)",    color: "text-red-400",     bg: "bg-red-400/10"     },
  ];

  return (
    <>
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-4">
          Stock Ageing
        </p>
        {ageLoad ? (
          <div className="h-20 animate-pulse bg-muted rounded-lg" />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {bucketConfig.map(b => (
              <div key={b.key} className={cn("rounded-lg p-3", b.bg)}>
                <p className={cn("text-[10px] font-medium uppercase tracking-wider mb-1", b.color)}>
                  {b.label}
                </p>
                <p className={cn("text-xl font-bold tabular-nums", b.color)}>
                  {formatCount(buckets[b.key])}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {formatINR(bucketValues[b.key])}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {!reorderLoad && alerts.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            Reorder Alerts ({alerts.length})
          </p>
          <div className="space-y-2">
            {alerts.slice(0, 8).map(r => {
              const isOut = r.current_stock === 0;
              return (
                <div key={r.id} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
                  <div>
                    <p className="text-[13px] font-medium text-foreground">{r.product_name}</p>
                    <p className="text-[11px] text-muted-foreground">{r.sku}</p>
                  </div>
                  <div className="text-right">
                    <span className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full font-medium",
                      isOut
                        ? "bg-red-500/10 text-red-400 border border-red-500/20"
                        : "bg-amber-500/10 text-amber-400 border border-amber-500/20",
                    )}>
                      {isOut ? "Out of Stock" : `${r.current_stock} left`}
                    </span>
                    <p className="text-[11px] text-muted-foreground mt-1">Reorder at {r.reorder_point}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

// ── Marketing Placeholder ─────────────────────────────────────────────────────

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

// ── Mini P&L Waterfall ────────────────────────────────────────────────────────

function MiniWaterfall({ start, end }: { start: string; end: string }) {
  const { data: kpis, isLoading } = useProfitabilityKpis(start, end);

  if (isLoading) return <div className="h-40 rounded-xl animate-pulse bg-muted" />;
  if (!kpis) return null;

  const rows: { label: string; value: number; pct?: number; isMinus?: boolean; isTotal?: boolean }[] = [
    { label: "Recognised Revenue",  value: kpis.delivered_revenue_inr,   pct: 100,                                                                                        isTotal: true },
    { label: "COGS (landed cost)",  value: kpis.cogs_inr,                pct: kpis.delivered_revenue_inr > 0 ? (kpis.cogs_inr / kpis.delivered_revenue_inr) * 100 : 0,   isMinus: true },
    { label: "Gross Profit",        value: kpis.gross_profit_inr,        pct: kpis.gross_margin_pct,                                                                       isTotal: true },
    { label: "Ad + Shipping + COD", value: kpis.ad_spend_inr + kpis.shipping_cost_inr + kpis.cod_charges_inr, pct: kpis.delivered_revenue_inr > 0 ? ((kpis.ad_spend_inr + kpis.shipping_cost_inr + kpis.cod_charges_inr) / kpis.delivered_revenue_inr) * 100 : 0, isMinus: true },
    { label: "Contribution Margin", value: kpis.contribution_margin_inr, pct: kpis.contribution_margin_pct,                                                                isTotal: true },
    { label: "Net Profit",          value: kpis.net_profit_inr,          pct: kpis.net_margin_pct,                                                                         isTotal: true },
  ];

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-4 pt-4 pb-2">
        <p className="text-[13px] font-semibold text-foreground">P&L Waterfall</p>
        <p className="text-[11px] text-muted-foreground/70 mt-0.5">Delivered revenue basis</p>
      </div>
      {rows.map(row => (
        <div
          key={row.label}
          className={cn(
            "flex items-center justify-between py-2.5 px-4",
            row.isTotal && !row.isMinus ? "border-t border-border/60 bg-muted/20" : "border-b border-border/20",
          )}
        >
          <div className="flex items-center gap-2">
            {row.isMinus && <span className="text-[11px] text-muted-foreground w-3">−</span>}
            {!row.isMinus && <span className="w-3" />}
            <span className={cn("text-[12px]", row.isTotal ? "font-semibold text-foreground" : "text-muted-foreground")}>
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

// ── Receivables Section ───────────────────────────────────────────────────────

function ReceivablesSection() {
  const { data: kpis, isLoading } = useReceivablesKpis();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  const overdue = kpis?.overdue_inr ?? 0;
  const codPending = kpis?.cod_pending_inr ?? 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      <KpiCard
        label="Total Receivables"
        value={formatINR(kpis?.total_receivables_inr ?? 0)}
      />
      <KpiCard
        label="COD Pending"
        value={formatINR(codPending)}
        subValue={`${kpis?.cod_pending_count ?? 0} orders`}
        alert={codPending > 0 ? "amber" : undefined}
      />
      <KpiCard
        label="Settlement Pending"
        value={formatINR(kpis?.settlement_pending_inr ?? 0)}
        subValue={`${kpis?.settlement_pending_count ?? 0} entries`}
        alert={(kpis?.settlement_pending_inr ?? 0) > 0 ? "amber" : undefined}
      />
      <KpiCard
        label="Overdue"
        value={formatINR(overdue)}
        subValue={`${kpis?.overdue_count ?? 0} orders`}
        alert={overdue > 0 ? "red" : kpis !== undefined ? "green" : undefined}
      />
    </div>
  );
}

// ── Bank Section ──────────────────────────────────────────────────────────────

function BankSection({ start, end }: { start: string; end: string }) {
  const { data: kpis, isLoading: kpisLoad } = useBankKpis(null, start, end);
  const { data: accounts = [], isLoading: accsLoad } = useBankAccounts();
  const days = Math.min(90, Math.max(7, Math.round(
    (new Date(end).getTime() - new Date(start).getTime()) / 86_400_000,
  )));
  const { data: cashflow = [] } = useBankDailyCashflow(null, days);
  const { data: categories = [] } = useBankCategoryBreakdown(null);

  const isLoading = kpisLoad || accsLoad;
  const netFlow = kpis?.net_flow ?? 0;
  const unclassified = kpis?.unclassified_count ?? 0;

  return (
    <div className="space-y-3">
      {/* KPI summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {isLoading ? (
          [...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)
        ) : (
          <>
            <KpiCard label="Total Inflow"  value={formatINR(kpis?.total_receipts ?? 0)} />
            <KpiCard label="Total Outflow" value={formatINR(kpis?.total_payments ?? 0)} />
            <KpiCard
              label="Net Flow"
              value={`${netFlow >= 0 ? "+" : ""}${formatINR(Math.abs(netFlow))}`}
              alert={netFlow < 0 ? "amber" : undefined}
            />
            <KpiCard
              label="Unclassified"
              value={formatCount(unclassified)}
              subValue={unclassified > 0 ? `worth ${formatINR(kpis?.unclassified_amount ?? 0)}` : undefined}
              alert={unclassified > 5 ? "amber" : unclassified > 0 ? "amber" : kpis !== undefined ? "green" : undefined}
              href="/dashboard/bank-classification"
            />
          </>
        )}
      </div>

      {/* Account cards */}
      {!isLoading && accounts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {accounts.map(a => (
            <div key={a.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-[13px] font-semibold text-foreground">{a.bank_name}</p>
                  <p className="text-[11px] text-muted-foreground">{a.account_name}</p>
                </div>
                {a.unclassified_count > 0 ? (
                  <a href="/dashboard/bank-classification" className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/20 hover:bg-amber-400/20 transition-colors">
                    <AlertCircle className="h-3 w-3" />
                    {a.unclassified_count} pending
                  </a>
                ) : (
                  <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                )}
              </div>
              <p className="text-xl font-bold tabular-nums text-foreground">
                {formatINR(a.closing_balance_inr ?? 0)}
              </p>
              {a.latest_date && (
                <p className="text-[10px] text-muted-foreground mt-0.5">as of {a.latest_date}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Cashflow + Categories — always visible, combined card */}
      {(cashflow.length > 0 || categories.length > 0) && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {cashflow.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                  Daily Cashflow
                </p>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={cashflow} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barGap={2}>
                    <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                      dataKey="day"
                      tickFormatter={(v: string) =>
                        new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
                      }
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false} tickLine={false} tickMargin={6}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tickFormatter={(v: number) => formatINR(v)}
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false} tickLine={false} width={56}
                    />
                    <Tooltip
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      content={({ active, payload, label }: any) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-xl text-[12px] space-y-1">
                            <p className="text-muted-foreground mb-1">
                              {new Date(label ?? "").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                            </p>
                            {payload.map((p: { name: string; value: number; fill: string }) => (
                              <p key={p.name} className="tabular-nums" style={{ color: p.fill }}>
                                {p.name === "receipts_inr" ? "Inflow" : "Outflow"}: {formatINR(p.value)}
                              </p>
                            ))}
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="receipts_inr" fill="hsl(142 71% 45%)" radius={[2, 2, 0, 0]} name="receipts_inr" />
                    <Bar dataKey="payments_inr" fill="hsl(0 72% 51%)"   radius={[2, 2, 0, 0]} name="payments_inr" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {categories.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                  Outflow by Category
                </p>
                <div className="space-y-2">
                  {categories.slice(0, 8).map((c, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <p className="text-[12px] text-foreground truncate flex-1 mr-3">{c.category_name}</p>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-[11px] text-muted-foreground">{c.pct_of_total?.toFixed(1)}%</span>
                        <span className="text-[12px] tabular-nums font-medium text-foreground w-20 text-right">
                          {formatINR(c.total_inr)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Banking Expanded ──────────────────────────────────────────────────────────

function BankingExpanded({ start, end }: { start: string; end: string }) {
  const days = Math.min(90, Math.max(7, Math.round(
    (new Date(end).getTime() - new Date(start).getTime()) / 86_400_000,
  )));
  const { data: cashflow = [] } = useBankDailyCashflow(null, days);
  const { data: categories = [] } = useBankCategoryBreakdown(null);

  return (
    <>
      {cashflow.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-4">
            Daily Cashflow
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={cashflow} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barGap={2}>
              <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="day"
                tickFormatter={(v: string) =>
                  new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
                }
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false} tickLine={false} tickMargin={6}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={(v: number) => formatINR(v)}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false} tickLine={false} width={56}
              />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                content={({ active, payload, label }: any) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-xl text-[12px] space-y-1">
                      <p className="text-muted-foreground mb-1">
                        {new Date(label ?? "").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </p>
                      {payload.map((p: { name: string; value: number; fill: string }) => (
                        <p key={p.name} className="tabular-nums" style={{ color: p.fill }}>
                          {p.name === "receipts_inr" ? "Inflow" : "Outflow"}: {formatINR(p.value)}
                        </p>
                      ))}
                    </div>
                  );
                }}
              />
              <Bar dataKey="receipts_inr" fill="hsl(142 71% 45%)" radius={[2, 2, 0, 0]} name="receipts_inr" />
              <Bar dataKey="payments_inr" fill="hsl(0 72% 51%)"   radius={[2, 2, 0, 0]} name="payments_inr" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {categories.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            Outflow by Category
          </p>
          <div className="space-y-2">
            {categories.slice(0, 8).map((c, i) => (
              <div key={i} className="flex items-center justify-between">
                <p className="text-[12px] text-foreground">{c.category_name}</p>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-muted-foreground">{c.pct_of_total?.toFixed(1)}%</span>
                  <span className="text-[12px] tabular-nums font-medium text-foreground w-20 text-right">
                    {formatINR(c.total_inr)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
