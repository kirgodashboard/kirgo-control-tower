"use client";

import { KpiCard, KpiCardSkeleton } from "@/components/ui/kpi-card";
import { useProfitabilityKpis } from "@/lib/hooks/use-profitability";
import { formatINR, formatPct } from "@/lib/utils/format";
import { TrendingUp, Package, DollarSign, Percent, Megaphone } from "lucide-react";

interface Props {
  start: string;
  end: string;
}

export function ProfitabilityKpiRow({ start, end }: Props) {
  const { data: kpis, isLoading } = useProfitabilityKpis(start, end);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => <KpiCardSkeleton key={i} />)}
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

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <KpiCard
        label="Gross Revenue"
        value={formatINR(kpis.revenue_inr)}
        icon={<TrendingUp className="h-4 w-4" />}
      />
      <KpiCard
        label="COGS (Landed)"
        value={formatINR(kpis.cogs_inr)}
        subValue={`${formatPct((kpis.cogs_inr / (kpis.revenue_inr || 1)) * 100)} of revenue`}
        icon={<Package className="h-4 w-4" />}
      />
      <KpiCard
        label="Gross Profit"
        value={formatINR(kpis.gross_profit_inr)}
        subValue={`${formatPct(kpis.gross_margin_pct)} margin`}
        alert={marginAlert}
        icon={<DollarSign className="h-4 w-4" />}
      />
      <KpiCard
        label="Contribution Margin"
        value={formatINR(kpis.contribution_margin_inr)}
        subValue={`${formatPct(kpis.contribution_margin_pct)} of revenue`}
        alert={cmAlert}
        icon={<Percent className="h-4 w-4" />}
      />
      <KpiCard
        label="Ad Spend"
        value={formatINR(kpis.ad_spend_inr)}
        subValue={`Ship ₹${Math.round(kpis.shipping_cost_inr / 1000)}K · COD ₹${Math.round(kpis.cod_charges_inr / 1000)}K`}
        icon={<Megaphone className="h-4 w-4" />}
      />
    </div>
  );
}
