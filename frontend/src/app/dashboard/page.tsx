import { DirectorKpiRow } from "@/features/director/kpi-row";
import { DirectorTrendRow } from "@/features/director/trend-row";
import { AlertPanel } from "@/features/director/alert-panel";
import { BusinessSummary } from "@/features/director/business-summary";
import { StatusChipsStrip } from "@/features/director/status-chips";

export const metadata = { title: "Command Center · Kirgo" };

export default function DirectorCommandCenterPage() {
  return (
    <div className="min-h-full p-5 sm:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[28px] sm:text-[34px] font-bold text-foreground tracking-tight leading-tight">
          Command Center
        </h1>
        <p className="text-[14px] text-muted-foreground mt-1">
          Business health snapshot · auto-refreshes every 2 min
        </p>
      </div>

      {/* Status chips — quick-glance real-time indicators */}
      <StatusChipsStrip />

      {/* Business Summary — answers "how is the business doing?" */}
      <BusinessSummary />

      {/* KPI Grid */}
      <DirectorKpiRow />

      {/* Trend charts */}
      <DirectorTrendRow />

      {/* Active Alerts */}
      <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
        <AlertPanel />
      </div>
    </div>
  );
}
