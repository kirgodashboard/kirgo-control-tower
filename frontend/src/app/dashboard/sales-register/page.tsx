"use client";

import { useState, useMemo } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { useSalesRegister } from "@/lib/hooks/use-registers";
import { formatINR, formatCount } from "@/lib/utils/format";
import { exportToCsv, exportToExcel } from "@/lib/utils/export";
import { getPeriodDates } from "@/lib/utils/date-ranges";
import { Loader2, Download, FileSpreadsheet, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { OrderDetailDrawer } from "@/features/sales/order-detail-drawer";
import type { SalesRegisterRow } from "@/types/registers";

const PERIODS = [
  { label: "Last 30 Days", value: "30d" },
  { label: "Last 90 Days", value: "90d" },
  { label: "Last 6 Months", value: "6m" },
  { label: "Last 1 Year", value: "1y" },
  { label: "All Time", value: "all" },
] as const;

type PeriodValue = (typeof PERIODS)[number]["value"];

const ORDER_STATUSES = ["completed", "processing", "cancelled", "refunded", "on-hold", "pending"];
// value = filter sent to RPC, label = shown. "prepaid" matches all non-COD
// gateways; the specific gateways match exactly. (Mirrors actual data:
// ccavenue / cod / gokwik_prepaid / razorpay)
const PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: "prepaid",        label: "Prepaid (all)" },
  { value: "cod",            label: "COD" },
  { value: "ccavenue",       label: "CCAvenue" },
  { value: "gokwik_prepaid", label: "GoKwik" },
  { value: "razorpay",       label: "Razorpay" },
];

function classificationBadge(cls: string) {
  const map: Record<string, string> = {
    paid_sale:          "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    influencer_promotion: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    brand_seeding:      "bg-blue-500/10 text-blue-400 border-blue-500/20",
    internal_use:       "bg-muted text-muted-foreground border-border",
    replacement:        "bg-amber-500/10 text-amber-400 border-amber-500/20",
    unclassified:       "bg-orange-500/10 text-orange-400 border-orange-500/20",
  };
  const cls2 = map[cls] ?? "bg-muted text-muted-foreground border-border";
  return (
    <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold ${cls2}`}>
      {cls.replace(/_/g, " ")}
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

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
}

export default function SalesRegisterPage() {
  const [period, setPeriod] = useState<PeriodValue>("30d");
  const [orderStatus, setOrderStatus] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [city, setCity] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  const dateRange = getPeriodDates(period);

  const { data, isLoading, isFetching, refetch } = useSalesRegister({
    start: dateRange.start,
    end: dateRange.end,
    orderStatus: orderStatus || undefined,
    paymentMethod: paymentMethod || undefined,
    city: city || undefined,
  });

  const rows = data ?? [];

  const totals = useMemo(() => ({
    orders: rows.length,
    revenue: rows.reduce((s, r) => s + (r.order_total_inr ?? 0), 0),
    discount: rows.reduce((s, r) => s + (r.discount_inr ?? 0), 0),
    qty: rows.reduce((s, r) => s + (r.total_qty ?? 0), 0),
    recognized: rows.filter((r) => r.revenue_recognized).length,
  }), [rows]);

  const selectCls = "h-8 px-2 rounded-md border border-border bg-card text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500";

  const toExportRows = (rows: SalesRegisterRow[]) =>
    rows.map((r) => ({
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
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Sales Register"
          subtitle="All orders with line-level detail — unfiltered audit view including non-commercial"
        />
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground hover:border-primary/40 transition-colors disabled:opacity-60"
          >
            {isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          </button>
          <button
            onClick={() => exportToCsv(`sales-register-${dateRange.start}-${dateRange.end}`, toExportRows(rows))}
            disabled={!rows.length}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground hover:border-violet-500/40 transition-colors disabled:opacity-40"
          >
            <Download className="h-3 w-3" /> CSV
          </button>
          <button
            onClick={() => exportToExcel(`sales-register-${dateRange.start}-${dateRange.end}`, toExportRows(rows), "Sales Register")}
            disabled={!rows.length}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground hover:border-violet-500/40 transition-colors disabled:opacity-40"
          >
            <FileSpreadsheet className="h-3 w-3" /> Excel
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
        <select value={period} onChange={(e) => setPeriod(e.target.value as PeriodValue)} className={selectCls}>
          {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <select value={orderStatus} onChange={(e) => setOrderStatus(e.target.value)} className={selectCls}>
          <option value="">All Statuses</option>
          {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={selectCls}>
          <option value="">All Payment Methods</option>
          {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Filter by city…"
          className="h-8 px-3 rounded-md border border-border bg-card text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet-500 w-36"
        />
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: "Orders", value: formatCount(totals.orders) },
          { label: "Gross Revenue", value: formatINR(totals.revenue) },
          { label: "Total Discount", value: formatINR(totals.discount) },
          { label: "Units Sold", value: formatCount(totals.qty) },
          { label: "Revenue Recognized", value: `${totals.recognized} / ${totals.orders}` },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
            <p className="text-lg font-bold tabular-nums text-foreground">{value}</p>
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
                  {["Date","Order #","Customer","City","Products","Qty","Subtotal","Discount","Net Amount","Payment","Status","Classification","Shipment","Delivered","Recognized"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.order_id}
                    className="border-b border-border/40 hover:bg-violet-500/[0.04] last:border-0 cursor-pointer"
                    onClick={() => setSelectedOrderId(row.order_id)}
                  >
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{fmtDate(row.ordered_at)}</td>
                    <td className="px-3 py-2 font-mono whitespace-nowrap">#{row.order_number}</td>
                    <td className="px-3 py-2 max-w-[120px]">
                      <p className="truncate">{row.customer_name || <span className="text-muted-foreground">—</span>}</p>
                      {row.customer_email && <p className="text-[10px] text-muted-foreground truncate">{row.customer_email}</p>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.city || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2 max-w-[160px]">
                      <p className="truncate text-muted-foreground">{row.products || "—"}</p>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.total_qty ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatINR(row.subtotal_inr)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-400">{row.discount_inr > 0 ? `−${formatINR(row.discount_inr)}` : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{formatINR(row.order_total_inr)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.payment_method || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap capitalize">{row.order_status}</td>
                    <td className="px-3 py-2">{classificationBadge(row.classification)}</td>
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

      <OrderDetailDrawer
        orderId={selectedOrderId}
        onClose={() => setSelectedOrderId(null)}
      />
    </div>
  );
}
