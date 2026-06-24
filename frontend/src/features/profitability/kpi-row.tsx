"use client";

import { KpiCard, KpiCardSkeleton } from "@/components/ui/kpi-card";
import { useProfitabilityKpis } from "@/lib/hooks/use-profitability";
import { formatINR, formatPct } from "@/lib/utils/format";
import { TrendingUp, Package, DollarSign, Percent, RotateCcw, ChartColumnDecreasing } from "lucide-react";

interface Props {
  start: string;
  end: string;
}

export function ProfitabilityKpiRow({ start, end }: Props) {
  const { data: kpis, isLoading } = useProfitabilityKpis(start, end);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => <KpiCardSkeleton key={i} />)}
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

  const returnAlert =
    kpis.return_cost_inr > 50_000 ? "red" :
    kpis.return_cost_inr > 20_000 ? "amber" : undefined;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <KpiCard
        label="Revenue (Delivered)"
        value={formatINR(kpis.revenue_inr)}
        subValue="cash recognised on delivery"
        icon={<TrendingUp className="h-4 w-4" />}
        href="/dashboard/profitability"
      />
      <KpiCard
        label="COGS (Landed)"
        value={formatINR(kpis.cogs_inr)}
        subValue={`${formatPct((kpis.cogs_inr / (kpis.revenue_inr || 1)) * 100)} of revenue`}
        icon={<Package className="h-4 w-4" />}
        href="/dashboard/profitability"
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
        label="Return Cost Impact"
        value={formatINR(kpis.return_cost_inr)}
        subValue={kpis.return_cost_inr === 0 ? "Zero returns" : "COGS lost to RTOs"}
        alert={returnAlert}
        icon={<RotateCcw className="h-4 w-4" />}
        href="/dashboard/operations"
      />
    </div>
  );
}
