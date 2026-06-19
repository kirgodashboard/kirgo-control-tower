"use client";

import { type ReactNode } from "react";
import { useRevenueTrend30d } from "@/lib/hooks/use-director-snapshot";
import { RevenueAreaChart } from "@/components/charts/revenue-area-chart";
import { OrdersBarChart } from "@/components/charts/orders-bar-chart";

export function DirectorTrendRow() {
  const { data: trend, isLoading: trendLoading } = useRevenueTrend30d();

  const TrendCard = ({
    title,
    subtitle,
    loading,
    children,
  }: {
    title: string;
    subtitle: string;
    loading: boolean;
    children: ReactNode;
  }) => (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="mb-4">
        <p className="text-[17px] font-semibold text-foreground">{title}</p>
        <p className="text-[13px] text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
      {loading ? <div className="h-36 rounded-lg skeleton" /> : children}
    </div>
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <TrendCard
        title="Revenue — Last 30 Days"
        subtitle="Daily delivered revenue"
        loading={trendLoading}
      >
        <RevenueAreaChart data={trend ?? []} height={144} compact={false} />
      </TrendCard>

      <TrendCard
        title="Orders — Last 30 Days"
        subtitle="Daily order count"
        loading={trendLoading}
      >
        <OrdersBarChart data={trend ?? []} height={144} compact={false} />
      </TrendCard>
    </div>
  );
}
