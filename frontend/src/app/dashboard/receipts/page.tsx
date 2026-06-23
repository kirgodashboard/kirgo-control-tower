"use client";

import { useState, useMemo } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { useReceiptsRegister } from "@/lib/hooks/use-registers";
import { useBankAccounts } from "@/lib/hooks/use-bank";
import { formatINR, formatCount } from "@/lib/utils/format";
import { exportToCsv, exportToExcel } from "@/lib/utils/export";
import { getPeriodDates } from "@/lib/utils/date-ranges";
import { Loader2, Download, FileSpreadsheet, RefreshCw, ArrowDownCircle } from "lucide-react";
import type { ReceiptRow } from "@/types/registers";

const PERIODS = [
  { label: "Last 30 Days", value: "30d" },
  { label: "Last 90 Days", value: "90d" },
  { label: "Last 6 Months", value: "6m" },
  { label: "Last 1 Year", value: "1y" },
  { label: "All Time", value: "all" },
] as const;

type PeriodValue = (typeof PERIODS)[number]["value"];

const RECEIPT_TYPES = [
  "gateway_settlement",
  "cod_remittance",
  "founder_transfer",
  "customer_refund",
  "miscellaneous",
  "unclassified",
];

function typeBadge(type: string) {
  const map: Record<string, string> = {
    gateway_settlement: "bg-emerald-500/10 text-emerald-400",
    cod_remittance:     "bg-blue-500/10 text-blue-400",
    founder_transfer:   "bg-violet-500/10 text-violet-400",
    customer_refund:    "bg-amber-500/10 text-amber-400",
    miscellaneous:      "bg-muted text-muted-foreground",
    unclassified:       "bg-orange-500/10 text-orange-400",
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

export default function ReceiptsPage() {
  const [period, setPeriod] = useState<PeriodValue>("30d");
  const [bankAccountId, setBankAccountId] = useState<number | undefined>();
  const [type, setType] = useState("");

  const dateRange = getPeriodDates(period);

  const { data, isLoading, isFetching, refetch } = useReceiptsRegister({
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
    unreconciled: rows.filter((r) => r.transaction_type === "unclassified").length,
  }), [rows]);

  const selectCls = "h-8 px-2 rounded-md border border-border bg-card text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500";

  const toExportRows = (rows: ReceiptRow[]) =>
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
          title="Receipts"
          subtitle="All money received — bank deposits, settlements, COD remittances"
        />
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => refetch()} disabled={isFetching}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground hover:border-primary/40 transition-colors disabled:opacity-60">
            {isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          </button>
          <button onClick={() => exportToCsv(`receipts-${dateRange.start}-${dateRange.end}`, toExportRows(rows))} disabled={!rows.length}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground hover:border-violet-500/40 transition-colors disabled:opacity-40">
            <Download className="h-3 w-3" /> CSV
          </button>
          <button onClick={() => exportToExcel(`receipts-${dateRange.start}-${dateRange.end}`, toExportRows(rows), "Receipts")} disabled={!rows.length}
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
          {RECEIPT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
        </select>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Receipts", value: formatCount(totals.count) },
          { label: "Total Received", value: formatINR(totals.amount), color: "text-emerald-400" },
          { label: "Unreconciled", value: formatCount(totals.unreconciled), warn: totals.unreconciled > 0 },
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
            {isLoading ? "Loading…" : `${formatCount(rows.length)} receipts`}
            <span className="ml-2 text-[11px] text-muted-foreground font-normal">{dateRange.label}</span>
          </p>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">No receipts found for the selected filters.</div>
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
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-emerald-400">
                      <span className="flex items-center justify-end gap-1">
                        <ArrowDownCircle className="h-3 w-3" />
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
