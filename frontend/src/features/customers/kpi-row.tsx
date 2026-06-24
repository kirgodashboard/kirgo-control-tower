"use client";

import { KpiCard, KpiCardSkeleton } from "@/components/ui/kpi-card";
import { useCustomerKpis } from "@/lib/hooks/use-customers";
import { formatCount, formatPct } from "@/lib/utils/format";
import { Users, UserPlus, Repeat, TrendingUp, BarChart2 } from "lucide-react";

interface Props { start: string; end: string; }

export function CustomerKpiRow({ start, end }: Props) {
  const { data, isLoading } = useCustomerKpis(start, end);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => <KpiCardSkeleton key={i} />)}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      <KpiCard
        label="Total Customers"
        value={formatCount(data?.total_customers)}
        icon={<Users className="h-4 w-4" />}
        href="/dashboard/sales-register"
      />
      <KpiCard
        label="New Customers"
        value={formatCount(data?.new_customers)}
        icon={<UserPlus className="h-4 w-4" />}
        href="/dashboard/sales-register"
      />
      <KpiCard
        label="Repeat Customers"
        value={formatCount(data?.repeat_customers)}
        icon={<Repeat className="h-4 w-4" />}
        href="/dashboard/sales-register"
      />
      <KpiCard
        label="Repeat Rate"
        value={formatPct(data?.repeat_purchase_pct)}
        icon={<TrendingUp className="h-4 w-4" />}
        href="/dashboard/sales-register"
      />
      <KpiCard
        label="Avg Orders / Customer"
        value={data?.avg_orders_per_customer != null ? `${Number(data.avg_orders_per_customer).toFixed(1)}` : "—"}
        icon={<BarChart2 className="h-4 w-4" />}
        href="/dashboard/sales-register"
      />
    </div>
  );
}
