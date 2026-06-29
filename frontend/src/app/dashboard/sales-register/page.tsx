"use client";

import { useState, useMemo } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { useSalesRegister } from "@/lib/hooks/use-registers";
import {
  useClassificationSummary,
  useOrdersByClassification,
  useClassifyOrder,
  useAutoClassify,
} from "@/lib/hooks/use-orders";
import { formatINR, formatCount } from "@/lib/utils/format";
import { exportToCsv, exportToExcel } from "@/lib/utils/export";
import { getPeriodDates } from "@/lib/utils/date-ranges";
import {
  Loader2, Download, FileSpreadsheet, RefreshCw,
  CheckCircle2, XCircle, Tags, Wand2, CheckCircle, AlertCircle,
} from "lucide-react";
import { OrderDetailDrawer } from "@/features/sales/order-detail-drawer";
import { cn } from "@/lib/utils";
import type { SalesRegisterRow } from "@/types/registers";
import type { OrderClass, OrderClassificationRow } from "@/types/kpi";

// ─── Register constants ────────────────────────────────────────────────────

const PERIODS = [
  { label: "Last 30 Days", value: "30d" },
  { label: "Last 90 Days", value: "90d" },
  { label: "Last 6 Months", value: "6m" },
  { label: "Last 1 Year", value: "1y" },
  { label: "All Time", value: "all" },
] as const;
type PeriodValue = (typeof PERIODS)[number]["value"];

const ORDER_STATUSES = ["completed", "processing", "cancelled", "refunded", "on-hold", "pending"];
const PAYMENT_METHODS = [
  { value: "prepaid",        label: "Prepaid (all)" },
  { value: "cod",            label: "COD" },
  { value: "ccavenue",       label: "CCAvenue" },
  { value: "gokwik_prepaid", label: "GoKwik" },
  { value: "razorpay",       label: "Razorpay" },
];

// ─── Classification constants ──────────────────────────────────────────────

const ALL_CLASSES: OrderClass[] = [
  "paid_sale", "cod_pending", "influencer_promotion",
  "brand_seeding", "replacement", "warranty", "internal_use", "cancelled",
];
const CLASS_LABELS: Record<string, string> = {
  paid_sale:            "Paid Sale",
  cod_pending:          "COD Pending",
  influencer_promotion: "Influencer Promo",
  brand_seeding:        "Brand Seeding",
  replacement:          "Replacement",
  warranty:             "Warranty",
  internal_use:         "Internal Use",
  cancelled:            "Cancelled",
  unclassified:         "Unclassified",
};
const CLASS_BADGE: Record<string, string> = {
  paid_sale:            "bg-emerald-500/10 text-emerald-500",
  cod_pending:          "bg-amber-400/10 text-amber-400",
  influencer_promotion: "bg-violet-500/10 text-violet-400",
  brand_seeding:        "bg-violet-500/10 text-violet-400",
  replacement:          "bg-blue-500/10 text-blue-400",
  warranty:             "bg-blue-500/10 text-blue-400",
  internal_use:         "bg-muted text-muted-foreground",
  cancelled:            "bg-muted text-muted-foreground",
  unclassified:         "bg-red-500/10 text-red-400",
};

// ─── Shared helpers ────────────────────────────────────────────────────────

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
}

function ClassBadge({ cls }: { cls: string }) {
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold",
      CLASS_BADGE[cls] ?? "bg-muted text-muted-foreground"
    )}>
      {CLASS_LABELS[cls] ?? cls.replace(/_/g, " ")}
    </span>
  );
}

function shipmentBadge(status: string | null) {
  if (!status) return <span className="text-muted-foreground text-[11px]">—</span>;
  const color =
    status === "DELIVERED" ? "text-emerald-400" :
    status === "RTO DELIVERED" || status === "LOST" ? "text-red-400" :
    "text-amber-400";
  return <span className={`text-[11px] ${color}`}>{status}</span>;
}

// ─── Register tab ──────────────────────────────────────────────────────────

function RegisterTab() {
  const [period, setPeriod] = useState<PeriodValue>("30d");
  const [orderStatus, setOrderStatus] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [city, setCity] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  const dateRange = getPeriodDates(period);
  const { data, isLoading, isFetching, refetch } = useSalesRegister({
    start: dateRange.start, end: dateRange.end,
    orderStatus: orderStatus || undefined,
    paymentMethod: paymentMethod || undefined,
    city: city || undefined,
  });
  const rows = data ?? [];

  const NON_COMMERCIAL = new Set(["influencer_promotion", "brand_seeding", "internal_use", "replacement"]);

  const totals = useMemo(() => ({
    orders:      rows.length,
    revenue:     rows.reduce((s, r) => s + (r.order_total_inr ?? 0), 0),
    commercialRevenue: rows
      .filter(r => !NON_COMMERCIAL.has(r.classification ?? ""))
      .reduce((s, r) => s + (r.order_total_inr ?? 0), 0),
    discount:    rows.reduce((s, r) => s + (r.discount_inr ?? 0), 0),
    qty:         rows.reduce((s, r) => s + (r.total_qty ?? 0), 0),
    recognized:  rows.filter(r => r.revenue_recognized).length,
  }), [rows]);

  const selectCls = "h-8 px-2 rounded-md border border-border bg-card text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500";

  const toExportRows = (rows: SalesRegisterRow[]) => rows.map(r => ({
    "Order Date":       fmtDate(r.ordered_at),
    "Order #":          r.order_number,
    "WC Order ID":      r.wc_order_id,
    "Customer":         r.customer_name ?? "",
    "Email":            r.customer_email ?? "",
    "City":             r.city ?? "",
    "State":            r.state ?? "",
    "Products":         r.products ?? "",
    "Qty":              r.total_qty ?? 0,
    "Subtotal (₹)":     r.subtotal_inr,
    "Discount (₹)":     r.discount_inr,
    "Shipping (₹)":     r.shipping_inr,
    "Net Amount (₹)":   r.order_total_inr,
    "Payment Method":   r.payment_method ?? "",
    "Order Status":     r.order_status,
    "Classification":   r.classification,
    "Shipment Status":  r.shipment_status ?? "",
    "Delivered Date":   r.delivered_at ?? "",
    "Revenue Recognized": r.revenue_recognized ? "Yes" : "No",
  }));

  return (
    <div className="space-y-5">
      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        <button onClick={() => refetch()} disabled={isFetching}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground hover:border-primary/40 transition-colors disabled:opacity-60">
          {isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        </button>
        <button onClick={() => exportToCsv(`sales-register-${dateRange.start}-${dateRange.end}`, toExportRows(rows))} disabled={!rows.length}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground hover:border-violet-500/40 transition-colors disabled:opacity-40">
          <Download className="h-3 w-3" /> CSV
        </button>
        <button onClick={() => exportToExcel(`sales-register-${dateRange.start}-${dateRange.end}`, toExportRows(rows), "Sales Register")} disabled={!rows.length}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground hover:border-violet-500/40 transition-colors disabled:opacity-40">
          <FileSpreadsheet className="h-3 w-3" /> Excel
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
        <select value={period} onChange={e => setPeriod(e.target.value as PeriodValue)} className={selectCls}>
          {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <select value={orderStatus} onChange={e => setOrderStatus(e.target.value)} className={selectCls}>
          <option value="">All Statuses</option>
          {ORDER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className={selectCls}>
          <option value="">All Payment Methods</option>
          {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <input value={city} onChange={e => setCity(e.target.value)} placeholder="Filter by city…"
          className="h-8 px-3 rounded-md border border-border bg-card text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet-500 w-36" />
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: "Orders",              value: formatCount(totals.orders) },
          { label: "Commercial Revenue",  value: formatINR(totals.commercialRevenue), sub: "paid sales only" },
          { label: "Gross Order Value",   value: formatINR(totals.revenue),            sub: "all classifications" },
          { label: "Total Discount",      value: formatINR(totals.discount) },
          { label: "Revenue Recognized",  value: `${totals.recognized} / ${totals.orders}` },
        ].map(({ label, value, sub }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
            <p className="text-lg font-bold tabular-nums text-foreground">{value}</p>
            {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="text-[13px] font-semibold text-foreground">
            {isLoading ? "Loading…" : `${formatCount(rows.length)} orders`}
            <span className="ml-2 text-[11px] text-muted-foreground font-normal">{dateRange.label}</span>
          </p>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">No orders found for the selected filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="border-b border-border bg-muted/30">
                <tr>
                  {["Date","Order #","Customer","City","Products","Qty","Subtotal","Discount","Net Amount","Payment","Status","Classification","Shipment","Delivered","Recognized"].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.order_id} className="border-b border-border/40 hover:bg-violet-500/[0.04] last:border-0 cursor-pointer"
                    onClick={() => setSelectedOrderId(row.order_id)}>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{fmtDate(row.ordered_at)}</td>
                    <td className="px-3 py-2 font-mono whitespace-nowrap">#{row.order_number}</td>
                    <td className="px-3 py-2 max-w-[120px]">
                      <p className="truncate">{row.customer_name || <span className="text-muted-foreground">—</span>}</p>
                      {row.customer_email && <p className="text-[10px] text-muted-foreground truncate">{row.customer_email}</p>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.city || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2 max-w-[160px]"><p className="truncate text-muted-foreground">{row.products || "—"}</p></td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.total_qty ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatINR(row.subtotal_inr)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-400">{row.discount_inr > 0 ? `−${formatINR(row.discount_inr)}` : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{formatINR(row.order_total_inr)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.payment_method || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap capitalize">{row.order_status}</td>
                    <td className="px-3 py-2"><ClassBadge cls={row.classification} /></td>
                    <td className="px-3 py-2">{shipmentBadge(row.shipment_status)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{fmtDate(row.delivered_at)}</td>
                    <td className="px-3 py-2">
                      {row.revenue_recognized
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        : <XCircle className="h-3.5 w-3.5 text-muted-foreground/40" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <OrderDetailDrawer orderId={selectedOrderId} onClose={() => setSelectedOrderId(null)} />
    </div>
  );
}

// ─── Classify tab ──────────────────────────────────────────────────────────

type PendingMap = Record<number, OrderClass>;
type SavingMap  = Record<number, boolean>;
type SavedMap   = Record<number, boolean>;

function ClassifyRow({
  row, pendingClass, onChange, isSaving, savedRecently,
}: {
  row: OrderClassificationRow; pendingClass: OrderClass | null;
  onChange: (cls: OrderClass) => void; isSaving: boolean; savedRecently: boolean;
}) {
  const displayClass = pendingClass ?? row.classification;
  const isDirty = pendingClass !== null && pendingClass !== row.classification;

  return (
    <tr className={cn("border-b border-border/30 transition-colors", isDirty ? "bg-violet-500/[0.04]" : "hover:bg-accent/20")}>
      <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground whitespace-nowrap">#{row.woocommerce_order_id}</td>
      <td className="px-3 py-2 text-[12px] text-foreground max-w-[160px]">
        <span className="truncate block">{row.customer_name}</span>
        {row.billing_city && <span className="text-[10px] text-muted-foreground">{row.billing_city}</span>}
      </td>
      <td className="px-3 py-2 text-[12px] text-muted-foreground whitespace-nowrap">{row.ordered_at}</td>
      <td className="px-3 py-2 text-right text-[12px] font-semibold tabular-nums text-foreground whitespace-nowrap">{formatINR(row.order_total_inr)}</td>
      <td className="px-3 py-2 text-[11px] text-muted-foreground">{row.payment_method}</td>
      <td className="px-3 py-2">
        {row.shipment_status === "DELIVERED" ? <span className="text-[10px] font-medium text-emerald-500">Delivered</span>
        : row.shipment_status === "none" || !row.shipment_status ? <span className="text-[10px] font-medium text-muted-foreground">No shipment</span>
        : row.shipment_status === "CANCELED" ? <span className="text-[10px] font-medium text-red-400">Cancelled</span>
        : <span className="text-[10px] font-medium text-amber-400">{row.shipment_status}</span>}
      </td>
      <td className="px-3 py-2">
        <select value={displayClass} onChange={e => onChange(e.target.value as OrderClass)} disabled={isSaving}
          className={cn(
            "h-7 px-2 rounded-md border text-[11px] focus:outline-none focus:ring-1 focus:ring-violet-500 w-[150px]",
            isDirty ? "border-violet-500/40 bg-violet-500/[0.06] text-foreground" : "border-border bg-background text-foreground"
          )}>
          {ALL_CLASSES.map(c => <option key={c} value={c}>{CLASS_LABELS[c]}</option>)}
        </select>
      </td>
      <td className="px-3 py-2 w-[70px]">
        {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" />
        : savedRecently ? <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
        : row.is_manual ? <span className="text-[10px] text-violet-400">manual</span>
        : null}
      </td>
    </tr>
  );
}

function ClassifyTab() {
  const [filter, setFilter] = useState<string | null>(null);
  const [undeliveredOnly, setUndeliveredOnly] = useState(false);
  const [pending, setPending] = useState<PendingMap>({});
  const [saving,  setSaving]  = useState<SavingMap>({});
  const [saved,   setSaved]   = useState<SavedMap>({});

  const { data: summary = [], isLoading: sumLoading } = useClassificationSummary();
  const { data: orders  = [], isLoading: ordersLoading, refetch } = useOrdersByClassification(filter, 200, undeliveredOnly);
  const classifyMutation = useClassifyOrder();
  const autoMutation     = useAutoClassify();

  const summaryMap = Object.fromEntries(summary.map(s => [s.classification, s]));
  const pendingCount = Object.keys(pending).length;

  const handleChange = (orderId: number, cls: OrderClass) =>
    setPending(prev => ({ ...prev, [orderId]: cls }));

  const saveAll = async () => {
    for (const [idStr, cls] of Object.entries(pending)) {
      const orderId = Number(idStr);
      setSaving(prev => ({ ...prev, [orderId]: true }));
      try {
        await classifyMutation.mutateAsync({ orderId, classification: cls });
        setSaved(prev  => ({ ...prev, [orderId]: true }));
        setPending(prev => { const n = { ...prev }; delete n[orderId]; return n; });
        setTimeout(() => setSaved(prev => { const n = { ...prev }; delete n[orderId]; return n; }), 2000);
      } finally {
        setSaving(prev => { const n = { ...prev }; delete n[orderId]; return n; });
      }
    }
    refetch();
  };

  const handleAutoClassify = async () => { await autoMutation.mutateAsync(); refetch(); };

  const unclassifiedCount = summaryMap["unclassified"]?.order_count ?? 0;
  const promoValue = (summaryMap["influencer_promotion"]?.total_value_inr ?? 0) + (summaryMap["brand_seeding"]?.total_value_inr ?? 0);
  const promoCount = (summaryMap["influencer_promotion"]?.order_count ?? 0) + (summaryMap["brand_seeding"]?.order_count ?? 0);

  const FILTER_TABS = [
    { label: "All",                                       value: null,                   undelivered: false },
    { label: "Not Delivered",                             value: null,                   undelivered: true  },
    ...(unclassifiedCount > 0 ? [{ label: `Unclassified (${unclassifiedCount})`, value: "unclassified", undelivered: false }] : []),
    { label: "COD pending",      value: "cod_pending",           undelivered: false },
    { label: "Influencer promo", value: "influencer_promotion",  undelivered: false },
    { label: "Brand seeding",    value: "brand_seeding",         undelivered: false },
    { label: "Paid sale",        value: "paid_sale",             undelivered: false },
    { label: "Cancelled",        value: "cancelled",             undelivered: false },
  ];

  return (
    <div className="space-y-5">
      {/* Actions */}
      <div className="flex items-center gap-2 justify-end">
        {pendingCount > 0 && (
          <button onClick={saveAll} disabled={classifyMutation.isPending}
            className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-violet-600 hover:bg-violet-500 text-white text-[12px] font-semibold transition-colors disabled:opacity-50">
            {classifyMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
            Save {pendingCount} change{pendingCount !== 1 ? "s" : ""}
          </button>
        )}
        <button onClick={handleAutoClassify} disabled={autoMutation.isPending}
          className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
          {autoMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
          Auto-classify
        </button>
        <button onClick={() => refetch()}
          className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

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

      {/* Promo banner */}
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
        {FILTER_TABS.map(tab => {
          const isActive = tab.undelivered ? undeliveredOnly : !undeliveredOnly && filter === tab.value;
          return (
            <button key={tab.label}
              onClick={() => { setFilter(tab.value); setUndeliveredOnly(tab.undelivered); setPending({}); }}
              className={cn(
                "px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors",
                isActive
                  ? tab.undelivered ? "bg-amber-500 text-white" : "bg-violet-600 text-white"
                  : "border border-border text-muted-foreground hover:text-foreground hover:bg-accent"
              )}>
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
              Change the dropdown to reclassify. Highlighted rows are unsaved. Hit "Save changes" to commit.
            </p>
          </div>
          {pendingCount > 0 && <span className="text-[11px] text-violet-400 font-medium">{pendingCount} unsaved</span>}
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
                  {["Order","Customer","Date","Amount","Payment","Delivery","Classification",""].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map(row => (
                  <ClassifyRow
                    key={row.id} row={row}
                    pendingClass={pending[row.id] ?? null}
                    onChange={cls => handleChange(row.id, cls)}
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
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            <span className="text-amber-400">COD Pending</span> = real receivables awaiting collection. ·{" "}
            <span className="text-violet-400">Influencer Promo / Brand Seeding</span> = no revenue expected; counted
            as marketing spend. · <span className="text-emerald-400">Paid Sale</span> = confirmed revenue.
            Manual classifications are never overwritten by Auto-classify.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

type Tab = "register" | "classify";

export default function OrdersPage() {
  const [tab, setTab] = useState<Tab>("register");

  const tabCls = (t: Tab) =>
    `px-4 py-2 text-[13px] font-semibold border-b-2 transition-colors ${
      tab === t
        ? "border-violet-500 text-violet-400"
        : "border-transparent text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="min-h-full p-4 sm:p-6 space-y-5">
      <PageHeader
        title="Orders"
        subtitle="Sales register and order classification in one place"
      />

      {/* Tab strip */}
      <div className="flex border-b border-border gap-0">
        <button className={tabCls("register")} onClick={() => setTab("register")}>Register</button>
        <button className={tabCls("classify")} onClick={() => setTab("classify")}>Classify</button>
      </div>

      {tab === "register" ? <RegisterTab /> : <ClassifyTab />}
    </div>
  );
}
