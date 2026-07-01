"use client";

import { useState, useMemo } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { usePurchaseRegister, addPurchaseOrder } from "@/lib/hooks/use-registers";
import { formatINR, formatCount } from "@/lib/utils/format";
import { exportToCsv, exportToExcel } from "@/lib/utils/export";
import { getPeriodDates } from "@/lib/utils/date-ranges";
import { Loader2, Download, FileSpreadsheet, RefreshCw, Plus, X } from "lucide-react";
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

// ── Add Purchase Modal ────────────────────────────────────────────────────────

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "CNY"];
const PO_STATUSES = ["ordered", "partial", "received", "cancelled"];

function AddPurchaseModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    supplier_name: "",
    invoice_number: "",
    invoice_date: new Date().toISOString().slice(0, 10),
    currency: "INR",
    total_foreign: "",
    fx_rate_inr: "",
    total_inr: "",
    payment_terms: "",
    status: "received",
    notes: "",
  });

  const isForeign = form.currency !== "INR";

  const inputCls = "w-full h-9 px-3 rounded-md border border-border bg-background text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet-500";

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.supplier_name.trim()) { setError("Supplier name is required"); return; }
    if (!form.invoice_date) { setError("Invoice date is required"); return; }

    let totalInr = parseFloat(form.total_inr);
    if (isForeign) {
      const foreign = parseFloat(form.total_foreign);
      const fx = parseFloat(form.fx_rate_inr);
      if (!isNaN(foreign) && !isNaN(fx)) totalInr = Math.round(foreign * fx * 100) / 100;
    }
    if (isNaN(totalInr) || totalInr < 0) { setError("Enter a valid total amount"); return; }

    setSaving(true);
    setError(null);
    try {
      await addPurchaseOrder({
        supplier_name: form.supplier_name.trim(),
        invoice_number: form.invoice_number.trim() || undefined,
        invoice_date: form.invoice_date,
        currency: form.currency,
        total_foreign: isForeign && form.total_foreign ? parseFloat(form.total_foreign) : undefined,
        fx_rate_inr: isForeign && form.fx_rate_inr ? parseFloat(form.fx_rate_inr) : undefined,
        total_inr: totalInr,
        payment_terms: form.payment_terms.trim() || undefined,
        status: form.status,
        notes: form.notes.trim() || undefined,
      });
      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <p className="text-[15px] font-semibold text-foreground">Add Purchase Order</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X className="h-4 w-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Row 1: Supplier + Invoice # */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Supplier *</label>
              <input value={form.supplier_name} onChange={(e) => set("supplier_name", e.target.value)}
                placeholder="e.g. Shanghai Jspeed" className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Invoice #</label>
              <input value={form.invoice_number} onChange={(e) => set("invoice_number", e.target.value)}
                placeholder="e.g. INV-001" className={inputCls} />
            </div>
          </div>

          {/* Row 2: Date + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Invoice Date *</label>
              <input type="date" value={form.invoice_date} onChange={(e) => set("invoice_date", e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</label>
              <select value={form.status} onChange={(e) => set("status", e.target.value)} className={inputCls}>
                {PO_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Row 3: Currency + Amount */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Currency</label>
              <select value={form.currency} onChange={(e) => set("currency", e.target.value)} className={inputCls}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {isForeign ? (
              <>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Amount ({form.currency})</label>
                  <input type="number" step="0.01" min="0" value={form.total_foreign}
                    onChange={(e) => set("total_foreign", e.target.value)}
                    placeholder="0.00" className={inputCls} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">FX Rate (₹/1)</label>
                  <input type="number" step="0.01" min="0" value={form.fx_rate_inr}
                    onChange={(e) => set("fx_rate_inr", e.target.value)}
                    placeholder="e.g. 84.00" className={inputCls} />
                </div>
              </>
            ) : (
              <div className="col-span-2 space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Amount (₹ INR) *</label>
                <input type="number" step="0.01" min="0" value={form.total_inr}
                  onChange={(e) => set("total_inr", e.target.value)}
                  placeholder="0.00" className={inputCls} />
              </div>
            )}
          </div>

          {/* Auto-computed INR total for foreign currency */}
          {isForeign && form.total_foreign && form.fx_rate_inr && (
            <p className="text-[12px] text-muted-foreground">
              ≈ <span className="text-foreground font-medium">
                {formatINR(Math.round(parseFloat(form.total_foreign) * parseFloat(form.fx_rate_inr) * 100) / 100)}
              </span> will be recorded in INR
            </p>
          )}

          {/* Payment terms */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Payment Terms</label>
            <input value={form.payment_terms} onChange={(e) => set("payment_terms", e.target.value)}
              placeholder="e.g. 30% deposit, 70% on delivery" className={inputCls} />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</label>
            <input value={form.notes} onChange={(e) => set("notes", e.target.value)}
              placeholder="Optional notes" className={inputCls} />
          </div>

          {error && <p className="text-[12px] text-red-400">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-md border border-border text-[13px] text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-violet-600 hover:bg-violet-500 text-[13px] text-white font-medium transition-colors disabled:opacity-60">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              {saving ? "Saving…" : "Save PO"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PurchasesPage() {
  const [period, setPeriod] = useState<PeriodValue>("all");
  const [supplier, setSupplier] = useState("");
  const [status, setStatus] = useState("");
  const [showAdd, setShowAdd] = useState(false);

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
      {showAdd && (
        <AddPurchaseModal
          onClose={() => setShowAdd(false)}
          onSaved={() => { refetch(); }}
        />
      )}

      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Purchase Register"
          subtitle="All purchase orders from suppliers — cost and quantity tracking"
        />
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 hover:bg-violet-500 px-3 py-1.5 text-xs text-white font-medium transition-colors">
            <Plus className="h-3.5 w-3.5" /> Add PO
          </button>
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
