"use client";

import { useState, useMemo } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { usePurchaseRegister } from "@/lib/hooks/use-registers";
import { formatINR, formatCount } from "@/lib/utils/format";
import { exportToCsv, exportToExcel } from "@/lib/utils/export";
import { getPeriodDates } from "@/lib/utils/date-ranges";
import { Loader2, Download, FileSpreadsheet, RefreshCw } from "lucide-react";
import type { PurchaseRegisterRow } from "@/types/registers";

const PERIODS = [
  { label: "Last 30 Days", value: "30d" },
  { label: "Last 90 Days", value: "90d" },
  { label: "Last 6 Months", value: "6m" },
  { label: "Last 1 Year", value: "1y" },
  { label: "All Time", value: "all" },
] as const;

type PeriodValue = (typeof PERIODS)[number]["value"];

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
}

function statusBadge(status: string | null) {
  if (!status) return <span className="text-muted-foreground text-[11px]">—</span>;
  const color =
    status === "received" || status === "complete" ? "text-emerald-400" :
    status === "cancelled" ? "text-red-400" :
    "text-amber-400";
  return <span className={`text-[11px] capitalize ${color}`}>{status}</span>;
}

export default function PurchasesPage() {
  const [period, setPeriod] = useState<PeriodValue>("all");
  const [supplier, setSupplier] = useState("");
  const [status, setStatus] = useState("");

  const dateRange = getPeriodDates(period);

  const { data, isLoading, isFetching, refetch } = usePurchaseRegister({
    start: dateRange.start,
    end: dateRange.end,
    supplier: supplier || undefined,
    status: status || undefined,
  });

  const rows = data ?? [];

  const totals = useMemo(() => ({
    pos: rows.length,
    totalInr: rows.reduce((s, r) => s + (r.total_inr ?? 0), 0),
    totalQty: rows.reduce((s, r) => s + (r.total_qty ?? 0), 0),
  }), [rows]);

  const selectCls = "h-8 px-2 rounded-md border border-border bg-card text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500";

  const toExportRows = (rows: PurchaseRegisterRow[]) =>
    rows.map((r) => ({
      "PO ID":            r.po_id,
      "Invoice Number":   r.invoice_number ?? "",
      "Invoice Date":     fmtDate(r.invoice_date),
      "Supplier":         r.supplier_name,
      "Currency":         r.currency,
      "FX Rate":          r.fx_rate_inr ?? "",
      "Subtotal (Foreign)": r.subtotal_foreign ?? "",
      "Total (Foreign)":  r.total_foreign ?? "",
      "Total (INR ₹)":    r.total_inr ?? "",
      "Payment Terms":    r.payment_terms ?? "",
      "Payment Method":   r.payment_method ?? "",
      "Status":           r.status ?? "",
      "Line Count":       r.line_count,
      "Total Qty":        r.total_qty,
      "Items Summary":    r.items_summary ?? "",
    }));

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Purchase Register"
          subtitle="All purchase orders from suppliers — cost and quantity tracking"
        />
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => refetch()} disabled={isFetching}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground hover:border-primary/40 transition-colors disabled:opacity-60">
            {isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          </button>
          <button onClick={() => exportToCsv(`purchases-${dateRange.start}-${dateRange.end}`, toExportRows(rows))} disabled={!rows.length}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground hover:border-violet-500/40 transition-colors disabled:opacity-40">
            <Download className="h-3 w-3" /> CSV
          </button>
          <button onClick={() => exportToExcel(`purchases-${dateRange.start}-${dateRange.end}`, toExportRows(rows), "Purchases")} disabled={!rows.length}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground hover:border-violet-500/40 transition-colors disabled:opacity-40">
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
          {["draft", "ordered", "partial", "received", "cancelled"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Filter by supplier…"
          className="h-8 px-3 rounded-md border border-border bg-card text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet-500 w-40" />
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Purchase Orders", value: formatCount(totals.pos) },
          { label: "Total Cost (INR)", value: formatINR(totals.totalInr) },
          { label: "Total Units", value: formatCount(totals.totalQty) },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
            <p className="text-lg font-bold tabular-nums text-foreground">{value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-[13px] font-semibold text-foreground">
            {isLoading ? "Loading…" : `${formatCount(rows.length)} purchase orders`}
          </p>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">No purchase orders found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="border-b border-border bg-muted/30">
                <tr>
                  {["Invoice Date","Invoice #","Supplier","Currency","FX Rate","Total (Foreign)","Total (INR)","Payment Terms","Status","Items","Qty","Items Detail"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.po_id} className="border-b border-border/40 hover:bg-muted/20 last:border-0">
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{fmtDate(row.invoice_date)}</td>
                    <td className="px-3 py-2 font-mono">{row.invoice_number || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2 font-medium">{row.supplier_name}</td>
                    <td className="px-3 py-2">{row.currency}</td>
                    <td className="px-3 py-2 tabular-nums">{row.fx_rate_inr ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.total_foreign != null ? row.total_foreign.toLocaleString() : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{row.total_inr != null ? formatINR(row.total_inr) : "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.payment_terms || "—"}</td>
                    <td className="px-3 py-2">{statusBadge(row.status)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.line_count}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.total_qty}</td>
                    <td className="px-3 py-2 max-w-[200px]">
                      <p className="truncate text-muted-foreground">{row.items_summary || "—"}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
