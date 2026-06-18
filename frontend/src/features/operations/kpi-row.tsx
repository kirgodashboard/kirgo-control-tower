"use client";

import { KpiCard, KpiCardSkeleton } from "@/components/ui/kpi-card";
import { useOperationsKpis } from "@/lib/hooks/use-operations";
import { formatCount, formatPct, formatINR } from "@/lib/utils/format";
import { Truck, CheckCircle, Clock, RotateCcw, AlertCircle, TrendingUp, TrendingDown, DollarSign } from "lucide-react";

interface Props { start: string; end: string; }

export function OpsKpiRow({ start, end }: Props) {
  const { data, isLoading } = useOperationsKpis(start, end);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => <KpiCardSkeleton key={i} />)}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <KpiCard
        label="Total Shipments"
        value={formatCount(data?.total_shipments)}
        icon={<Truck className="h-4 w-4" />}
      />
      <KpiCard
        label="Delivered"
        value={formatCount(data?.delivered)}
        subValue={formatPct(data?.delivery_success_pct) + " success rate"}
        icon={<CheckCircle className="h-4 w-4" />}
        alert={
          (data?.delivery_success_pct ?? 0) < 70 ? "red"
          : (data?.delivery_success_pct ?? 0) < 85 ? "amber"
          : "green"
        }
      />
      <KpiCard
        label="In Transit"
        value={formatCount(data?.in_transit)}
        icon={<Clock className="h-4 w-4" />}
      />
      <KpiCard
        label="RTO"
        value={formatCount(data?.rto)}
        subValue={formatPct(data?.rto_rate_pct) + " of shipments"}
        icon={<RotateCcw className="h-4 w-4" />}
        alert={(data?.rto_rate_pct ?? 0) > 15 ? "red" : (data?.rto_rate_pct ?? 0) > 8 ? "amber" : undefined}
      />
      <KpiCard
        label="Pending"
        value={formatCount(data?.pending)}
        icon={<AlertCircle className="h-4 w-4" />}
      />
      <KpiCard
        label="Delivery %"
        value={formatPct(data?.delivery_success_pct)}
        icon={<TrendingUp className="h-4 w-4" />}
      />
      <KpiCard
        label="RTO Rate"
        value={formatPct(data?.rto_rate_pct)}
        icon={<TrendingDown className="h-4 w-4" />}
      />
      <KpiCard
        label="COD Outstanding"
        value={formatINR(data?.cod_outstanding_inr)}
        subValue={`${data?.cod_outstanding_count ?? 0} shipments`}
        icon={<DollarSign className="h-4 w-4" />}
        alert={(data?.cod_outstanding_count ?? 0) > 20 ? "amber" : undefined}
      />
    </div>
  );
}
