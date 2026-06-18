"use client";

import { useState } from "react";
import { RevenueAreaChart } from "@/components/charts/revenue-area-chart";
import { OrdersBarChart } from "@/components/charts/orders-bar-chart";
import { useRevenueTrend } from "@/lib/hooks/use-executive";
import { getPeriodDates, getMtdRange } from "@/lib/utils/date-ranges";
import type { Period, Grain } from "@/types/chart";

const PRESETS: { key: Period | "mtd"; label: string; grain: Grain }[] = [
  { key: "mtd", label: "MTD", grain: "day" },
  { key: "30d", label: "30D", grain: "day" },
  { key: "90d", label: "90D", grain: "week" },
  { key: "6m", label: "6M", grain: "month" },
];

type Tab = "revenue" | "orders";

export function RevenueTrendPanel() {
  const [preset, setPreset] = useState<Period | "mtd">("30d");
  const [tab, setTab] = useState<Tab>("revenue");

  const range = preset === "mtd" ? getMtdRange() : getPeriodDates(preset as Period);
  const grain = PRESETS.find((p) => p.key === preset)?.grain ?? "day";

  const { data = [], isLoading } = useRevenueTrend(range.start, range.end, grain);

  return (
    <div className="rounded-lg border border-border bg-card p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1">
          {(["revenue", "orders"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                tab === t
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              {t === "revenue" ? "Revenue" : "Orders"}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                preset === p.key
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="h-52 flex items-center justify-center text-xs text-muted-foreground">
          Loading...
        </div>
      ) : tab === "revenue" ? (
        <RevenueAreaChart data={data} height={208} />
      ) : (
        <OrdersBarChart data={data} height={208} />
      )}
    </div>
  );
}
