"use client";

import { KpiCard, KpiCardSkeleton } from "@/components/ui/kpi-card";
import { SystemStatusBanner } from "./system-status-banner";
import { useDirectorSnapshot } from "@/lib/hooks/use-director-snapshot";
import { formatINR, formatPct, formatCount } from "@/lib/utils/format";

export function DirectorKpiRow() {
  const { data: snap, isLoading, dataUpdatedAt } = useDirectorSnapshot();

  if (isLoading) {
    return (
      <div className="grid grid-cols-5 gap-3">
        <div className="col-span-4 grid grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <KpiCardSkeleton key={i} className="director-card border-zinc-800" />
          ))}
        </div>
        <div className="col-span-1">
          <div className="director-card rounded-lg border border-zinc-800 h-full animate-pulse" />
        </div>
      </div>
    );
  }

  if (!snap) return null;

  const returnAlert =
    snap.return_rate_pct > 15
      ? "red"
      : snap.return_rate_pct > 10
      ? "amber"
      : undefined;

  const alertBadgeAlert =
    snap.red_alert_count > 0
      ? "red"
      : snap.amber_alert_count > 0
      ? "amber"
      : "green";

  const alertBadgeValue =
    snap.red_alert_count > 0
      ? `${snap.red_alert_count} critical`
      : snap.amber_alert_count > 0
      ? `${snap.amber_alert_count} warning`
      : "None";

  return (
    <div className="grid grid-cols-5 gap-3">
      {/* 8 KPI cards in 2 rows × 4 */}
      <div className="col-span-4 grid grid-cols-4 gap-3">
        {/* Row 1 */}
        <KpiCard
          label="Revenue MTD"
          value={formatINR(snap.revenue_mtd_inr)}
          delta={snap.revenue_mtd_change_pct}
          deltaLabel="vs last month"
          className="director-card border-zinc-800"
        />
        <KpiCard
          label="Orders MTD"
          value={formatCount(snap.orders_mtd)}
          delta={snap.orders_mtd_change_pct}
          deltaLabel="vs last month"
          className="director-card border-zinc-800"
        />
        <KpiCard
          label="Cash Position"
          value={formatINR(snap.cash_position_inr)}
          className="director-card border-zinc-800"
        />
        <KpiCard
          label="COD Outstanding"
          value={formatINR(snap.cod_outstanding_inr)}
          subValue={`${snap.cod_outstanding_count} open shipments`}
          alert={snap.cod_outstanding_count > 20 ? "amber" : undefined}
          className="director-card border-zinc-800"
        />

        {/* Row 2 */}
        <KpiCard
          label="Return Rate"
          value={formatPct(snap.return_rate_pct)}
          alert={returnAlert}
          className="director-card border-zinc-800"
        />
        <KpiCard
          label="Delivery Success"
          value={formatPct(snap.delivery_success_pct)}
          className="director-card border-zinc-800"
        />
        <KpiCard
          label="Repeat Customers"
          value={formatPct(snap.repeat_customer_pct)}
          className="director-card border-zinc-800"
        />
        <KpiCard
          label="Active Alerts"
          value={alertBadgeValue}
          alert={alertBadgeAlert}
          className="director-card border-zinc-800"
        />
      </div>

      {/* System status panel */}
      <div className="col-span-1">
        <SystemStatusBanner
          status={snap.system_status}
          redCount={snap.red_alert_count}
          amberCount={snap.amber_alert_count}
          lastUpdated={dataUpdatedAt ? new Date(dataUpdatedAt) : undefined}
        />
      </div>
    </div>
  );
}
