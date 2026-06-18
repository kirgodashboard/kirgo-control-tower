"use client";

import { useState } from "react";
import { CustomerKpiRow } from "@/features/customers/kpi-row";
import { CustomerGrowthChart } from "@/features/customers/growth-chart";
import { TopCitiesTable } from "@/features/customers/top-cities-table";
import { getPeriodDates, getMtdRange } from "@/lib/utils/date-ranges";
import type { Period } from "@/types/chart";

const PERIODS: { key: Period | "mtd"; label: string }[] = [
  { key: "mtd", label: "MTD" },
  { key: "30d", label: "30 Days" },
  { key: "90d", label: "90 Days" },
  { key: "6m", label: "6 Months" },
];

export default function CustomersPage() {
  const [period, setPeriod] = useState<Period | "mtd">("30d");
  const range = period === "mtd" ? getMtdRange() : getPeriodDates(period as Period);

  return (
    <div className="p-5 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-foreground">Customer Intelligence</h1>
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

      <CustomerKpiRow start={range.start} end={range.end} />

      <CustomerGrowthChart />

      <TopCitiesTable />
    </div>
  );
}
