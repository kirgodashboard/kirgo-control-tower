"use client";

import { KpiCard, KpiCardSkeleton } from "@/components/ui/kpi-card";
import { useProfitabilityKpis } from "@/lib/hooks/use-profitability";
import { formatINR, formatPct } from "@/lib/utils/format";
import { TrendingUp, Package, DollarSign, Percent, RotateCcw, ChartColumnDecreasing, Receipt, Wallet } from "lucide-react";

interface Props {
  start: string;
  end: string;
}

export function ProfitabilityKpiRow({ start, end }: Props) {
  const { data: kpis, isLoading } = useProfitabilityKpis(start, end);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => <KpiCardSkeleton key={i} />)}
      </div>
    );
  }

  if (!kpis) return null;

  const marginAlert =
    kpis.gross_margin_pct < 20 ? "red" :
    kpis.gross_margin_pct < 35 ? "amber" : undefined;

  const cmAlert =
    kpis.contribution_margin_pct < 5 ? "red" :
    kpis.contribution_margin_pct < 15 ? "amber" : undefined;

  const netAlert =
    kpis.net_margin_pct < 0 ? "red" :
    kpis.net_margin_pct < 10 ? "amber" : undefined;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      <KpiCard
        label="Total Revenue (Booked)"
        value={formatINR(kpis.total_revenue_inr)}
        subValue={`${formatINR(kpis.delivered_revenue_inr)} recognised (delivered)`}
        icon={<TrendingUp className="h-4 w-4" />}
        href="/dashboard/sales-register"
      />
      <KpiCard
        label="COGS — Landed Cost"
        value={formatINR(kpis.cogs_inr)}
        subValue={`${formatPct((kpis.cogs_inr / (kpis.delivered_revenue_inr || 1)) * 100)} of delivered rev · delivered orders only`}
        icon={<Package className="h-4 w-4" />}
        href="/dashboard/purchases"
      />
      <KpiCard
        label="Gross Profit"
        value={formatINR(kpis.gross_profit_inr)}
        alert={marginAlert}
        icon={<DollarSign className="h-4 w-4" />}
        href="/dashboard/profitability"
      />
      <KpiCard
        label="Gross Margin %"
        value={formatPct(kpis.gross_margin_pct)}
        subValue={kpis.gross_margin_pct >= 35 ? "Healthy" : kpis.gross_margin_pct >= 20 ? "Below target" : "Critical"}
        alert={marginAlert}
        icon={<Percent className="h-4 w-4" />}
        href="/dashboard/profitability"
      />
      <KpiCard
        label="Contribution Margin"
        value={formatINR(kpis.contribution_margin_inr)}
        subValue={`${formatPct(kpis.contribution_margin_pct)} of revenue`}
        alert={cmAlert}
        icon={<ChartColumnDecreasing className="h-4 w-4" />}
        href="/dashboard/profitability"
      />
      <KpiCard
        label="Cash after Capex"
        value={formatINR(kpis.cash_after_capex_inr)}
        subValue={`incl. ${formatINR(kpis.capex_inr)} capex`}
        alert={kpis.cash_after_capex_inr < 0 ? "amber" : undefined}
        icon={<RotateCcw className="h-4 w-4" />}
        href="/dashboard/expenses"
      />
      <KpiCard
        label="Operating Expenses"
        value={formatINR(kpis.operating_expenses_inr)}
        subValue="opex — rent, salaries, ops (excl. COGS)"
        icon={<Receipt className="h-4 w-4" />}
        href="/dashboard/expenses"
      />
      <KpiCard
        label="Net Profit"
        value={formatINR(kpis.net_profit_inr)}
        subValue={`${formatPct(kpis.net_margin_pct)} net margin · after opex`}
        alert={netAlert}
        icon={<Wallet className="h-4 w-4" />}
        href="/dashboard/profitability"
      />
    </div>
  );
}
