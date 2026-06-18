import { DirectorKpiRow } from "@/features/director/kpi-row";
import { DirectorTrendRow } from "@/features/director/trend-row";
import { AlertPanel } from "@/features/director/alert-panel";

export const metadata = { title: "Command Center · Kirgo" };

export default function DirectorCommandCenterPage() {
  return (
    <div className="director-canvas min-h-full p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight">
            Command Center
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Business health snapshot · auto-refreshes every 2 min
          </p>
        </div>
      </div>

      {/* 8 KPI cards + system status */}
      <DirectorKpiRow />

      {/* Revenue + Orders + Cash trends */}
      <DirectorTrendRow />

      {/* Alert panel */}
      <div className="director-card rounded-lg border border-zinc-800 p-5">
        <AlertPanel />
      </div>
    </div>
  );
}
