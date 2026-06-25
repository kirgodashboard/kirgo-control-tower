"use client";

import { useState } from "react";
import { PageHeader, PeriodTabs } from "@/components/ui/page-header";
import { ProfitabilityKpiRow } from "@/features/profitability/kpi-row";
import {
  ProductPlTable,
  SkuPlTable,
  CityPlTable,
  LaunchPlTable,
  CustomerPlTable,
} from "@/features/profitability/pl-tables";
import {
  RevenueCostChart,
  MarginTrendChart,
  TopProfitProductsChart,
  LowestMarginProductsChart,
} from "@/features/profitability/profitability-charts";
import { useProfitabilityKpis } from "@/lib/hooks/use-profitability";
import { formatINR, formatPct } from "@/lib/utils/format";

type Period = "30d" | "90d" | "6m" | "all";

const PERIODS = [
  { key: "30d", label: "30 Days" },
  { key: "90d", label: "90 Days" },
  { key: "6m",  label: "6 Months" },
  { key: "all", label: "All Time" },
];

type PlTab = "product" | "sku" | "city" | "launch" | "customer";

const PL_TABS: { key: PlTab; label: string }[] = [
  { key: "product",  label: "Product" },
  { key: "sku",      label: "SKU" },
  { key: "city",     label: "City" },
  { key: "launch",   label: "Launch" },
  { key: "customer", label: "Customer" },
];

function periodDates(period: Period): { start: string; end: string; label: string } {
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  if (period === "all") {
    return { start: "2023-01-01", end, label: "All Time (since Oct 2023)" };
  }
  const days = period === "30d" ? 30 : period === "90d" ? 90 : 180;
  const start = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  return {
    start,
    end,
    label: period === "6m" ? "Last 6 Months" : `Last ${days} Days`,
  };
}

export default function ProfitabilityPage() {
  const [period, setPeriod] = useState<Period>("all");
  const [plTab, setPlTab] = useState<PlTab>("product");
  const { start, end, label } = periodDates(period);

  return (
    <div className="min-h-full p-4 sm:p-6 space-y-6">
      <PageHeader title="Profitability" subtitle={label}>
        <PeriodTabs
          value={period}
          options={PERIODS}
          onChange={(k) => setPeriod(k as Period)}
        />
      </PageHeader>

      {/* 6 KPI cards */}
      <ProfitabilityKpiRow start={start} end={end} />

      {/* P&L Waterfall */}
      <ProfitabilityWaterfall start={start} end={end} />

      {/* Charts — row 1: Revenue vs Cost · Margin Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[17px] font-semibold text-foreground mb-1">Revenue vs COGS</p>
          <p className="text-[12px] text-muted-foreground mb-4">Delivered revenue against landed cost per period</p>
          <RevenueCostChart start={start} end={end} />
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[17px] font-semibold text-foreground mb-1">Gross Margin Trend</p>
          <p className="text-[12px] text-muted-foreground mb-4">Margin % over time · green line = 35% target</p>
          <MarginTrendChart start={start} end={end} />
        </div>
      </div>

      {/* Charts — row 2: Top profit · Lowest margin */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[17px] font-semibold text-foreground mb-1">Top Products by Gross Profit</p>
          <p className="text-[12px] text-muted-foreground mb-4">Best performing products for this period</p>
          <TopProfitProductsChart start={start} end={end} />
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[17px] font-semibold text-foreground mb-1">Lowest Margin Products</p>
          <p className="text-[12px] text-muted-foreground mb-4">Watch these · green dashed = 35% target</p>
          <LowestMarginProductsChart start={start} end={end} />
        </div>
      </div>

      {/* P&L Tables */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center gap-1 p-4 border-b border-border">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mr-4">
            P&amp;L Breakdown
          </p>
          {PL_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setPlTab(t.key)}
              className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                plTab === t.key
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="p-4">
          {plTab === "product"  && <ProductPlTable  start={start} end={end} />}
          {plTab === "sku"      && <SkuPlTable       start={start} end={end} />}
          {plTab === "city"     && <CityPlTable      start={start} end={end} />}
          {plTab === "launch"   && <LaunchPlTable />}
          {plTab === "customer" && <CustomerPlTable  start={start} end={end} />}
        </div>
      </div>
    </div>
  );
}

// ── Waterfall ──────────────────────────────────────────────────────────────────

function WaterfallRow({
  label,
  value,
  subtext,
  isMinus,
  isTotal,
  pct,
}: {
  label: string;
  value: number;
  subtext?: string;
  isMinus?: boolean;
  isTotal?: boolean;
  pct?: number;
}) {
  return (
    <div
      className={`flex items-center justify-between py-2.5 px-4 ${
        isTotal ? "border-t border-border mt-1 pt-3" : "border-b border-border/30"
      }`}
    >
      <div className="flex items-center gap-2">
        {isMinus && <span className="text-[11px] text-muted-foreground w-3">−</span>}
        {!isMinus && !isTotal && <span className="w-3" />}
        <span className={`text-[13px] ${isTotal ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
          {label}
        </span>
        {subtext && (
          <span className="text-[11px] text-muted-foreground/60">{subtext}</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {pct !== undefined && (
          <span className="text-[11px] text-muted-foreground tabular-nums w-14 text-right">
            {formatPct(pct)}
          </span>
        )}
        <span
          className={`text-[13px] tabular-nums font-medium w-28 text-right ${
            isTotal
              ? value >= 0 ? "text-emerald-400" : "text-red-400"
              : isMinus
              ? "text-red-400/70"
              : "text-foreground"
          }`}
        >
          {isMinus ? `(${formatINR(value)})` : formatINR(value)}
        </span>
      </div>
    </div>
  );
}

function ProfitabilityWaterfall({ start, end }: { start: string; end: string }) {
  const { data: kpis, isLoading } = useProfitabilityKpis(start, end);

  if (isLoading) return <div className="h-52 rounded-xl skeleton" />;
  if (!kpis) return null;

  const revPct = (v: number) => (kpis.revenue_inr > 0 ? (v / kpis.revenue_inr) * 100 : 0);

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-4 pt-4 pb-2">
        <p className="text-[17px] font-semibold text-foreground">P&amp;L Waterfall</p>
        <p className="text-[12px] text-muted-foreground/70 mt-0.5">
          Total Revenue → Delivered → Gross Profit → Contribution → Net Profit
        </p>
      </div>
      {/* Revenue recognition bridge: ties to Executive's booked revenue */}
      <WaterfallRow label="Total Revenue (Booked)" value={kpis.total_revenue_inr}      pct={100} isTotal />
      <WaterfallRow label="Less: In-transit / Undelivered" value={kpis.revenue_in_transit_inr} pct={kpis.total_revenue_inr > 0 ? (kpis.revenue_in_transit_inr / kpis.total_revenue_inr) * 100 : 0} isMinus />
      <WaterfallRow label="Recognised Revenue (Delivered)" value={kpis.delivered_revenue_inr} pct={kpis.total_revenue_inr > 0 ? (kpis.delivered_revenue_inr / kpis.total_revenue_inr) * 100 : 0} isTotal />
      {/* P&L on recognised (delivered) basis */}
      <WaterfallRow label="COGS (Goods — Landed Cost)" value={kpis.cogs_inr}           pct={revPct(kpis.cogs_inr)}          isMinus />
      <WaterfallRow label="Gross Profit"         value={kpis.gross_profit_inr}          pct={kpis.gross_margin_pct}          isTotal />
      <WaterfallRow label="Outbound Shipping"    value={kpis.shipping_cost_inr}         pct={revPct(kpis.shipping_cost_inr)} isMinus />
      <WaterfallRow label="COD Charges"          value={kpis.cod_charges_inr}           pct={revPct(kpis.cod_charges_inr)}  isMinus />
      <WaterfallRow label="Ad Spend"             value={kpis.ad_spend_inr}              pct={revPct(kpis.ad_spend_inr)}     isMinus />
      <WaterfallRow
        label="Contribution Margin"
        value={kpis.contribution_margin_inr}
        pct={kpis.contribution_margin_pct}
        isTotal
      />
      <WaterfallRow label="Operating Expenses (Opex)" value={kpis.opex_inr}      pct={revPct(kpis.opex_inr)}      isMinus />
      <WaterfallRow label="Marketing"                 value={kpis.marketing_inr} pct={revPct(kpis.marketing_inr)} isMinus />
      <WaterfallRow
        label="Net Profit (excl. capex)"
        value={kpis.net_profit_inr}
        pct={kpis.net_margin_pct}
        isTotal
      />
      {/* Memo — capex is capital, not an operating expense */}
      <WaterfallRow label="Memo: Capex (capitalised)" value={kpis.capex_inr} pct={revPct(kpis.capex_inr)} isMinus />
      <WaterfallRow label="Cash after Capex" value={kpis.cash_after_capex_inr} pct={revPct(kpis.cash_after_capex_inr)} isTotal />
    </div>
  );
}
