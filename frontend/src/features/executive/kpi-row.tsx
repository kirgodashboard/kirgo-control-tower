"use client";

import { KpiCard, KpiCardSkeleton } from "@/components/ui/kpi-card";
import { useExecutiveKpis, usePeriodComparison } from "@/lib/hooks/use-executive";
import { formatINR, formatPct, formatCount } from "@/lib/utils/format";
import {
  TrendingUp, ShoppingCart, BarChart2, Users, UserPlus, CreditCard, RefreshCcw, Package
} from "lucide-react";

interface ExecKpiRowProps {
  start: string;
  end: string;
}

export function ExecKpiRow({ start, end }: ExecKpiRowProps) {
  const { data: kpis, isLoading: kpiLoading } = useExecutiveKpis(start, end);
  const { data: cmp } = usePeriodComparison(start, end);

  if (kpiLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => <KpiCardSkeleton key={i} />)}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <KpiCard
        label="Gross Revenue"
        value={formatINR(kpis?.gross_revenue_inr)}
        delta={cmp?.revenue_change_pct}
        deltaLabel="vs prior period"
        icon={<TrendingUp className="h-4 w-4" />}
      />
      <KpiCard
        label="Orders"
        value={formatCount(kpis?.orders_count)}
        delta={cmp?.orders_change_pct}
        deltaLabel="vs prior period"
        icon={<ShoppingCart className="h-4 w-4" />}
      />
      <KpiCard
        label="Avg Order Value"
        value={formatINR(kpis?.aov_inr)}
        icon={<BarChart2 className="h-4 w-4" />}
      />
      <KpiCard
        label="Unique Customers"
        value={formatCount(kpis?.unique_customers)}
        icon={<Users className="h-4 w-4" />}
      />
      <KpiCard
        label="New Customers"
        value={formatCount(kpis?.new_customers)}
        icon={<UserPlus className="h-4 w-4" />}
      />
      <KpiCard
        label="COD Share"
        value={formatPct(kpis?.cod_pct)}
        icon={<CreditCard className="h-4 w-4" />}
      />
      <KpiCard
        label="Return Rate"
        value={formatPct(kpis?.return_rate_pct)}
        alert={
          (kpis?.return_rate_pct ?? 0) > 15 ? "red"
          : (kpis?.return_rate_pct ?? 0) > 8 ? "amber"
          : undefined
        }
        invertDelta
        icon={<RefreshCcw className="h-4 w-4" />}
      />
      <KpiCard
        label="Returns"
        value={formatCount(kpis?.return_count)}
        icon={<Package className="h-4 w-4" />}
      />
    </div>
  );
}
