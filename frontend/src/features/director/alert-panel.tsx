"use client";

import { useSystemAlerts } from "@/lib/hooks/use-director-snapshot";
import { AlertCard, AlertCardSkeleton } from "./alert-card";
import { CheckCircle } from "lucide-react";

export function AlertPanel() {
  const { data: alerts, isLoading } = useSystemAlerts();

  const healthyOnly =
    !isLoading &&
    alerts?.length === 1 &&
    alerts[0].severity === "GREEN";

  const redCount = alerts?.filter((a) => a.severity === "RED").length ?? 0;
  const amberCount = alerts?.filter((a) => a.severity === "AMBER").length ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[18px] font-semibold text-foreground">Active Alerts</p>
        <p className="text-[13px] text-muted-foreground">
          {isLoading ? "Checking systems…" : healthyOnly ? "No issues detected" : `${redCount} critical · ${amberCount} warning`}
        </p>
      </div>

      <div className="space-y-1.5">
        {isLoading ? (
          <>
            <AlertCardSkeleton />
            <AlertCardSkeleton />
          </>
        ) : healthyOnly ? (
          <div className="flex items-center gap-2 px-4 py-3 text-emerald-500 bg-emerald-500/5 border border-emerald-500/20 rounded-md">
            <CheckCircle className="h-4 w-4 flex-shrink-0" />
            <p className="text-sm">All systems are operating normally.</p>
          </div>
        ) : (
          alerts
            ?.filter((a) => a.severity !== "GREEN")
            .map((alert, i) => <AlertCard key={i} alert={alert} />)
        )}
      </div>
    </div>
  );
}
