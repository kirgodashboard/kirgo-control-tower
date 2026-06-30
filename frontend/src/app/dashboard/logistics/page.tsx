"use client";

import { useState, useMemo } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { useLogisticsRegister } from "@/lib/hooks/use-registers";
import { formatINR, formatCount } from "@/lib/utils/format";
import { exportToCsv, exportToExcel } from "@/lib/utils/export";
import { getPeriodDates } from "@/lib/utils/date-ranges";
import {
  Loader2, Download, FileSpreadsheet, RefreshCw,
  CheckCircle2, XCircle, AlertTriangle, Clock,
} from "lucide-react";
import { OrderDetailDrawer } from "@/features/sales/order-detail-drawer";
import type { LogisticsRegisterRow } from "@/types/registers";

const PERIODS = [
  { label: "Last 30 Days", value: "30d" },
  { label: "Last 90 Days", value: "90d" },
  { label: "Last 6 Months", value: "6m" },
  { label: "Last 1 Year", value: "1y" },
  { label: "All Time", value: "all" },
] as const;

type PeriodValue = (typeof PERIODS)[number]["value"];

const SHIPMENT_STATUSES = [
  "DELIVERED",
  "RTO DELIVERED",
  "RTO INITIATED",
  "OUT FOR DELIVERY",
  "IN TRANSIT",
  "PICKUP PENDING",
  "UNDELIVERED",
  "LOST",
];

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
}

function statusBadge(status: string | null) {
  if (!status) return <span className="text-muted-foreground text-[11px]">—</span>;
  const s = status.toUpperCase();
  const cls =
    s === "DELIVERED"
      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
      : s.startsWith("RTO") || s === "LOST" || s === "RETURNED"
      ? "bg-red-500/10 text-red-400 border-red-500/20"
      : s === "OUT FOR DELIVERY" || s === "UNDELIVERED"
      ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
      : s.includes("NDR") || s.includes("EXCEPTION")
      ? "bg-orange-500/10 text-orange-400 border-orange-500/20"
      : "bg-muted text-muted-foreground border-border";
  return (
    <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap ${cls}`}>
      {status}
    </span>
  );
}

function daysBadge(days: number | null, status: string | null) {
  if (days === null) {
    if (!status) return <span className="text-muted-foreground">—</span>;
    const s = (status ?? "").toUpperCase();
    if (s === "DELIVERED" || s.startsWith("RTO")) return <span className="text-muted-foreground">—</span>;
    return <Clock className="h-3.5 w-3.5 text-muted-foreground/50" />;
  }
  const cls = days <= 3 ? "text-emerald-400" : days <= 7 ? "text-amber-400" : "text-red-400";
  return <span className={`tabular-nums font-medium ${cls}`}>{days}d</span>;
}

function rtoRiskBadge(risk: string | null) {
  if (!risk || risk === "low") return null;
  const cls = risk === "high" ? "text-red-400" : "text-amber-400";
  return <span className={`text-[10px] font-semibold uppercase ${cls}`}>{risk}</span>;
}

export default function LogisticsRegisterPage() {
  const [period, setPeriod] = useState<PeriodValue>("30d");
  const [status, setStatus] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [courier, setCourier] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  const dateRange = getPeriodDates(period);

  const { data, isLoading, isFetching, refetch } = useLogisticsRegister({
    start: dateRange.start,
    end: dateRange.end,
    status: status || undefined,
    paymentMethod: paymentMethod || undefined,
    courier: courier || undefined,
  });

  const rows = data ?? [];

  const totals = useMemo(() => {
    const delivered = rows.filter((r) => r.status?.toUpperCase() === "DELIVERED");
    const rto = rows.filter((r) => r.status?.toUpperCase().startsWith("RTO"));
    const inTransit = rows.filter(
      (r) => !["DELIVERED", "RTO DELIVERED", "RTO INITIATED", "LOST"].includes(r.status?.toUpperCase() ?? ""),
    );
    const codRows = rows.filter((r) => (r.payment_method ?? "").toUpperCase() === "COD");
    const codOutstanding = codRows.filter((r) => !r.is_cod_remitted);
    const avgDays =
      delivered.length > 0
        ? Math.round(
            delivered.reduce((s, r) => s + (r.days_to_deliver ?? 0), 0) / delivered.length,
          )
        : null;
    return {
      total: rows.length,
      delivered: delivered.length,
      rto: rto.length,
      inTransit: inTransit.length,
      avgDays,
      codOutstandingAmount: codOutstanding.reduce((s, r) => s + (r.cod_payable_inr ?? 0), 0),
      codOutstandingCount: codOutstanding.length,
      totalFreight: rows.reduce((s, r) => s + (r.freight_inr ?? 0), 0),
    };
  }, [rows]);

  const selectCls =
    "h-8 px-2 rounded-md border border-border bg-card text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500";

  const toExportRows = (rows: LogisticsRegisterRow[]) =>
    rows.map((r) => ({
      "Date":              fmtDate(r.shiprocket_created_at),
      "AWB":               r.awb_code ?? "",
      "Order #":           r.order_number,
      "WC Order ID":       r.wc_order_id,
      "Customer":          r.customer_name ?? "",
      "City":              r.customer_city ?? "",
      "State":             r.customer_state ?? "",
      "Pincode":           r.customer_pincode ?? "",
      "SKU":               r.sku ?? "",
      "Qty":               r.product_qty ?? "",
      "Status":            r.status ?? "",
      "Courier":           r.courier_company ?? "",
      "Zone":              r.zone ?? "",
      "Days to Deliver":   r.days_to_deliver ?? "",
      "Payment Method":    r.payment_method ?? "",
      "Order Total (₹)":   r.order_total_inr,
      "Freight (₹)":       r.freight_inr ?? "",
      "COD Charges (₹)":   r.cod_charges_inr ?? "",
      "COD Payable (₹)":   r.cod_payable_inr ?? "",
      "COD Remitted":      r.is_cod_remitted ? "Yes" : "No",
      "Remittance Date":   r.cod_remittance_date ?? "",
      "UTR Number":        r.utr_number ?? "",
      "NDR Attempts":      r.ndr_attempts ?? "",
      "NDR Reason":        r.latest_ndr_reason ?? "",
      "RTO Risk":          r.rto_risk ?? "",
      "EDD":               r.edd ?? "",
      "Delivered At":      fmtDate(r.delivered_at),
      "RTO Initiated At":  fmtDate(r.rto_initiated_at),
    }));

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader
          title="Logistics Register"
          subtitle="Shipment-level view — AWB, courier status, COD reconciliation, delivery timeline"
          backHref="/review"
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
            onClick={() => exportToCsv(`logistics-${dateRange.start}-${dateRange.end}`, toExportRows(rows))}
            disabled={!rows.length}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground hover:border-violet-500/40 transition-colors disabled:opacity-40"
          >
            <Download className="h-3 w-3" /> CSV
          </button>
          <button
            onClick={() => exportToExcel(`logistics-${dateRange.start}-${dateRange.end}`, toExportRows(rows), "Logistics Register")}
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
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
          <option value="">All Statuses</option>
          {SHIPMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={selectCls}>
          <option value="">All Payments</option>
          <option value="COD">COD</option>
          <option value="Prepaid">Prepaid</option>
        </select>
        <input
          value={courier}
          onChange={(e) => setCourier(e.target.value)}
          placeholder="Filter by courier…"
          className="h-8 px-3 rounded-md border border-border bg-card text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet-500 w-36"
        />
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          {
            label: "Total Shipments",
            value: formatCount(totals.total),
            dot: totals.total > 0 ? "bg-emerald-500" : "bg-muted-foreground/30",
          },
          {
            label: "Delivered",
            value: totals.total > 0 ? `${formatCount(totals.delivered)} (${Math.round((totals.delivered / totals.total) * 100)}%)` : "0",
            dot: "bg-emerald-500",
          },
          {
            label: "RTO",
            value: totals.total > 0 ? `${formatCount(totals.rto)} (${Math.round((totals.rto / totals.total) * 100)}%)` : "0",
            dot: totals.rto > 0 ? "bg-red-500" : "bg-muted-foreground/30",
          },
          {
            label: "In Transit",
            value: formatCount(totals.inTransit),
            dot: totals.inTransit > 0 ? "bg-amber-500" : "bg-muted-foreground/30",
          },
          {
            label: "Avg Delivery",
            value: totals.avgDays !== null ? `${totals.avgDays} days` : "—",
            dot: totals.avgDays !== null && totals.avgDays <= 4 ? "bg-emerald-500" : totals.avgDays !== null && totals.avgDays <= 7 ? "bg-amber-500" : "bg-red-500",
          },
          {
            label: "COD Outstanding",
            value: formatINR(totals.codOutstandingAmount),
            sub: `${formatCount(totals.codOutstandingCount)} shipments`,
            dot: totals.codOutstandingCount > 0 ? "bg-amber-500" : "bg-muted-foreground/30",
          },
        ].map(({ label, value, sub, dot }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
              <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
            </div>
            <p className="text-base font-bold tabular-nums text-foreground leading-tight">{value}</p>
            {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="text-[13px] font-semibold text-foreground">
            {isLoading ? "Loading…" : `${formatCount(rows.length)} shipments`}
            <span className="ml-2 text-[11px] text-muted-foreground font-normal">{dateRange.label}</span>
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">No shipments found for the selected filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="border-b border-border bg-muted/30">
                <tr>
                  {[
                    "Date", "AWB", "Order #", "Customer", "City",
                    "Status", "Courier", "Zone", "Days",
                    "Amount", "Freight", "COD Payable", "Remitted",
                    "NDR", "RTO Risk",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.shipment_id}
                    className="border-b border-border/40 hover:bg-violet-500/[0.04] last:border-0 cursor-pointer"
                    onClick={() => row.order_id && setSelectedOrderId(row.order_id)}
                  >
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      {fmtDate(row.shiprocket_created_at)}
                    </td>
                    <td className="px-3 py-2 font-mono whitespace-nowrap text-[11px]">
                      {row.awb_code ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2 font-mono whitespace-nowrap">
                      #{row.order_number}
                    </td>
                    <td className="px-3 py-2 max-w-[110px]">
                      <p className="truncate">{row.customer_name || <span className="text-muted-foreground">—</span>}</p>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {row.customer_city || <span className="text-muted-foreground">—</span>}
                      {row.customer_state && (
                        <span className="text-muted-foreground ml-1 text-[10px]">{row.customer_state}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{statusBadge(row.status)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground text-[11px]">
                      {row.courier_company ?? "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground text-[11px]">
                      {row.zone ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {daysBadge(row.days_to_deliver, row.status)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {formatINR(row.order_total_inr)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {row.freight_inr != null ? formatINR(row.freight_inr) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.cod_payable_inr != null ? (
                        <span className="text-amber-400">{formatINR(row.cod_payable_inr)}</span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {row.cod_payable_inr != null ? (
                        row.is_cod_remitted
                          ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 inline" />
                          : <XCircle className="h-3.5 w-3.5 text-red-400/60 inline" />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center text-muted-foreground">
                      {(row.ndr_attempts ?? 0) > 0 ? (
                        <span className="inline-flex items-center gap-1 text-orange-400">
                          <AlertTriangle className="h-3 w-3" />
                          {row.ndr_attempts}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {rtoRiskBadge(row.rto_risk)}
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
