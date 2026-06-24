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
        metricKey="gross_revenue"
        value={formatINR(kpis?.gross_revenue_inr)}
        delta={cmp?.revenue_change_pct}
        deltaLabel="vs prior period"
        icon={<TrendingUp className="h-4 w-4" />}
        href="/dashboard/sales-register"
      />
      <KpiCard
        label="Orders"
        metricKey="orders_count"
        value={formatCount(kpis?.orders_count)}
        delta={cmp?.orders_change_pct}
        deltaLabel="vs prior period"
        icon={<ShoppingCart className="h-4 w-4" />}
        href="/dashboard/sales-register"
      />
      <KpiCard
        label="Avg Order Value"
        metricKey="aov"
        value={formatINR(kpis?.aov_inr)}
        icon={<BarChart2 className="h-4 w-4" />}
        href="/dashboard/sales-register"
      />
      <KpiCard
        label="Unique Customers"
        value={formatCount(kpis?.unique_customers)}
        icon={<Users className="h-4 w-4" />}
        href="/dashboard/customers"
      />
      <KpiCard
        label="New Customers"
        metricKey="new_customers"
        value={formatCount(kpis?.new_customers)}
        icon={<UserPlus className="h-4 w-4" />}
        href="/dashboard/customers"
      />
      <KpiCard
        label="COD Share"
        value={formatPct(kpis?.cod_pct)}
        icon={<CreditCard className="h-4 w-4" />}
        href="/dashboard/receivables"
      />
      <KpiCard
        label="RTO Rate"
        metricKey="rto_rate_pct"
        value={formatPct(kpis?.rto_rate_pct ?? kpis?.return_rate_pct)}
        alert={
          (kpis?.rto_rate_pct ?? kpis?.return_rate_pct ?? 0) > 15 ? "red"
          : (kpis?.rto_rate_pct ?? kpis?.return_rate_pct ?? 0) > 8 ? "amber"
          : undefined
        }
        invertDelta
        icon={<RefreshCcw className="h-4 w-4" />}
        href="/dashboard/operations"
      />
      <KpiCard
        label="RTO"
        metricKey="rto_count"
        value={formatCount(kpis?.rto_count ?? kpis?.return_count)}
        icon={<Package className="h-4 w-4" />}
        href="/dashboard/operations"
      />
    </div>
  );
}
