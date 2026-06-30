"use client";

import { useState } from "react";
import { CustomerKpiRow } from "@/features/customers/kpi-row";
import { CustomerGrowthChart } from "@/features/customers/growth-chart";
import { TopCitiesTable } from "@/features/customers/top-cities-table";
import { PageHeader, PeriodTabs } from "@/components/ui/page-header";
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

export default function CustomersPage() {
  const [period, setPeriod] = useState<Period | "mtd">("30d");
  const range = period === "mtd" ? getMtdRange() : getPeriodDates(period as Period);

  return (
    <div className="min-h-full p-4 sm:p-6 space-y-6">
      <PageHeader title="Customer Intelligence" subtitle={range.label}>
        <PeriodTabs value={period} options={PERIODS} onChange={(k) => setPeriod(k as Period | "mtd")} />
      </PageHeader>

      <CustomerKpiRow start={range.start} end={range.end} />

      <CustomerGrowthChart />

      <TopCitiesTable />
    </div>
  );
}

