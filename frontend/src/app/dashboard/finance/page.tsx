"use client";

import { useState } from "react";
import { FinanceKpiRow } from "@/features/finance/kpi-row";
import { GatewaySettlementsTable } from "@/features/finance/gateway-settlements-table";
import { CashFlowAreaChart } from "@/components/charts/cashflow-area-chart";
import { PageHeader, PeriodTabs, SectionLabel } from "@/components/ui/page-header";
import { useCashFlowDaily } from "@/lib/hooks/use-finance";
import { getPeriodDates, getMtdRange } from "@/lib/utils/date-ranges";
import type { Period } from "@/types/chart";

const PERIODS = [
  { key: "mtd", label: "MTD" },
  { key: "30d", label: "30 Days" },
  { key: "90d", label: "90 Days" },
  { key: "6m",  label: "6 Months" },
  { key: "1y",  label: "1 Year"   },
  { key: "all", label: "All Time" },
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
    <div className="rounded-xl border border-border bg-card p-5">
      <SectionLabel title="Cash Flow" description="Daily inflow vs outflow" className="mb-4" />
      {isLoading ? (
        <div className="h-52 rounded-lg skeleton" />
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
    <div className="min-h-full p-4 sm:p-6 space-y-6">
      <PageHeader title="Finance & Cash" subtitle={range.label}>
        <PeriodTabs value={period} options={PERIODS} onChange={(k) => setPeriod(k as Period | "mtd")} />
      </PageHeader>

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

