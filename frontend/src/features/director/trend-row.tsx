"use client";

import { type ReactNode } from "react";
import { useRevenueTrend30d, useCashFlow30d } from "@/lib/hooks/use-director-snapshot";
import { RevenueAreaChart } from "@/components/charts/revenue-area-chart";
import { OrdersBarChart } from "@/components/charts/orders-bar-chart";
import { CashFlowAreaChart } from "@/components/charts/cashflow-area-chart";

export function DirectorTrendRow() {
  const { data: trend, isLoading: trendLoading } = useRevenueTrend30d();
  const { data: cash, isLoading: cashLoading } = useCashFlow30d();

  const TrendCard = ({ title, subtitle, loading, children }: { title: string; subtitle: string; loading: boolean; children: ReactNode }) => (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{title}</p>
        <p className="text-[12px] text-muted-foreground/70 mt-0.5">{subtitle}</p>
      </div>
      {loading ? <div className="h-32 rounded-lg skeleton" /> : children}
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <TrendCard title="Revenue (30d)" subtitle="Daily delivered revenue" loading={trendLoading}>
        <RevenueAreaChart data={trend ?? []} height={128} compact={false} />
      </TrendCard>

      <TrendCard title="Orders (30d)" subtitle="Daily order count" loading={trendLoading}>
        <OrdersBarChart data={trend ?? []} height={128} compact={false} />
      </TrendCard>

      <TrendCard title="Cash Flow (30d)" subtitle="Inflow vs outflow" loading={cashLoading}>
        <CashFlowAreaChart data={cash ?? []} height={128} />
      </TrendCard>
    </div>
  );
}
