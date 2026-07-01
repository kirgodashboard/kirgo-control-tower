"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import { useProfitabilityKpis, useTradingAccount } from "@/lib/hooks/use-profitability";
import { formatINR, formatPct, formatCount } from "@/lib/utils/format";

type Period = "30d" | "90d" | "6m" | "1y" | "all";

const PERIODS = [
  { key: "30d", label: "30 Days"  },
  { key: "90d", label: "90 Days"  },
  { key: "6m",  label: "6 Months" },
  { key: "1y",  label: "1 Year"   },
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
  const days = period === "30d" ? 30 : period === "90d" ? 90 : period === "1y" ? 365 : 180;
  const start = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  return {
    start,
    end,
    label: period === "6m" ? "Last 6 Months" : period === "1y" ? "Last 12 Months" : `Last ${days} Days`,
  };
}

function ProfitabilityPageContent() {
  const searchParams = useSearchParams();
  const fromReview = searchParams.get("from") === "review";
  const rp = searchParams.get("rp") ?? "";
  const urlStart = searchParams.get("start");
  const urlEnd = searchParams.get("end");
  const urlLabel = searchParams.get("rl") ?? "";

  const [period, setPeriod] = useState<Period>("all");
  const [plTab, setPlTab] = useState<PlTab>("product");
  const [plView, setPlView] = useState<"delivery" | "trading">("delivery");

  const { start, end, label } = (fromReview && urlStart && urlEnd)
    ? { start: urlStart, end: urlEnd, label: urlLabel }
    : periodDates(period);

  const backHref = rp ? `/review?period=${rp}` : "/review";

  return (
    <div className="min-h-full p-4 sm:p-6 space-y-6">
      <PageHeader title="Profitability" subtitle={label} backHref={backHref}>
        {!fromReview && (
          <PeriodTabs
            value={period}
            options={PERIODS}
            onChange={(k) => setPeriod(k as Period)}
          />
        )}
      </PageHeader>

      {/* 6 KPI cards */}
      <ProfitabilityKpiRow start={start} end={end} />

      {/* P&L view toggle + Waterfall */}
      <div className="flex items-center gap-1 mb-[-8px]">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mr-3">P&amp;L View</p>
        {(["delivery", "trading"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setPlView(v)}
            className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
              plView === v
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            {v === "delivery" ? "Delivery P&L" : "Trading Account"}
          </button>
        ))}
      </div>
      {plView === "delivery"
        ? <ProfitabilityWaterfall start={start} end={end} />
        : <TradingAccountWaterfall start={start} end={end} isAllTime={period === "all"} />
      }

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

export default function ProfitabilityPage() {
  return (
    <Suspense>
      <ProfitabilityPageContent />
    </Suspense>
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
          Revenue recognised on delivery (line-item basis) · Executive dashboard uses order_total on order date — intentional difference
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
      {/* Memo rows — capital items and return logistics, not in contribution/net calc */}
      {kpis.return_cost_inr > 0 && (
        <WaterfallRow label="Memo: Return Freight (RTO)" value={kpis.return_cost_inr} pct={revPct(kpis.return_cost_inr)} isMinus />
      )}
      <WaterfallRow label="Memo: Capex (capitalised)" value={kpis.capex_inr} pct={revPct(kpis.capex_inr)} isMinus />
      <WaterfallRow label="Cash after Capex" value={kpis.cash_after_capex_inr} pct={revPct(kpis.cash_after_capex_inr)} isTotal />
    </div>
  );
}

// ── Trading Account Waterfall ─────────────────────────────────────────────────

function TradingAccountWaterfall({
  start,
  end,
  isAllTime,
}: {
  start: string;
  end: string;
  isAllTime: boolean;
}) {
  const { data: ta, isLoading } = useTradingAccount(start, end);

  if (isLoading) return <div className="h-64 rounded-xl skeleton" />;
  if (!ta) return null;

  const pct = (v: number) => (ta.revenue_inr > 0 ? (v / ta.revenue_inr) * 100 : 0);
  // Negative goods_consumed means closing stock > purchases — PO data is incomplete.
  // In this state we cannot compute a meaningful gross profit; show the three raw
  // components (Revenue, Purchases, Stock) and block the P&L waterfall.
  const poIncomplete = ta.goods_consumed_inr < 0;
  const missingStockValue = Math.abs(ta.goods_consumed_inr);

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-4">
        <div>
          <p className="text-[17px] font-semibold text-foreground">Trading Account</p>
          <p className="text-[12px] text-muted-foreground/70 mt-0.5">
            Revenue − (Purchases − Stock on Hand) = Gross Profit
            {!isAllTime && !poIncomplete && (
              <span className="ml-2 text-amber-400">
                · Stock is today&apos;s value — use All Time for exact COGS
              </span>
            )}
          </p>
        </div>
      </div>

      {/* ── Incomplete PO warning ─────────────────────────────────────────── */}
      {poIncomplete && (
        <div className="mx-4 mb-3 rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3">
          <p className="text-[12px] font-semibold text-amber-400 mb-1">Purchase Orders Incomplete</p>
          <p className="text-[11px] text-amber-400/80 leading-relaxed">
            Only {formatCount(ta.purchase_order_count)} purchase {ta.purchase_order_count === 1 ? "order" : "orders"} recorded
            ({formatINR(ta.purchases_inr)}) but stock on hand is worth {formatINR(ta.closing_stock_inr)}.
            The {formatINR(missingStockValue)} gap means some purchases were never entered.
            Add all supplier invoices to the Purchase Register and the full P&L will appear here.
          </p>
          <p className="text-[11px] text-muted-foreground mt-2">
            In the meantime, the three key figures below are correct — only the Goods Consumed and
            all downstream margins are unreliable.
          </p>
        </div>
      )}

      {/* Revenue */}
      <WaterfallRow label="Revenue (Booked)" value={ta.revenue_inr} pct={100} isTotal />

      {/* Cost of Goods section */}
      <div className="px-4 pt-3 pb-1">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Cost of Goods</p>
      </div>
      <WaterfallRow
        label={`Purchases Recorded (${formatCount(ta.purchase_order_count)} POs${poIncomplete ? " — incomplete" : ""})`}
        value={ta.purchases_inr}
        pct={pct(ta.purchases_inr)}
        isMinus
      />
      <WaterfallRow
        label={`Stock on Hand — ${formatCount(ta.closing_stock_units)} units${isAllTime ? "" : " · today's value"}`}
        value={ta.closing_stock_inr}
        pct={pct(ta.closing_stock_inr)}
      />

      {poIncomplete ? (
        /* Can't show meaningful COGS or margins — show the gap as a data quality line */
        <div className="flex items-center justify-between py-2.5 px-4 border-b border-border/30">
          <span className="text-[13px] text-amber-400/70 italic">
            Goods Consumed — unavailable until all POs are entered
          </span>
          <span className="text-[13px] text-amber-400/70 tabular-nums w-28 text-right">—</span>
        </div>
      ) : (
        <>
          <WaterfallRow
            label="Goods Consumed (Purchases − Stock)"
            value={ta.goods_consumed_inr}
            pct={pct(ta.goods_consumed_inr)}
            isMinus
          />
          <WaterfallRow label="Gross Profit"  value={ta.gross_profit_inr}  pct={ta.gross_margin_pct} isTotal />

          <div className="px-4 pt-3 pb-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Fulfilment & Marketing</p>
          </div>
          <WaterfallRow label="Outbound Shipping" value={ta.shipping_cost_inr} pct={pct(ta.shipping_cost_inr)} isMinus />
          <WaterfallRow label="COD Charges"       value={ta.cod_charges_inr}   pct={pct(ta.cod_charges_inr)}   isMinus />
          <WaterfallRow label="Ad Spend"          value={ta.ad_spend_inr}      pct={pct(ta.ad_spend_inr)}      isMinus />
          <WaterfallRow label="Contribution Margin" value={ta.contribution_margin_inr} pct={ta.contribution_margin_pct} isTotal />

          <div className="px-4 pt-3 pb-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Operating Expenses</p>
          </div>
          <WaterfallRow label="Opex (Rent, Salaries, Ops)" value={ta.opex_inr}      pct={pct(ta.opex_inr)}      isMinus />
          <WaterfallRow label="Marketing"                   value={ta.marketing_inr} pct={pct(ta.marketing_inr)} isMinus />
          <WaterfallRow
            label="Net Profit / Loss"
            value={ta.net_profit_inr}
            pct={ta.net_margin_pct}
            isTotal
          />
          <WaterfallRow label="Memo: Capex (capitalised)" value={ta.capex_inr}             pct={pct(ta.capex_inr)}             isMinus />
          <WaterfallRow label="Cash after Capex"          value={ta.cash_after_capex_inr}  pct={pct(ta.cash_after_capex_inr)}  isTotal />
        </>
      )}
    </div>
  );
}
