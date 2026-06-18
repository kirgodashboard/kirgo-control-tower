"use client";

import { useSystemAlerts } from "@/lib/hooks/use-director-snapshot";
import { AlertCard, AlertCardSkeleton } from "./alert-card";
import { SectionHeader } from "@/components/ui/section-header";
import { CheckCircle } from "lucide-react";

export function AlertPanel() {
  const { data: alerts, isLoading } = useSystemAlerts();

  const healthyOnly =
    !isLoading &&
    alerts?.length === 1 &&
    alerts[0].severity === "GREEN";

  return (
    <div className="space-y-2">
      <SectionHeader
        title="Active Alerts"
        subtitle={
          isLoading
            ? "Checking systems…"
            : healthyOnly
            ? "No issues detected"
            : `${alerts?.filter((a) => a.severity === "RED").length ?? 0} critical · ${alerts?.filter((a) => a.severity === "AMBER").length ?? 0} warning`
        }
      />

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
