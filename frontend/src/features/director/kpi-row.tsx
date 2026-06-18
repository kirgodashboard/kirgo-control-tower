"use client";

import { KpiCard, KpiCardSkeleton } from "@/components/ui/kpi-card";
import { SystemStatusBanner } from "./system-status-banner";
import { useDirectorSnapshot } from "@/lib/hooks/use-director-snapshot";
import { formatINR, formatPct, formatCount } from "@/lib/utils/format";
import {
  TrendingUp, ShoppingCart, Wallet, AlertTriangle,
  RotateCcw, Truck, Users, Bell
} from "lucide-react";

export function DirectorKpiRow() {
  const { data: snap, isLoading, dataUpdatedAt } = useDirectorSnapshot();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <KpiCardSkeleton key={i} />)}
        </div>
        <div className="lg:col-span-1 rounded-xl border border-border bg-card h-48 lg:h-auto skeleton" />
      </div>
    );
  }

  if (!snap) return null;

  const returnAlert = snap.return_rate_pct > 15 ? "red" : snap.return_rate_pct > 10 ? "amber" : undefined;
  const alertBadgeAlert = snap.red_alert_count > 0 ? "red" : snap.amber_alert_count > 0 ? "amber" : "green";
  const alertBadgeValue = snap.red_alert_count > 0
    ? `${snap.red_alert_count} critical`
    : snap.amber_alert_count > 0
    ? `${snap.amber_alert_count} warning`
    : "All clear";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      <div className="lg:col-span-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          label="Revenue MTD"
          value={formatINR(snap.revenue_mtd_inr)}
          delta={snap.revenue_mtd_change_pct}
          deltaLabel="vs last month"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <KpiCard
          label="Orders MTD"
          value={formatCount(snap.orders_mtd)}
          delta={snap.orders_mtd_change_pct}
          deltaLabel="vs last month"
          icon={<ShoppingCart className="h-4 w-4" />}
        />
        <KpiCard
          label="Cash Position"
          value={formatINR(snap.cash_position_inr)}
          icon={<Wallet className="h-4 w-4" />}
        />
        <KpiCard
          label="COD Outstanding"
          value={formatINR(snap.cod_outstanding_inr)}
          subValue={`${snap.cod_outstanding_count} open shipments`}
          alert={snap.cod_outstanding_count > 20 ? "amber" : undefined}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <KpiCard
          label="Return Rate"
          value={formatPct(snap.return_rate_pct)}
          alert={returnAlert}
          invertDelta
          icon={<RotateCcw className="h-4 w-4" />}
        />
        <KpiCard
          label="Delivery Success"
          value={formatPct(snap.delivery_success_pct)}
          alert={(snap.delivery_success_pct ?? 0) < 75 ? "red" : (snap.delivery_success_pct ?? 0) < 85 ? "amber" : undefined}
          icon={<Truck className="h-4 w-4" />}
        />
        <KpiCard
          label="Repeat Customers"
          value={formatPct(snap.repeat_customer_pct)}
          icon={<Users className="h-4 w-4" />}
        />
        <KpiCard
          label="Active Alerts"
          value={alertBadgeValue}
          alert={alertBadgeAlert}
          icon={<Bell className="h-4 w-4" />}
        />
      </div>

      <div className="lg:col-span-1">
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
