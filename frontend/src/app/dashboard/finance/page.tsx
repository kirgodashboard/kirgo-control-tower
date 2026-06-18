"use client";

import { useState } from "react";
import { FinanceKpiRow } from "@/features/finance/kpi-row";
import { GatewaySettlementsTable } from "@/features/finance/gateway-settlements-table";
import { CashFlowAreaChart } from "@/components/charts/cashflow-area-chart";
import { useCashFlowDaily } from "@/lib/hooks/use-finance";
import { getPeriodDates, getMtdRange } from "@/lib/utils/date-ranges";
import type { Period } from "@/types/chart";

const PERIODS: { key: Period | "mtd"; label: string }[] = [
  { key: "mtd", label: "MTD" },
  { key: "30d", label: "30 Days" },
  { key: "90d", label: "90 Days" },
  { key: "6m", label: "6 Months" },
];

function CashFlowPanel({ start }: { start: string }) {
  const { data = [], isLoading } = useCashFlowDaily(start);
  const chartData = (data as { transaction_date: string; inflow_inr: number; outflow_inr: number; net_inr: number }[]).map((r) => ({
    transaction_date: r.transaction_date,
    inflow_inr: Number(r.inflow_inr),
    outflow_inr: Number(r.outflow_inr),
    net_inr: Number(r.net_inr),
  }));

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">Cash Flow</p>
      {isLoading ? (
        <div className="h-52 bg-muted animate-pulse rounded" />
      ) : (
        <CashFlowAreaChart data={chartData} height={208} />
      )}
    </div>
  );
}

export default function FinancePage() {
  const [period, setPeriod] = useState<Period | "mtd">("30d");
  const range = period === "mtd" ? getMtdRange() : getPeriodDates(period as Period);

  return (
    <div className="p-5 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-foreground">Finance & Cash</h1>
          <p className="text-xs text-muted-foreground">{range.label}</p>
        </div>
        <div className="flex gap-1 bg-accent/40 rounded-lg p-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                period === p.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <FinanceKpiRow start={range.start} end={range.end} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <CashFlowPanel start={range.start} />
        </div>
        <GatewaySettlementsTable />
      </div>
    </div>
  );
}
