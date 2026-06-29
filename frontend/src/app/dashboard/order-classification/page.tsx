"use client";

import { useState } from "react";
import { Tags, Wand2, RefreshCw, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import {
  useClassificationSummary,
  useOrdersByClassification,
  useClassifyOrder,
  useAutoClassify,
} from "@/lib/hooks/use-orders";
import { formatINR } from "@/lib/utils/format";
import type { OrderClass, OrderClassificationRow } from "@/types/kpi";
import { cn } from "@/lib/utils";

const ALL_CLASSES: OrderClass[] = [
  "paid_sale",
  "cod_pending",
  "influencer_promotion",
  "brand_seeding",
  "replacement",
  "warranty",
  "internal_use",
  "cancelled",
];

const CLASS_LABELS: Record<string, string> = {
  paid_sale:             "Paid Sale",
  cod_pending:           "COD Pending",
  influencer_promotion:  "Influencer Promo",
  brand_seeding:         "Brand Seeding",
  replacement:           "Replacement",
  warranty:              "Warranty",
  internal_use:          "Internal Use",
  cancelled:             "Cancelled",
  unclassified:          "Unclassified",
};

const CLASS_COLORS: Record<string, string> = {
  paid_sale:             "text-emerald-500",
  cod_pending:           "text-amber-400",
  influencer_promotion:  "text-violet-400",
  brand_seeding:         "text-violet-400",
  replacement:           "text-blue-400",
  warranty:              "text-blue-400",
  internal_use:          "text-muted-foreground",
  cancelled:             "text-muted-foreground",
  unclassified:          "text-red-400",
};

const CLASS_BADGE: Record<string, string> = {
  paid_sale:             "bg-emerald-500/10 text-emerald-500",
  cod_pending:           "bg-amber-400/10 text-amber-400",
  influencer_promotion:  "bg-violet-500/10 text-violet-400",
  brand_seeding:         "bg-violet-500/10 text-violet-400",
  replacement:           "bg-blue-500/10 text-blue-400",
  warranty:              "bg-blue-500/10 text-blue-400",
  internal_use:          "bg-muted text-muted-foreground",
  cancelled:             "bg-muted text-muted-foreground",
  unclassified:          "bg-red-500/10 text-red-400",
};

function ClassBadge({ cls }: { cls: string }) {
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold",
      CLASS_BADGE[cls] ?? "bg-muted text-muted-foreground"
    )}>
      {CLASS_LABELS[cls] ?? cls}
    </span>
  );
}

function OrderRow({
  row,
  pendingClass,
  onChange,
  isSaving,
  savedRecently,
}: {
  row: OrderClassificationRow;
  pendingClass: OrderClass | null;
  onChange: (cls: OrderClass) => void;
  isSaving: boolean;
  savedRecently: boolean;
}) {
  const displayClass = pendingClass ?? row.classification;
  const isDirty = pendingClass !== null && pendingClass !== row.classification;

  return (
    <tr className={cn(
      "border-b border-border/30 transition-colors",
      isDirty ? "bg-violet-500/[0.04]" : "hover:bg-accent/20"
    )}>
      <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
        #{row.woocommerce_order_id}
      </td>
      <td className="px-3 py-2 text-[12px] text-foreground max-w-[160px]">
        <span className="truncate block">{row.customer_name}</span>
        {row.billing_city && (
          <span className="text-[10px] text-muted-foreground">{row.billing_city}</span>
        )}
      </td>
      <td className="px-3 py-2 text-[12px] text-muted-foreground whitespace-nowrap">
        {row.ordered_at}
      </td>
      <td className="px-3 py-2 text-right text-[12px] font-semibold tabular-nums text-foreground whitespace-nowrap">
        {formatINR(row.order_total_inr)}
      </td>
      <td className="px-3 py-2 text-[11px] text-muted-foreground">
        {row.payment_method}
      </td>
      <td className="px-3 py-2">
        {row.shipment_status === "DELIVERED" ? (
          <span className="text-[10px] font-medium text-emerald-500">Delivered</span>
        ) : row.shipment_status === "none" || !row.shipment_status ? (
          <span className="text-[10px] font-medium text-muted-foreground">No shipment</span>
        ) : row.shipment_status === "CANCELED" ? (
          <span className="text-[10px] font-medium text-red-400">Cancelled</span>
        ) : (
          <span className="text-[10px] font-medium text-amber-400">{row.shipment_status}</span>
        )}
      </td>
      <td className="px-3 py-2">
        <select
          value={displayClass}
          onChange={(e) => onChange(e.target.value as OrderClass)}
          disabled={isSaving}
          className={cn(
            "h-7 px-2 rounded-md border text-[11px] focus:outline-none focus:ring-1 focus:ring-violet-500 w-[150px]",
            isDirty
              ? "border-violet-500/40 bg-violet-500/[0.06] text-foreground"
              : "border-border bg-background text-foreground"
          )}
        >
          {ALL_CLASSES.map((c) => (
            <option key={c} value={c}>{CLASS_LABELS[c]}</option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2 w-[70px]">
        {isSaving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" />
        ) : savedRecently ? (
          <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
        ) : row.is_manual ? (
          <span className="text-[10px] text-violet-400">manual</span>
        ) : null}
      </td>
    </tr>
  );
}

type PendingMap = Record<number, OrderClass>;
type SavingMap  = Record<number, boolean>;
type SavedMap   = Record<number, boolean>;

export default function OrderClassificationPage() {
  const [filter, setFilter] = useState<string | null>(null);
  const [undeliveredOnly, setUndeliveredOnly] = useState(false);
  const [pending, setPending] = useState<PendingMap>({});
  const [saving,  setSaving]  = useState<SavingMap>({});
  const [saved,   setSaved]   = useState<SavedMap>({});

  const { data: summary = [], isLoading: sumLoading } = useClassificationSummary();
  const { data: orders  = [], isLoading: ordersLoading, refetch } = useOrdersByClassification(filter, 200, undeliveredOnly);
  const classifyMutation = useClassifyOrder();
  const autoMutation     = useAutoClassify();

  const summaryMap = Object.fromEntries(summary.map((s) => [s.classification, s]));
  const pendingCount = Object.keys(pending).length;

  const handleChange = (orderId: number, cls: OrderClass) => {
    setPending((prev) => ({ ...prev, [orderId]: cls }));
  };

  const saveAll = async () => {
    const entries = Object.entries(pending);
    for (const [idStr, cls] of entries) {
      const orderId = Number(idStr);
      setSaving((prev) => ({ ...prev, [orderId]: true }));
      try {
        await classifyMutation.mutateAsync({ orderId, classification: cls });
        setSaved((prev)  => ({ ...prev, [orderId]: true }));
        setPending((prev) => { const n = { ...prev }; delete n[orderId]; return n; });
        setTimeout(() => setSaved((prev) => { const n = { ...prev }; delete n[orderId]; return n; }), 2000);
      } finally {
        setSaving((prev) => { const n = { ...prev }; delete n[orderId]; return n; });
      }
    }
    refetch();
  };

  const handleAutoClassify = async () => {
    await autoMutation.mutateAsync();
    refetch();
  };

  const unclassifiedCount = summaryMap["unclassified"]?.order_count ?? 0;
  const FILTER_TABS = [
    { label: "All", value: null, undelivered: false },
    { label: "Not Delivered", value: null, undelivered: true },
    ...(unclassifiedCount > 0
      ? [{ label: `Unclassified (${unclassifiedCount})`, value: "unclassified", undelivered: false }]
      : []),
    { label: "COD pending", value: "cod_pending", undelivered: false },
    { label: "Influencer promo", value: "influencer_promotion", undelivered: false },
    { label: "Brand seeding", value: "brand_seeding", undelivered: false },
    { label: "Paid sale", value: "paid_sale", undelivered: false },
    { label: "Cancelled", value: "cancelled", undelivered: false },
  ];

  const promoValue = (summaryMap["influencer_promotion"]?.total_value_inr ?? 0)
    + (summaryMap["brand_seeding"]?.total_value_inr ?? 0);
  const promoCount = (summaryMap["influencer_promotion"]?.order_count ?? 0)
    + (summaryMap["brand_seeding"]?.order_count ?? 0);

  return (
    <div className="min-h-full p-4 sm:p-6 space-y-6">
      <PageHeader
        title="Order Classification"
        subtitle="Classify orders to correctly separate revenue, receivables, and marketing spend"
      >
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <button
              onClick={saveAll}
              disabled={classifyMutation.isPending}
              className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-violet-600 hover:bg-violet-500 text-white text-[12px] font-semibold transition-colors disabled:opacity-50"
            >
              {classifyMutation.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <CheckCircle className="h-3.5 w-3.5" />}
              Save {pendingCount} change{pendingCount !== 1 ? "s" : ""}
            </button>
          )}
          <button
            onClick={handleAutoClassify}
            disabled={autoMutation.isPending}
            className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            {autoMutation.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Wand2 className="h-3.5 w-3.5" />}
            Auto-classify
          </button>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </PageHeader>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Total Orders</p>
          <p className="text-[26px] font-bold tabular-nums text-foreground">
            {sumLoading ? "—" : summary.reduce((a, s) => a + Number(s.order_count), 0).toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.03] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">COD Pending</p>
          <p className="text-[26px] font-bold tabular-nums text-amber-400">
            {sumLoading ? "—" : (summaryMap["cod_pending"]?.order_count ?? 0).toLocaleString()}
          </p>
          <p className="text-[11px] text-muted-foreground">{formatINR(summaryMap["cod_pending"]?.total_value_inr)}</p>
        </div>
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.03] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Promotional</p>
          <p className="text-[26px] font-bold tabular-nums text-violet-400">
            {sumLoading ? "—" : promoCount.toLocaleString()}
          </p>
          <p className="text-[11px] text-muted-foreground">{formatINR(promoValue)} → marketing</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Paid Sales</p>
          <p className="text-[26px] font-bold tabular-nums text-emerald-400">
            {sumLoading ? "—" : (summaryMap["paid_sale"]?.order_count ?? 0).toLocaleString()}
          </p>
          <p className="text-[11px] text-muted-foreground">{formatINR(summaryMap["paid_sale"]?.total_value_inr)}</p>
        </div>
      </div>

      {/* Promo info banner */}
      {!sumLoading && promoCount > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-violet-500/20 bg-violet-500/[0.04] p-3.5">
          <Tags className="h-4 w-4 text-violet-400 mt-0.5 flex-shrink-0" />
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            <span className="text-violet-400 font-semibold">{promoCount} promotional orders</span> worth{" "}
            <span className="text-foreground font-semibold">{formatINR(promoValue)}</span> are excluded from
            revenue and receivables — they count as marketing spend in the profitability report.
          </p>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {FILTER_TABS.map((tab) => {
          const isActive = tab.undelivered
            ? undeliveredOnly
            : !undeliveredOnly && filter === tab.value;
          return (
            <button
              key={tab.label}
              onClick={() => {
                setFilter(tab.value);
                setUndeliveredOnly(tab.undelivered);
                setPending({});
              }}
              className={cn(
                "px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors",
                isActive
                  ? tab.undelivered
                    ? "bg-amber-500 text-white"
                    : "bg-violet-600 text-white"
                  : "border border-border text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              {tab.label}
              {!tab.undelivered && tab.value && summaryMap[tab.value] && (
                <span className="ml-1.5 opacity-70">({summaryMap[tab.value].order_count})</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Orders table */}
      <div className="rounded-xl border border-border bg-card">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div>
            <p className="text-[13px] font-semibold text-foreground">Orders</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Change the dropdown to reclassify. Reclassified rows are highlighted. Hit "Save changes" to commit.
            </p>
          </div>
          {pendingCount > 0 && (
            <span className="text-[11px] text-violet-400 font-medium">{pendingCount} unsaved</span>
          )}
        </div>

        {ordersLoading ? (
          <div className="h-52 m-4 rounded-lg skeleton" />
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CheckCircle className="h-8 w-8 text-emerald-400 mb-3" />
            <p className="text-[14px] font-semibold text-foreground">No orders in this category</p>
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
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Payment</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Delivery</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Classification</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((row) => (
                  <OrderRow
                    key={row.id}
                    row={row}
                    pendingClass={pending[row.id] ?? null}
                    onChange={(cls) => handleChange(row.id, cls)}
                    isSaving={!!saving[row.id]}
                    savedRecently={!!saved[row.id]}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Help note */}
      <div className="rounded-xl border border-border bg-card/50 p-4">
        <div className="flex items-start gap-2.5">
          <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <p className="text-[12px] font-semibold text-foreground">Classification rules</p>
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              <span className="text-amber-400">COD Pending</span> = real receivables awaiting collection. ·{" "}
              <span className="text-violet-400">Influencer Promo / Brand Seeding</span> = no revenue expected; counted
              as marketing spend. · <span className="text-emerald-400">Paid Sale</span> = confirmed revenue.
              Manual classifications are never overwritten by Auto-classify.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
