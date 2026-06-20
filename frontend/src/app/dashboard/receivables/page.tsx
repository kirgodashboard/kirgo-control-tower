"use client";

import { RefreshCw, DollarSign, Clock, AlertCircle, CheckCircle, TrendingDown } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { useReceivablesSummary, useReceivablesList } from "@/lib/hooks/use-orders";
import { useClassificationSummary } from "@/lib/hooks/use-orders";
import { formatINR, formatCount } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import type { ReceivablesListItem } from "@/types/kpi";

function ageAlert(days: number): "red" | "amber" | undefined {
  if (days >= 22) return "red";
  if (days >= 8)  return "amber";
  return undefined;
}

function AgeBadge({ days }: { days: number }) {
  const cls =
    days >= 22 ? "bg-red-500/10 text-red-400 border-red-500/20" :
    days >= 8  ? "bg-amber-400/10 text-amber-400 border-amber-400/20" :
                 "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border", cls)}>
      {days}d
    </span>
  );
}

function ReceivablesRow({ item }: { item: ReceivablesListItem }) {
  return (
    <tr className="border-b border-border/30 hover:bg-accent/20 transition-colors">
      <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
        #{item.woocommerce_order_id}
      </td>
      <td className="px-3 py-2.5 text-[12px] text-foreground">
        <span className="font-medium">{item.customer_name}</span>
        {item.billing_city && (
          <span className="block text-[10px] text-muted-foreground">{item.billing_city}</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-[12px] text-muted-foreground whitespace-nowrap">
        {item.ordered_at}
      </td>
      <td className="px-3 py-2.5 text-right text-[13px] font-semibold tabular-nums text-foreground whitespace-nowrap">
        {formatINR(item.order_total_inr)}
      </td>
      <td className="px-3 py-2.5">
        <AgeBadge days={item.days_outstanding} />
      </td>
      <td className="px-3 py-2.5 text-[11px] text-muted-foreground capitalize">
        {item.status.replace(/-/g, " ")}
      </td>
      <td className="px-3 py-2.5">
        {item.days_outstanding >= 22 ? (
          <span className="text-[10px] font-semibold text-red-400">Follow up</span>
        ) : item.days_outstanding >= 8 ? (
          <span className="text-[10px] font-semibold text-amber-400">Monitor</span>
        ) : (
          <span className="text-[10px] text-muted-foreground">Recent</span>
        )}
      </td>
    </tr>
  );
}

function AgeBucket({ label, count, value, cls }: { label: string; count: number; value: number; cls: string }) {
  if (count === 0) return null;
  return (
    <div className={cn("rounded-lg border p-3", cls)}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-[18px] font-bold tabular-nums mt-0.5">{count} orders</p>
      <p className="text-[11px] text-muted-foreground">{formatINR(value)}</p>
    </div>
  );
}

export default function ReceivablesPage() {
  const { data: summary, isLoading: sumLoading } = useReceivablesSummary();
  const { data: items = [], isLoading: listLoading, refetch } = useReceivablesList(200);
  const { data: classSummary = [] } = useClassificationSummary();

  const promoCount = classSummary
    .filter((s) => ["influencer_promotion", "brand_seeding"].includes(s.classification))
    .reduce((a, s) => a + Number(s.order_count), 0);
  const promoValue = classSummary
    .filter((s) => ["influencer_promotion", "brand_seeding"].includes(s.classification))
    .reduce((a, s) => a + Number(s.total_value_inr), 0);

  const recent  = items.filter((i) => i.days_outstanding < 8);
  const warning = items.filter((i) => i.days_outstanding >= 8 && i.days_outstanding < 22);
  const overdue = items.filter((i) => i.days_outstanding >= 22);

  const recentVal  = recent.reduce((a, i) => a + i.order_total_inr, 0);
  const warningVal = warning.reduce((a, i) => a + i.order_total_inr, 0);
  const overdueVal = overdue.reduce((a, i) => a + i.order_total_inr, 0);

  return (
    <div className="min-h-full p-4 sm:p-6 space-y-6">
      <PageHeader
        title="Receivables"
        subtitle="Genuine COD orders awaiting payment — promotional orders excluded"
      >
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </PageHeader>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          label="Total Outstanding"
          value={sumLoading ? undefined : formatINR(summary?.total_outstanding_inr ?? 0)}
          icon={<DollarSign className="h-3.5 w-3.5" />}
          alert={
            (summary?.total_outstanding_inr ?? 0) > 100_000 ? "red" :
            (summary?.total_outstanding_inr ?? 0) > 50_000  ? "amber" : undefined
          }
        />
        <KpiCard
          label="Orders Pending"
          value={sumLoading ? undefined : formatCount(summary?.order_count ?? 0)}
          icon={<Clock className="h-3.5 w-3.5" />}
        />
        <KpiCard
          label="Avg Days Outstanding"
          value={sumLoading ? undefined : `${summary?.avg_days_outstanding?.toFixed(1) ?? "—"}d`}
          icon={<TrendingDown className="h-3.5 w-3.5" />}
          alert={(summary?.avg_days_outstanding ?? 0) > 15 ? "amber" : undefined}
        />
        <KpiCard
          label="Oldest Order"
          value={sumLoading ? undefined : `${summary?.oldest_days ?? 0}d`}
          icon={<AlertCircle className="h-3.5 w-3.5" />}
          alert={(summary?.oldest_days ?? 0) > 21 ? "red" : (summary?.oldest_days ?? 0) > 7 ? "amber" : undefined}
        />
      </div>

      {/* Age buckets */}
      {!listLoading && items.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <AgeBucket
            label="Recent (0–7 days)"
            count={recent.length}
            value={recentVal}
            cls="border-emerald-500/20 bg-emerald-500/[0.03] text-emerald-400"
          />
          <AgeBucket
            label="Watch (8–21 days)"
            count={warning.length}
            value={warningVal}
            cls="border-amber-400/20 bg-amber-400/[0.03] text-amber-400"
          />
          <AgeBucket
            label="Overdue (22+ days)"
            count={overdue.length}
            value={overdueVal}
            cls="border-red-500/20 bg-red-500/[0.03] text-red-400"
          />
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-border bg-card">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div>
            <p className="text-[13px] font-semibold text-foreground">COD Orders Awaiting Payment</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Sorted by oldest first. Reclassify orders in Order Classification if any are incorrect.
            </p>
          </div>
        </div>

        {listLoading ? (
          <div className="h-52 m-4 rounded-lg skeleton" />
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CheckCircle className="h-8 w-8 text-emerald-400 mb-3" />
            <p className="text-[15px] font-semibold text-foreground mb-1">No outstanding receivables</p>
            <p className="text-[12px] text-muted-foreground">All COD orders have been collected or classified.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Order</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Customer</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Date</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Amount</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Age</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <ReceivablesRow key={item.order_id} item={item} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Exclusion note */}
      {promoCount > 0 && (
        <div className="rounded-xl border border-border bg-card/50 p-4">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              <span className="text-foreground font-semibold">{promoCount} promotional orders</span> worth{" "}
              <span className="text-foreground font-semibold">{formatINR(promoValue)}</span> are excluded above —
              they are classified as Influencer Promotion or Brand Seeding and appear in marketing spend instead.
              To review them, go to{" "}
              <a href="/dashboard/order-classification" className="text-violet-400 underline">Order Classification</a>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
