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
    dot: "bg-emerald-500",
    ring: "ring-emerald-500/30",
    text: "text-emerald-500",
    label: "All Systems Healthy",
    bg: "bg-emerald-500/10",
  },
  AMBER: {
    dot: "bg-amber-400 animate-pulse",
    ring: "ring-amber-400/30",
    text: "text-amber-400",
    label: "Attention Required",
    bg: "bg-amber-400/10",
  },
  RED: {
    dot: "bg-red-500 animate-pulse",
    ring: "ring-red-500/30",
    text: "text-red-500",
    label: "Action Required",
    bg: "bg-red-500/10",
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
    <div
      className={cn(
        "rounded-lg border border-border p-4 flex flex-col items-center justify-center gap-3",
        cfg.bg
      )}
    >
      {/* Traffic light dot */}
      <div
        className={cn(
          "h-10 w-10 rounded-full ring-4",
          cfg.dot,
          cfg.ring
        )}
      />

      <div className="text-center">
        <p className={cn("text-sm font-bold", cfg.text)}>{status}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{cfg.label}</p>
      </div>

      {/* Alert counts */}
      {(redCount > 0 || amberCount > 0) && (
        <div className="flex gap-3 text-xs">
          {redCount > 0 && (
            <span className="flex items-center gap-1 text-red-500">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
              {redCount} critical
            </span>
          )}
          {amberCount > 0 && (
            <span className="flex items-center gap-1 text-amber-400">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
              {amberCount} warning
            </span>
          )}
        </div>
      )}

      {lastUpdated && (
        <p className="text-[10px] text-muted-foreground/60">
          Updated {lastUpdated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
        </p>
      )}
    </div>
  );
}
