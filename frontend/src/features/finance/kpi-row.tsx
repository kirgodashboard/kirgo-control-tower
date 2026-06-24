"use client";

import { KpiCard, KpiCardSkeleton } from "@/components/ui/kpi-card";
import { useFinanceKpis } from "@/lib/hooks/use-finance";
import { formatINR, formatCount } from "@/lib/utils/format";
import { ArrowDownCircle, ArrowUpCircle, Activity, Wallet, Hash } from "lucide-react";

interface Props { start: string; end: string; }

export function FinanceKpiRow({ start, end }: Props) {
  const { data, isLoading } = useFinanceKpis(start, end);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => <KpiCardSkeleton key={i} />)}
      </div>
    );
  }

  const netCash = data?.net_cash_inr ?? 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      <KpiCard
        label="Cash Inflow"
        value={formatINR(data?.cash_inflow_inr)}
        icon={<ArrowDownCircle className="h-4 w-4 text-emerald-500" />}
        href="/dashboard/bank"
      />
      <KpiCard
        label="Cash Outflow"
        value={formatINR(data?.cash_outflow_inr)}
        icon={<ArrowUpCircle className="h-4 w-4 text-red-400" />}
        href="/dashboard/bank"
      />
      <KpiCard
        label="Net Cash Flow"
        value={formatINR(netCash)}
        alert={netCash < 0 ? "red" : undefined}
        icon={<Activity className="h-4 w-4" />}
        href="/dashboard/bank"
      />
      <KpiCard
        label="Current Balance"
        value={formatINR(data?.latest_balance_inr)}
        alert={
          (data?.latest_balance_inr ?? 0) < 10000 ? "red"
          : (data?.latest_balance_inr ?? 0) < 50000 ? "amber"
          : undefined
        }
        icon={<Wallet className="h-4 w-4" />}
        href="/dashboard/bank"
      />
      <KpiCard
        label="Transactions"
        value={formatCount(data?.transaction_count)}
        icon={<Hash className="h-4 w-4" />}
        href="/dashboard/bank"
      />
    </div>
  );
}
