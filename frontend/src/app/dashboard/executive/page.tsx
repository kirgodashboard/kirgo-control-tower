"use client";

import { useState } from "react";
import { ExecKpiRow } from "@/features/executive/kpi-row";
import { PaymentSplitDonut } from "@/features/executive/payment-split-donut";
import { LaunchTable } from "@/features/executive/launch-table";
import { PageHeader, PeriodTabs } from "@/components/ui/page-header";
import { getPeriodDates, getMtdRange } from "@/lib/utils/date-ranges";
import type { Period } from "@/types/chart";

const PERIODS = [
  { key: "mtd", label: "MTD" },
  { key: "30d", label: "30 Days" },
  { key: "90d", label: "90 Days" },
  { key: "6m", label: "6 Months" },
  { key: "all", label: "All Time" },
];

export default function ExecutivePage() {
  const [period, setPeriod] = useState<Period | "mtd">("30d");

  const range = period === "mtd" ? getMtdRange() : getPeriodDates(period as Period);

  return (
    <div className="min-h-full p-4 sm:p-6 space-y-6">
      <PageHeader title="Executive Overview" subtitle={range.label}>
        <PeriodTabs value={period} options={PERIODS} onChange={(k) => setPeriod(k as Period | "mtd")} />
      </PageHeader>

      <ExecKpiRow start={range.start} end={range.end} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <LaunchTable />
        </div>
        <PaymentSplitDonut start={range.start} end={range.end} />
      </div>
    </div>
  );
}

