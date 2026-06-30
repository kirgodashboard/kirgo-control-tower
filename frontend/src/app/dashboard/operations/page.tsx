"use client";

import { useState } from "react";
import { OpsKpiRow } from "@/features/operations/kpi-row";
import { ShipmentFunnelChart } from "@/features/operations/shipment-funnel-chart";
import { CodTable } from "@/features/operations/cod-table";
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

export default function OperationsPage() {
  const [period, setPeriod] = useState<Period | "mtd">("30d");
  const range = period === "mtd" ? getMtdRange() : getPeriodDates(period as Period);

  return (
    <div className="min-h-full p-4 sm:p-6 space-y-6">
      <PageHeader title="Operations" subtitle={range.label}>
        <PeriodTabs value={period} options={PERIODS} onChange={(k) => setPeriod(k as Period | "mtd")} />
      </PageHeader>

      <OpsKpiRow start={range.start} end={range.end} />

      <ShipmentFunnelChart />

      <CodTable />
    </div>
  );
}

