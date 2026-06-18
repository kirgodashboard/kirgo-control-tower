"use client";

import { cn } from "@/lib/utils";
import type { AlertSeverity } from "@/types/kpi";

interface SystemStatusBannerProps {
  status: AlertSeverity;
  redCount: number;
  amberCount: number;
  lastUpdated?: Date;
}

const statusConfig = {
  GREEN: {
    dotClass: "bg-emerald-500",
    glowClass: "status-pulse-green",
    ringColor: "ring-emerald-500/25",
    textClass: "text-emerald-500",
    bgClass: "bg-emerald-500/[0.06] border-emerald-500/20",
    label: "All Systems Healthy",
    sublabel: "No issues detected",
  },
  AMBER: {
    dotClass: "bg-amber-400 status-pulse-amber",
    glowClass: "",
    ringColor: "ring-amber-400/25",
    textClass: "text-amber-400",
    bgClass: "bg-amber-400/[0.06] border-amber-400/20",
    label: "Attention Required",
    sublabel: "Review warnings below",
  },
  RED: {
    dotClass: "bg-red-500 status-pulse-red",
    glowClass: "",
    ringColor: "ring-red-500/25",
    textClass: "text-red-400",
    bgClass: "bg-red-500/[0.06] border-red-500/20",
    label: "Action Required",
    sublabel: "Critical issues active",
  },
};

export function SystemStatusBanner({
  status,
  redCount,
  amberCount,
  lastUpdated,
}: SystemStatusBannerProps) {
  const cfg = statusConfig[status];

  return (
    <div className={cn(
      "rounded-xl border h-full flex flex-col items-center justify-center gap-4 p-5 min-h-[160px]",
      cfg.bgClass
    )}>
      {/* Traffic light indicator */}
      <div className={cn(
        "relative h-12 w-12 rounded-full ring-4 flex items-center justify-center",
        cfg.dotClass,
        cfg.ringColor,
      )}>
        {status !== "GREEN" && (
          <div className={cn("absolute inset-0 rounded-full", cfg.dotClass, "opacity-40 scale-125")} />
        )}
      </div>

      <div className="text-center space-y-1">
        <p className={cn("text-[15px] font-bold tracking-wide", cfg.textClass)}>
          {status}
        </p>
        <p className="text-[12px] text-muted-foreground">{cfg.label}</p>
      </div>

      {(redCount > 0 || amberCount > 0) && (
        <div className="flex flex-col gap-1.5 w-full">
          {redCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-red-500/10 border border-red-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 flex-shrink-0" />
              <span className="text-[11px] text-red-400 font-medium">{redCount} critical alert{redCount > 1 ? "s" : ""}</span>
            </div>
          )}
          {amberCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-amber-400/10 border border-amber-400/20">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 flex-shrink-0" />
              <span className="text-[11px] text-amber-400 font-medium">{amberCount} warning{amberCount > 1 ? "s" : ""}</span>
            </div>
          )}
        </div>
      )}

      {lastUpdated && (
        <p className="text-[10px] text-muted-foreground/50 font-medium">
          Updated {lastUpdated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
        </p>
      )}
    </div>
  );
}
