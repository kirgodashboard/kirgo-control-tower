"use client";

import { KpiCard, KpiCardSkeleton } from "@/components/ui/kpi-card";
import { useDirectorSnapshot } from "@/lib/hooks/use-director-snapshot";
import { formatINR, formatPct, formatCount } from "@/lib/utils/format";
import {
  TrendingUp, ShoppingCart, Wallet, AlertTriangle,
  RotateCcw, Truck, Users, Bell
} from "lucide-react";

export function DirectorKpiRow() {
  const { data: snap, isLoading } = useDirectorSnapshot();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {Array.from({ length: 8 }).map((_, i) => <KpiCardSkeleton key={i} />)}
      </div>
    );
  }

  if (!snap) return null;

  const returnAlert = snap.return_rate_pct > 12 ? "red" : snap.return_rate_pct > 8 ? "amber" : undefined;
  const deliveryAlert = snap.delivery_success_pct < 75 ? "red" : snap.delivery_success_pct < 87 ? "amber" : undefined;
  const alertBadgeAlert = snap.red_alert_count > 0 ? "red" : snap.amber_alert_count > 0 ? "amber" : "green";
  const alertBadgeValue = snap.red_alert_count > 0
    ? `${snap.red_alert_count} critical`
    : snap.amber_alert_count > 0
    ? `${snap.amber_alert_count} warning`
    : "All clear";

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      <KpiCard
        label="Revenue MTD"
        value={formatINR(snap.revenue_mtd_inr)}
        delta={snap.revenue_mtd_change_pct}
        deltaLabel="vs last month"
        icon={<TrendingUp className="h-4 w-4" />}
        href="/dashboard/sales-register"
      />
      <KpiCard
        label="Orders MTD"
        value={formatCount(snap.orders_mtd)}
        delta={snap.orders_mtd_change_pct}
        deltaLabel="vs last month"
        icon={<ShoppingCart className="h-4 w-4" />}
        href="/dashboard/sales-register"
      />
      <KpiCard
        label="Cash Position"
        value={formatINR(snap.cash_position_inr)}
        alert={snap.cash_position_inr < 50_000 ? "red" : snap.cash_position_inr < 2_00_000 ? "amber" : undefined}
        icon={<Wallet className="h-4 w-4" />}
        href="/dashboard/bank"
      />
      <KpiCard
        label="COD Outstanding"
        value={formatINR(snap.cod_outstanding_inr)}
        subValue={`${snap.cod_outstanding_count} shipments`}
        alert={snap.cod_outstanding_count > 20 ? "amber" : undefined}
        icon={<AlertTriangle className="h-4 w-4" />}
        href="/dashboard/receivables"
      />
      <KpiCard
        label="Return Rate"
        value={formatPct(snap.return_rate_pct)}
        alert={returnAlert}
        invertDelta
        icon={<RotateCcw className="h-4 w-4" />}
        href="/dashboard/operations"
      />
      <KpiCard
        label="Delivery Success"
        value={formatPct(snap.delivery_success_pct)}
        alert={deliveryAlert}
        icon={<Truck className="h-4 w-4" />}
        href="/dashboard/operations"
      />
      <KpiCard
        label="Repeat Customers"
        value={formatPct(snap.repeat_customer_pct)}
        alert={snap.repeat_customer_pct >= 30 ? "green" : undefined}
        icon={<Users className="h-4 w-4" />}
        href="/dashboard/customers"
      />
      <KpiCard
        label="Active Alerts"
        value={alertBadgeValue}
        alert={alertBadgeAlert}
        icon={<Bell className="h-4 w-4" />}
        href="/dashboard/data-audit"
      />
    </div>
  );
}
