"use client";

import { useRevenueTrend30d, useCashFlow30d } from "@/lib/hooks/use-director-snapshot";
import { RevenueAreaChart } from "@/components/charts/revenue-area-chart";
import { OrdersBarChart } from "@/components/charts/orders-bar-chart";
import { CashFlowAreaChart } from "@/components/charts/cashflow-area-chart";
import { SectionHeader } from "@/components/ui/section-header";

export function DirectorTrendRow() {
  const { data: trend, isLoading: trendLoading } = useRevenueTrend30d();
  const { data: cash, isLoading: cashLoading } = useCashFlow30d();

  return (
    <div className="grid grid-cols-3 gap-4">
      {/* Revenue trend */}
      <div className="director-card rounded-lg border border-zinc-800 p-4 space-y-3">
        <SectionHeader title="Revenue (30d)" subtitle="Daily delivered revenue" />
        {trendLoading ? (
          <div className="h-32 animate-pulse rounded bg-zinc-800" />
        ) : (
          <RevenueAreaChart
            data={trend ?? []}
            height={128}
            compact={false}
          />
        )}
      </div>

      {/* Orders trend */}
      <div className="director-card rounded-lg border border-zinc-800 p-4 space-y-3">
        <SectionHeader title="Orders (30d)" subtitle="Daily order count" />
        {trendLoading ? (
          <div className="h-32 animate-pulse rounded bg-zinc-800" />
        ) : (
          <OrdersBarChart
            data={trend ?? []}
            height={128}
            compact={false}
          />
        )}
      </div>

      {/* Cash flow trend */}
      <div className="director-card rounded-lg border border-zinc-800 p-4 space-y-3">
        <SectionHeader title="Cash Flow (30d)" subtitle="Inflow vs outflow" />
        {cashLoading ? (
          <div className="h-32 animate-pulse rounded bg-zinc-800" />
        ) : (
          <CashFlowAreaChart
            data={cash ?? []}
            height={128}
          />
        )}
      </div>
    </div>
  );
}
