"use client";

import { useState, useMemo } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { usePaymentsRegister } from "@/lib/hooks/use-registers";
import { useBankAccounts } from "@/lib/hooks/use-bank";
import { formatINR, formatCount } from "@/lib/utils/format";
import { exportToCsv, exportToExcel } from "@/lib/utils/export";
import { getPeriodDates } from "@/lib/utils/date-ranges";
import { Loader2, Download, FileSpreadsheet, RefreshCw, ArrowUpCircle } from "lucide-react";
import type { PaymentRow } from "@/types/registers";

const PERIODS = [
  { label: "Last 30 Days", value: "30d" },
  { label: "Last 90 Days", value: "90d" },
  { label: "Last 6 Months", value: "6m" },
  { label: "Last 1 Year", value: "1y" },
  { label: "All Time", value: "all" },
] as const;

type PeriodValue = (typeof PERIODS)[number]["value"];

const PAYMENT_TYPES = [
  "vendor_payment",
  "supplier_payment",
  "salary",
  "logistics",
  "marketing",
  "platform_fee",
  "tax_payment",
  "loan_repayment",
  "miscellaneous",
  "unclassified",
];

function typeBadge(type: string) {
  const map: Record<string, string> = {
    vendor_payment:   "bg-blue-500/10 text-blue-400",
    supplier_payment: "bg-violet-500/10 text-violet-400",
    salary:           "bg-emerald-500/10 text-emerald-400",
    logistics:        "bg-cyan-500/10 text-cyan-400",
    marketing:        "bg-pink-500/10 text-pink-400",
    platform_fee:     "bg-muted text-muted-foreground",
    tax_payment:      "bg-amber-500/10 text-amber-400",
    loan_repayment:   "bg-red-500/10 text-red-400",
    miscellaneous:    "bg-muted text-muted-foreground",
    unclassified:     "bg-orange-500/10 text-orange-400",
  };
  const cls = map[type] ?? "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>
      {type.replace(/_/g, " ")}
    </span>
  );
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
}

export default function PaymentsPage() {
  const [period, setPeriod] = useState<PeriodValue>("30d");
  const [bankAccountId, setBankAccountId] = useState<number | undefined>();
  const [type, setType] = useState("");

  const dateRange = getPeriodDates(period);

  const { data, isLoading, isFetching, refetch } = usePaymentsRegister({
    start: dateRange.start,
    end: dateRange.end,
    bankAccountId,
    type: type || undefined,
  });

  const { data: bankAccounts } = useBankAccounts();
  const rows = data ?? [];

  const totals = useMemo(() => ({
    count: rows.length,
    amount: rows.reduce((s, r) => s + r.amount_inr, 0),
    unclassified: rows.filter((r) => r.transaction_type === "unclassified").length,
  }), [rows]);

  const selectCls = "h-8 px-2 rounded-md border border-border bg-card text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500";

  const toExportRows = (rows: PaymentRow[]) =>
    rows.map((r) => ({
      "Date":             fmtDate(r.transaction_date),
      "Bank Account":     r.bank_account,
      "Narration":        r.narration,
      "Counterparty":     r.counterparty ?? "",
      "Reference":        r.reference_number ?? "",
      "Amount (₹)":       r.amount_inr,
      "Closing Balance":  r.closing_balance ?? "",
      "Type":             r.transaction_type,
      "Value Date":       fmtDate(r.value_date),
    }));

  return (
    <div className="flex flex-col gap-5 p-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Payments"
          subtitle="All money paid out — vendor payments, supplier payments, operating expenses"
        />
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => refetch()} disabled={isFetching}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground hover:border-primary/40 transition-colors disabled:opacity-60">
            {isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          </button>
          <button onClick={() => exportToCsv(`payments-${dateRange.start}-${dateRange.end}`, toExportRows(rows))} disabled={!rows.length}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground hover:border-violet-500/40 transition-colors disabled:opacity-40">
            <Download className="h-3 w-3" /> CSV
          </button>
          <button onClick={() => exportToExcel(`payments-${dateRange.start}-${dateRange.end}`, toExportRows(rows), "Payments")} disabled={!rows.length}
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
        <select value={bankAccountId ?? ""} onChange={(e) => setBankAccountId(e.target.value ? Number(e.target.value) : undefined)} className={selectCls}>
          <option value="">All Bank Accounts</option>
          {bankAccounts?.map((a) => <option key={a.id} value={a.id}>{a.bank_name} · {a.account_name}</option>)}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} className={selectCls}>
          <option value="">All Types</option>
          {PAYMENT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
        </select>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Payments", value: formatCount(totals.count) },
          { label: "Total Paid Out", value: formatINR(totals.amount), color: "text-red-400" },
          { label: "Unclassified", value: formatCount(totals.unclassified), warn: totals.unclassified > 0 },
        ].map(({ label, value, color, warn }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
            <p className={`text-lg font-bold tabular-nums ${warn ? "text-amber-400" : color ?? "text-foreground"}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-[13px] font-semibold text-foreground">
            {isLoading ? "Loading…" : `${formatCount(rows.length)} payments`}
            <span className="ml-2 text-[11px] text-muted-foreground font-normal">{dateRange.label}</span>
          </p>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">No payments found for the selected filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="border-b border-border bg-muted/30">
                <tr>
                  {["Date","Bank Account","Narration","Counterparty","Reference","Amount","Balance","Type"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.tx_id} className="border-b border-border/40 hover:bg-muted/20 last:border-0">
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{fmtDate(row.transaction_date)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.bank_account}</td>
                    <td className="px-3 py-2 max-w-[200px]"><p className="truncate">{row.narration}</p></td>
                    <td className="px-3 py-2 max-w-[100px]"><p className="truncate text-muted-foreground">{row.counterparty || "—"}</p></td>
                    <td className="px-3 py-2 font-mono text-muted-foreground whitespace-nowrap">{row.reference_number || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-red-400">
                      <span className="flex items-center justify-end gap-1">
                        <ArrowUpCircle className="h-3 w-3" />
                        {formatINR(row.amount_inr)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {row.closing_balance != null ? formatINR(row.closing_balance) : "—"}
                    </td>
                    <td className="px-3 py-2">{typeBadge(row.transaction_type)}</td>
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
