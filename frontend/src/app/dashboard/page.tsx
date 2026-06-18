import { DirectorKpiRow } from "@/features/director/kpi-row";
import { DirectorTrendRow } from "@/features/director/trend-row";
import { AlertPanel } from "@/features/director/alert-panel";

export const metadata = { title: "Command Center · Kirgo" };

export default function DirectorCommandCenterPage() {
  return (
    <div className="min-h-full p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[17px] font-bold text-foreground tracking-tight">Command Center</h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Business health snapshot · auto-refreshes every 2 min
          </p>
        </div>
      </div>

      <DirectorKpiRow />
      <DirectorTrendRow />

      <div className="rounded-xl border border-border bg-card p-5">
        <AlertPanel />
      </div>
    </div>
  );
}
