"use client";

import { useState, useMemo } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { useExpensesRegister } from "@/lib/hooks/use-registers";
import { useExpenseCategories } from "@/lib/hooks/use-expenses";
import { useBankAccounts } from "@/lib/hooks/use-bank";
import { formatINR, formatCount } from "@/lib/utils/format";
import { exportToCsv, exportToExcel } from "@/lib/utils/export";
import { getPeriodDates } from "@/lib/utils/date-ranges";
import { Loader2, Download, FileSpreadsheet, RefreshCw, Link2, AlertCircle } from "lucide-react";
import type { ExpensesRegisterRow } from "@/types/registers";

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

export default function ExpensesRegisterPage() {
  const [period, setPeriod] = useState<PeriodValue>("30d");
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [vendor, setVendor] = useState("");
  const [bankAccountId, setBankAccountId] = useState<number | undefined>();

  const dateRange = getPeriodDates(period);

  const { data, isLoading, isFetching, refetch } = useExpensesRegister({
    start: dateRange.start,
    end: dateRange.end,
    categoryId,
    vendor: vendor || undefined,
    bankAccountId,
  });

  const { data: categories } = useExpenseCategories();
  const { data: bankAccounts } = useBankAccounts();

  const rows = data ?? [];

  const totals = useMemo(() => ({
    count: rows.length,
    amount: rows.reduce((s, r) => s + r.amount_inr, 0),
    classified: rows.filter((r) => r.is_classified).length,
    unlinked: rows.filter((r) => !r.is_classified).length,
  }), [rows]);

  const selectCls = "h-8 px-2 rounded-md border border-border bg-card text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500";

  const toExportRows = (rows: ExpensesRegisterRow[]) =>
    rows.map((r) => ({
      "Date":            fmtDate(r.expense_date),
      "Vendor":          r.vendor ?? "",
      "Narration":       r.description,
      "Category":        r.category_name ?? "",
      "Category Group":  r.category_group ?? "",
      "Amount (₹)":      r.amount_inr,
      "Payment Method":  r.payment_method ?? "",
      "Bank Account":    r.bank_account ?? "",
      "Bank Entry Date": fmtDate(r.bank_tx_date),
      "Bank Narration":  r.bank_narration ?? "",
      "Status":          r.status,
      "Bank Linked":     r.is_classified ? "Yes" : "No",
    }));

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Expenses Register"
          subtitle="All expense entries with bank account linkage and classification status"
        />
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => refetch()} disabled={isFetching}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground hover:border-primary/40 transition-colors disabled:opacity-60">
            {isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          </button>
          <button onClick={() => exportToCsv(`expenses-${dateRange.start}-${dateRange.end}`, toExportRows(rows))} disabled={!rows.length}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground hover:border-violet-500/40 transition-colors disabled:opacity-40">
            <Download className="h-3 w-3" /> CSV
          </button>
          <button onClick={() => exportToExcel(`expenses-${dateRange.start}-${dateRange.end}`, toExportRows(rows), "Expenses")} disabled={!rows.length}
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
        <select value={categoryId ?? ""} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : undefined)} className={selectCls}>
          <option value="">All Categories</option>
          {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={bankAccountId ?? ""} onChange={(e) => setBankAccountId(e.target.value ? Number(e.target.value) : undefined)} className={selectCls}>
          <option value="">All Bank Accounts</option>
          {bankAccounts?.map((a) => <option key={a.id} value={a.id}>{a.bank_name} · {a.account_name}</option>)}
        </select>
        <input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Filter by vendor…"
          className="h-8 px-3 rounded-md border border-border bg-card text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet-500 w-40" />
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Expenses", value: formatCount(totals.count) },
          { label: "Total Amount", value: formatINR(totals.amount) },
          { label: "Bank Linked", value: formatCount(totals.classified) },
          { label: "Unlinked", value: formatCount(totals.unlinked), warn: totals.unlinked > 0 },
        ].map(({ label, value, warn }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
            <p className={`text-lg font-bold tabular-nums ${warn ? "text-amber-400" : "text-foreground"}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-[13px] font-semibold text-foreground">
            {isLoading ? "Loading…" : `${formatCount(rows.length)} expenses`}
            <span className="ml-2 text-[11px] text-muted-foreground font-normal">{dateRange.label}</span>
          </p>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">No expenses found for the selected filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="border-b border-border bg-muted/30">
                <tr>
                  {["Date","Vendor","Narration","Category","Group","Amount","Payment Method","Bank Account","Bank Entry","Status","Linked"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.expense_id} className="border-b border-border/40 hover:bg-muted/20 last:border-0">
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{fmtDate(row.expense_date)}</td>
                    <td className="px-3 py-2 max-w-[100px]"><p className="truncate">{row.vendor || <span className="text-muted-foreground">—</span>}</p></td>
                    <td className="px-3 py-2 max-w-[160px]"><p className="truncate">{row.description}</p></td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.category_name || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.category_group || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{formatINR(row.amount_inr)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.payment_method || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{row.bank_account || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{fmtDate(row.bank_tx_date)}</td>
                    <td className="px-3 py-2 capitalize text-muted-foreground">{row.status}</td>
                    <td className="px-3 py-2">
                      {row.is_classified
                        ? <Link2 className="h-3.5 w-3.5 text-emerald-500" />
                        : <AlertCircle className="h-3.5 w-3.5 text-amber-400" />}
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
