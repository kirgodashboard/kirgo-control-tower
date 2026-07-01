"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
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

function CustomersPageContent() {
  const searchParams = useSearchParams();
  const fromReview = searchParams.get("from") === "review";
  const rp = searchParams.get("rp") ?? "";
  const urlStart = searchParams.get("start");
  const urlEnd = searchParams.get("end");
  const urlLabel = searchParams.get("rl") ?? "";

  const [period, setPeriod] = useState<Period | "mtd">("30d");
  const range = (fromReview && urlStart && urlEnd)
    ? { start: urlStart, end: urlEnd, label: urlLabel }
    : period === "mtd" ? getMtdRange() : getPeriodDates(period as Period);

  const backHref = rp ? `/review?period=${rp}` : "/review";

  return (
    <div className="min-h-full p-4 sm:p-6 space-y-6">
      <PageHeader title="Customer Intelligence" subtitle={range.label} backHref={backHref}>
        {!fromReview && (
          <PeriodTabs value={period} options={PERIODS} onChange={(k) => setPeriod(k as Period | "mtd")} />
        )}
      </PageHeader>

      <CustomerKpiRow start={range.start} end={range.end} />

      <CustomerGrowthChart />

      <TopCitiesTable />
    </div>
  );
}

export default function CustomersPage() {
  return (
    <Suspense>
      <CustomersPageContent />
    </Suspense>
  );
}

