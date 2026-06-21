"use client";

import Link from "next/link";
import { useRevenueForecast, useCustomerForecast } from "@/lib/hooks/use-forecasting";
import { formatINR } from "@/lib/utils/format";
import { TrendingUp, Users, DollarSign, ArrowRight } from "lucide-react";

function ForecastCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  loading,
}: {
  icon: React.ElementType;
  label: string;
  value: string | null;
  sub: string;
  color: string;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex gap-3 items-start">
      <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        {loading ? (
          <div className="mt-1.5 h-5 w-20 rounded bg-muted animate-pulse" />
        ) : (
          <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">{value ?? "—"}</p>
        )}
        <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
      </div>
    </div>
  );
}

export function ForecastInsightCards() {
  const { data: revenue, isLoading: revLoading } = useRevenueForecast();
  const { data: customers, isLoading: custLoading } = useCustomerForecast();

  const nextMonthRev = revenue ? formatINR(revenue.horizon_30d.expected_inr) : null;
  const next3MonthRev = revenue ? formatINR(revenue.horizon_90d.expected_inr) : null;

  const totalNewCustomers6M = customers
    ? customers.reduce((s, p) => s + p.new_customers_expected, 0)
    : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-foreground">Forecast Outlook</p>
        <Link
          href="/dashboard/forecasting"
          className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
        >
          Full forecast <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ForecastCard
          icon={DollarSign}
          label="Next 30 Days"
          value={nextMonthRev}
          sub="Expected revenue"
          color="bg-violet-500/10 text-violet-400"
          loading={revLoading}
        />
        <ForecastCard
          icon={TrendingUp}
          label="Next 90 Days"
          value={next3MonthRev}
          sub="Expected revenue"
          color="bg-violet-500/10 text-violet-400"
          loading={revLoading}
        />
        <ForecastCard
          icon={Users}
          label="Customer Growth"
          value={totalNewCustomers6M != null ? `~${totalNewCustomers6M} new` : null}
          sub="Projected over 6 months"
          color="bg-emerald-500/10 text-emerald-400"
          loading={custLoading}
        />
      </div>
    </div>
  );
}
