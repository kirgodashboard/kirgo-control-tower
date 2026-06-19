"use client";

import { cn } from "@/lib/utils";
import { useDirectorSnapshot } from "@/lib/hooks/use-director-snapshot";
import { formatINR, formatPct } from "@/lib/utils/format";
import {
  TrendingUp, TrendingDown, RotateCcw, Truck, AlertTriangle, Bell
} from "lucide-react";

type ChipLevel = "green" | "amber" | "red";

interface Chip {
  icon: React.ReactNode;
  label: string;
  value: string;
  level: ChipLevel;
}

const chipBg: Record<ChipLevel, string> = {
  green: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
  amber: "bg-amber-400/10 border-amber-400/20 text-amber-400",
  red:   "bg-red-500/10 border-red-500/20 text-red-400",
};

const iconColor: Record<ChipLevel, string> = {
  green: "text-emerald-500",
  amber: "text-amber-400",
  red:   "text-red-400",
};

export function StatusChipsStrip() {
  const { data: snap, isLoading } = useDirectorSnapshot();

  if (isLoading) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-none">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 w-32 rounded-full skeleton flex-shrink-0" />
        ))}
      </div>
    );
  }

  if (!snap) return null;

  const rev = snap.revenue_mtd_change_pct;
  const rr  = snap.return_rate_pct;
  const del = snap.delivery_success_pct;
  const cod = snap.cod_outstanding_inr;

  const chips: Chip[] = [
    {
      icon: rev >= 0
        ? <TrendingUp className="h-3.5 w-3.5" />
        : <TrendingDown className="h-3.5 w-3.5" />,
      label: "Revenue",
      value: `${rev >= 0 ? "+" : ""}${rev.toFixed(1)}% MoM`,
      level: rev > 10 ? "green" : rev >= 0 ? "amber" : "red",
    },
    {
      icon: <RotateCcw className="h-3.5 w-3.5" />,
      label: "Returns",
      value: formatPct(rr),
      level: rr < 8 ? "green" : rr < 12 ? "amber" : "red",
    },
    {
      icon: <Truck className="h-3.5 w-3.5" />,
      label: "Delivery",
      value: formatPct(del),
      level: del >= 87 ? "green" : del >= 75 ? "amber" : "red",
    },
    {
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      label: "COD",
      value: formatINR(cod),
      level: cod > 1_00_000 ? "red" : cod > 40_000 ? "amber" : "green",
    },
    {
      icon: <Bell className="h-3.5 w-3.5" />,
      label: "Alerts",
      value: snap.red_alert_count > 0
        ? `${snap.red_alert_count} critical`
        : snap.amber_alert_count > 0
        ? `${snap.amber_alert_count} warning`
        : "All clear",
      level: snap.red_alert_count > 0 ? "red" : snap.amber_alert_count > 0 ? "amber" : "green",
    },
  ];

  return (
    <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-none">
      {chips.map((chip) => (
        <div
          key={chip.label}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[12px] font-medium whitespace-nowrap flex-shrink-0 select-none",
            chipBg[chip.level]
          )}
        >
          <span className={cn("flex-shrink-0", iconColor[chip.level])}>
            {chip.icon}
          </span>
          <span className="text-muted-foreground font-normal">{chip.label}</span>
          <span className="font-semibold">{chip.value}</span>
        </div>
      ))}
    </div>
  );
}
