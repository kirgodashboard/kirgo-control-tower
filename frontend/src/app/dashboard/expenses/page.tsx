"use client";

import { useState, useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  Download, TrendingUp, TrendingDown, Wallet, Store, AlertCircle,
  FilePlus, X, CheckCircle, Loader2, FileSpreadsheet, RefreshCw, Link2,
} from "lucide-react";
import { PageHeader, PeriodTabs } from "@/components/ui/page-header";
import {
  useExpenseKpis,
  useExpenseList,
  useExpenseByCategory,
  useExpenseTrend,
  useTopVendors,
  useExpenseCategories,
} from "@/lib/hooks/use-expenses";
import { useExpensesRegister } from "@/lib/hooks/use-registers";
import { useBankAccounts } from "@/lib/hooks/use-bank";
import { insertExpense } from "@/lib/data/expenses";
import { formatINR, formatCount } from "@/lib/utils/format";
import { exportToCsv, exportToExcel } from "@/lib/utils/export";
import { getPeriodDates, getMtdRange } from "@/lib/utils/date-ranges";
import type { Period } from "@/types/chart";
import type { ExpenseListItem } from "@/types/kpi";
import type { ExpensesRegisterRow } from "@/types/registers";

// ── Types / constants ─────────────────────────────────────────────────────────

type Tab = "overview" | "register";

const OVERVIEW_PERIODS = [
  { key: "mtd", label: "MTD" },
  { key: "30d", label: "30 Days" },
  { key: "90d", label: "90 Days" },
  { key: "6m",  label: "6 Months" },
  { key: "all", label: "All Time" },
];

const REGISTER_PERIODS = [
  { label: "Last 30 Days", value: "30d" },
  { label: "Last 90 Days", value: "90d" },
  { label: "Last 6 Months", value: "6m" },
  { label: "Last 1 Year",   value: "1y" },
  { label: "All Time",      value: "all" },
] as const;
type RegPeriod = (typeof REGISTER_PERIODS)[number]["value"];

const PAYMENT_METHODS = [
  { value: "upi",           label: "UPI" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "debit_card",   label: "Debit Card" },
  { value: "credit_card",  label: "Credit Card" },
  { value: "paypal",       label: "PayPal" },
  { value: "swift",        label: "SWIFT" },
];

const STATUS_OPTIONS = [
  { value: "draft",    label: "Draft" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const EMPTY_FORM = {
  expense_date:   "",
  category_id:    "",
  description:    "",
  amount_inr:     "",
  vendor:         "",
  payment_method: "",
  notes:          "",
  attachment_url: "",
  status:         "draft",
};
type FormState = typeof EMPTY_FORM;

const STATUS_COLORS: Record<string, string> = {
  approved: "bg-emerald-500/10 text-emerald-400",
  rejected:  "bg-red-500/10 text-red-400",
  draft:     "bg-muted text-muted-foreground",
};

const inputCls =
  "w-full h-9 px-3 rounded-md border border-border bg-background text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet-500 transition-colors";
const selectCls =
  "w-full h-9 px-3 rounded-md border border-border bg-background text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500 transition-colors";
const filterSelectCls =
  "h-8 px-2 rounded-md border border-border bg-card text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500";

// ── New Expense Form ──────────────────────────────────────────────────────────

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function NewExpenseForm({ categories, onClose }: { categories: { id: number; name: string }[]; onClose: () => void }) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const set = (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.expense_date || !form.category_id || !form.description || !form.amount_inr) {
      setResult({ ok: false, message: "Date, category, description, and amount are required." });
      return;
    }
    const amount = parseFloat(form.amount_inr);
    if (isNaN(amount) || amount <= 0) {
      setResult({ ok: false, message: "Amount must be a positive number." });
      return;
    }
    setSubmitting(true);
    setResult(null);
    try {
      const id = await insertExpense({
        expenseDate:   form.expense_date,
        categoryId:    Number(form.category_id),
        description:   form.description,
        amountInr:     amount,
        vendor:        form.vendor        || undefined,
        paymentMethod: form.payment_method || undefined,
        notes:         form.notes         || undefined,
        attachmentUrl: form.attachment_url || undefined,
        status:        form.status,
      });
      setResult({ ok: true, message: `Expense #${id} saved as ${form.status}.` });
      setForm(EMPTY_FORM);
    } catch (err: unknown) {
      setResult({ ok: false, message: `Failed to save: ${err instanceof Error ? err.message : "Unknown error"}` });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-violet-500/30 bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FilePlus className="h-4 w-4 text-violet-400" />
          <p className="text-[14px] font-semibold text-foreground">New Expense</p>
        </div>
        <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Expense Date" required>
            <input type="date" value={form.expense_date} onChange={set("expense_date")} className={inputCls} required />
          </FormField>
          <FormField label="Amount (₹)" required>
            <input type="number" min="0.01" step="0.01" value={form.amount_inr} onChange={set("amount_inr")} placeholder="0.00" className={inputCls} required />
          </FormField>
        </div>

        <FormField label="Expense Category" required>
          <select value={form.category_id} onChange={set("category_id")} className={selectCls} required>
            <option value="">Select category...</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </FormField>

        <FormField label="Description" required>
          <input type="text" value={form.description} onChange={set("description")} placeholder="Brief description of the expense" className={inputCls} required />
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Vendor">
            <input type="text" value={form.vendor} onChange={set("vendor")} placeholder="Vendor or payee name" className={inputCls} />
          </FormField>
          <FormField label="Payment Method">
            <select value={form.payment_method} onChange={set("payment_method")} className={selectCls}>
              <option value="">Select method...</option>
              {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </FormField>
        </div>

        <FormField label="Notes">
          <textarea value={form.notes} onChange={set("notes")} placeholder="Additional notes..." rows={2}
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet-500 transition-colors resize-none" />
        </FormField>

        <div className="flex items-center gap-2">
          {STATUS_OPTIONS.map(s => (
            <button key={s.value} type="button" onClick={() => setForm(prev => ({ ...prev, status: s.value }))}
              className={`flex-1 h-9 rounded-md text-[12px] font-semibold border transition-colors ${
                form.status === s.value
                  ? s.value === "approved" ? "bg-emerald-500/10 border-emerald-500 text-emerald-400"
                    : s.value === "rejected" ? "bg-red-500/10 border-red-500 text-red-400"
                    : "bg-violet-500/10 border-violet-500 text-violet-400"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {result && (
          <div className={`flex items-center gap-2.5 p-3 rounded-md text-[13px] ${result.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
            {result.ok ? <CheckCircle className="h-4 w-4 flex-shrink-0" /> : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
            {result.message}
          </div>
        )}

        <div className="flex gap-2">
          <button type="submit" disabled={submitting}
            className="flex-1 h-10 rounded-md bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-semibold transition-colors disabled:opacity-50">
            {submitting ? "Saving..." : "Save Expense"}
          </button>
          <button type="button" onClick={onClose}
            className="h-10 px-4 rounded-md border border-border text-[13px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Sort helpers ──────────────────────────────────────────────────────────────

type SortState = { col: string; dir: "asc" | "desc" };

function useSortState(def: string): [SortState, (c: string) => void] {
  const [sort, setSort] = useState<SortState>({ col: def, dir: "desc" });
  const toggle = (c: string) =>
    setSort((p) =>
      p.col === c ? { col: c, dir: p.dir === "asc" ? "desc" : "asc" } : { col: c, dir: "desc" }
    );
  return [sort, toggle];
}

function sortRows<T>(rows: T[], s: SortState): T[] {
  return [...rows].sort((a, b) => {
    const va = (a as Record<string, unknown>)[s.col];
    const vb = (b as Record<string, unknown>)[s.col];
    if (typeof va === "number" && typeof vb === "number")
      return s.dir === "asc" ? va - vb : vb - va;
    return s.dir === "asc"
      ? String(va ?? "").localeCompare(String(vb ?? ""))
      : String(vb ?? "").localeCompare(String(va ?? ""));
  });
}

function SortTh({ col, label, sort, toggle, className }: {
  col: string; label: string; sort: SortState; toggle: (c: string) => void; className?: string;
}) {
  const active = sort.col === col;
  return (
    <th onClick={() => toggle(col)}
      className={`px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground ${className ?? ""}`}>
      {label}
      <span className={`ml-1 ${active ? "text-violet-400" : "text-muted-foreground/30"}`}>
        {active ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}
      </span>
    </th>
  );
}

function exportCsv(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const csv = [
    cols.join(","),
    ...rows.map((r) =>
      cols.map((c) => {
        const v = r[c];
        if (typeof v === "string" && (v.includes(",") || v.includes('"')))
          return `"${v.replace(/"/g, '""')}"`;
        return v ?? "";
      }).join(",")
    ),
  ].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
}

// ── Overview tab components ───────────────────────────────────────────────────

function ExpenseKpiRow({ start, end }: { start: string; end: string }) {
  const { data: kpis, isLoading } = useExpenseKpis(start, end);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl skeleton" />
        ))}
      </div>
    );
  }
  if (!kpis) return null;

  const growth = kpis.expense_growth_pct;
  const growthColor = growth === null ? "" : growth > 0 ? "text-red-400" : "text-emerald-400";

  const cards = [
    { label: "Total Expenses", value: formatINR(kpis.total_expense_inr),
      sub: growth !== null ? `${growth > 0 ? "+" : ""}${growth.toFixed(1)}% vs prior period` : "vs prior period",
      subColor: growthColor, icon: <Wallet className="h-4 w-4" />, iconColor: "text-violet-400" },
    { label: "Monthly Run Rate", value: formatINR(kpis.monthly_run_rate_inr),
      sub: "30-day projection", icon: <TrendingUp className="h-4 w-4" />, iconColor: "text-amber-400" },
    { label: "Largest Head", value: kpis.largest_head_name === "N/A" ? "—" : kpis.largest_head_name,
      sub: kpis.largest_head_name === "N/A" ? "" : formatINR(kpis.largest_head_amount_inr),
      icon: <TrendingDown className="h-4 w-4" />, iconColor: "text-orange-400" },
    { label: "Largest Vendor", value: kpis.largest_vendor === "N/A" ? "—" : kpis.largest_vendor,
      sub: kpis.largest_vendor === "N/A" ? "" : formatINR(kpis.largest_vendor_amount_inr),
      icon: <Store className="h-4 w-4" />, iconColor: "text-sky-400" },
    { label: "Unclassified", value: kpis.unclassified_count.toString(),
      sub: "bank txns need classification", icon: <AlertCircle className="h-4 w-4" />,
      iconColor: kpis.unclassified_count > 0 ? "text-amber-400" : "text-emerald-400",
      valuePill: kpis.unclassified_count > 0 ? "amber" : "green" },
  ] as const;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((c, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{c.label}</span>
            <span className={c.iconColor}>{c.icon}</span>
          </div>
          <div className={`text-[20px] font-bold tabular-nums leading-none mb-1 ${
            "valuePill" in c && c.valuePill === "amber" ? "text-amber-400"
            : "valuePill" in c && c.valuePill === "green" ? "text-emerald-400"
            : "text-foreground"
          }`}>
            {c.value}
          </div>
          {"sub" in c && c.sub && (
            <p className={`text-[11px] ${"subColor" in c && c.subColor ? c.subColor : "text-muted-foreground"}`}>{c.sub}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function ExpenseByCategoryChart({ start, end }: { start: string; end: string }) {
  const { data = [], isLoading } = useExpenseByCategory(start, end);
  if (isLoading) return <div className="h-52 rounded-lg skeleton" />;
  if (!data.length) return <p className="text-[13px] text-muted-foreground text-center py-8">No expense data</p>;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data.slice(0, 10)} layout="vertical" margin={{ left: 8, right: 8, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => formatINR(v)} axisLine={false} tickLine={false} />
        <YAxis dataKey="category_name" type="category" width={110} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v) => [formatINR(Number(v)), "Spend"]} />
        <Bar dataKey="total_inr" fill="#7c3aed" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function ExpenseTrendChart({ start, end }: { start: string; end: string }) {
  const { data = [], isLoading } = useExpenseTrend(start, end);
  if (isLoading) return <div className="h-52 rounded-lg skeleton" />;
  if (!data.length) return <p className="text-[13px] text-muted-foreground text-center py-8">No trend data</p>;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ left: 8, right: 8, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="period" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => formatINR(v)} axisLine={false} tickLine={false} width={64} />
        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v) => [formatINR(Number(v)), "Expenses"]} />
        <Line dataKey="total_inr" stroke="#f59e0b" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function TopVendorsTable({ start, end }: { start: string; end: string }) {
  const { data = [], isLoading } = useTopVendors(start, end);
  const [sort, toggle] = useSortState("total_inr");
  const rows = sortRows(data, sort);
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px] font-semibold text-foreground">Top Vendors</p>
        <button onClick={() => exportCsv(rows as unknown as Record<string, unknown>[], "top-vendors")}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
          <Download className="h-3 w-3" /> CSV
        </button>
      </div>
      {isLoading ? <div className="h-40 rounded-lg skeleton" /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border">
                <SortTh col="vendor"            label="Vendor" sort={sort} toggle={toggle} />
                <SortTh col="total_inr"         label="Spend"  sort={sort} toggle={toggle} className="text-right" />
                <SortTh col="transaction_count" label="Txns"   sort={sort} toggle={toggle} className="text-right" />
                <SortTh col="last_expense_date" label="Last"   sort={sort} toggle={toggle} />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No data</td></tr>
              ) : rows.map((r, i) => (
                <tr key={i} className="border-b border-border/30 hover:bg-accent/30">
                  <td className="px-3 py-2 font-medium text-foreground">{r.vendor}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatINR(r.total_inr)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.transaction_count}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.last_expense_date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TopHeadsTable({ start, end }: { start: string; end: string }) {
  const { data = [], isLoading } = useExpenseByCategory(start, end);
  const [sort, toggle] = useSortState("total_inr");
  const rows = sortRows(data, sort);
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px] font-semibold text-foreground">Expense Heads</p>
        <button onClick={() => exportCsv(rows as unknown as Record<string, unknown>[], "expense-heads")}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
          <Download className="h-3 w-3" /> CSV
        </button>
      </div>
      {isLoading ? <div className="h-40 rounded-lg skeleton" /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border">
                <SortTh col="category_name"     label="Category"   sort={sort} toggle={toggle} />
                <SortTh col="total_inr"         label="Spend"      sort={sort} toggle={toggle} className="text-right" />
                <SortTh col="pct_of_total"      label="% of Total" sort={sort} toggle={toggle} className="text-right" />
                <SortTh col="transaction_count" label="Txns"       sort={sort} toggle={toggle} className="text-right" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No data</td></tr>
              ) : rows.map((r, i) => (
                <tr key={i} className="border-b border-border/30 hover:bg-accent/30">
                  <td className="px-3 py-2 font-medium text-foreground">{r.category_name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatINR(r.total_inr)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.pct_of_total}%</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.transaction_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ExpenseListTable({ start, end }: { start: string; end: string }) {
  const { data: categories = [] } = useExpenseCategories();
  const [filterCat, setFilterCat] = useState<number | null>(null);
  const [filterVendor, setFilterVendor] = useState("");
  const [sort, toggle] = useSortState("expense_date");
  const { data = [], isLoading } = useExpenseList(start, end, filterCat, filterVendor || null);
  const sorted = useMemo(() => sortRows(data, sort), [data, sort]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select value={filterCat ?? ""} onChange={(e) => setFilterCat(e.target.value ? Number(e.target.value) : null)}
          className="h-8 px-2.5 rounded-md border border-border bg-card text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500">
          <option value="">All Categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="text" placeholder="Filter vendor..." value={filterVendor} onChange={(e) => setFilterVendor(e.target.value)}
          className="h-8 px-2.5 rounded-md border border-border bg-card text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet-500 w-40" />
        <div className="ml-auto">
          <button onClick={() => exportCsv(sorted as unknown as Record<string, unknown>[], "expenses")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent border border-border transition-colors">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        </div>
      </div>
      {isLoading ? <div className="h-52 rounded-lg skeleton" /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border">
                <SortTh col="expense_date"  label="Date"        sort={sort} toggle={toggle} />
                <SortTh col="category_name" label="Category"    sort={sort} toggle={toggle} />
                <SortTh col="description"   label="Description" sort={sort} toggle={toggle} />
                <SortTh col="vendor"        label="Vendor"      sort={sort} toggle={toggle} />
                <SortTh col="amount_inr"    label="Amount"      sort={sort} toggle={toggle} className="text-right" />
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr><td colSpan={6} className="py-10 text-center text-muted-foreground">No expenses found</td></tr>
              ) : sorted.map((r: ExpenseListItem) => (
                <tr key={r.id} className="border-b border-border/30 hover:bg-accent/30">
                  <td className="px-3 py-2 tabular-nums text-muted-foreground whitespace-nowrap">{r.expense_date}</td>
                  <td className="px-3 py-2 text-foreground">{r.category_name}</td>
                  <td className="px-3 py-2 text-muted-foreground max-w-[180px] truncate" title={r.description}>{r.description}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.vendor ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground">{formatINR(r.amount_inr)}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[r.status ?? "draft"] ?? STATUS_COLORS.draft}`}>
                      {r.status ?? "draft"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground text-right">{sorted.length} records</p>
    </div>
  );
}

// ── Register tab ──────────────────────────────────────────────────────────────

function RegisterTab({ categories }: { categories: { id: number; name: string }[] }) {
  const [period, setPeriod] = useState<RegPeriod>("30d");
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [vendor, setVendor] = useState("");
  const [bankAccountId, setBankAccountId] = useState<number | undefined>();

  const dateRange = getPeriodDates(period as Period);
  const { data, isLoading, isFetching, refetch } = useExpensesRegister({
    start: dateRange.start,
    end: dateRange.end,
    categoryId,
    vendor: vendor || undefined,
    bankAccountId,
  });
  const { data: bankAccounts } = useBankAccounts();

  const rows = data ?? [];
  const totals = useMemo(() => ({
    count: rows.length,
    amount: rows.reduce((s, r) => s + r.amount_inr, 0),
    classified: rows.filter((r) => r.is_classified).length,
    unlinked: rows.filter((r) => !r.is_classified).length,
  }), [rows]);

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
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-[13px] text-muted-foreground">All expense entries with bank account linkage and classification status</p>
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
        <select value={period} onChange={(e) => setPeriod(e.target.value as RegPeriod)} className={filterSelectCls}>
          {REGISTER_PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <select value={categoryId ?? ""} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : undefined)} className={filterSelectCls}>
          <option value="">All Categories</option>
          {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={bankAccountId ?? ""} onChange={(e) => setBankAccountId(e.target.value ? Number(e.target.value) : undefined)} className={filterSelectCls}>
          <option value="">All Bank Accounts</option>
          {bankAccounts?.map((a) => <option key={a.id} value={a.id}>{a.bank_name} · {a.account_name}</option>)}
        </select>
        <input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Filter by vendor…"
          className="h-8 px-3 rounded-md border border-border bg-card text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet-500 w-40" />
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Expenses",     value: formatCount(totals.count) },
          { label: "Total Amount", value: formatINR(totals.amount) },
          { label: "Bank Linked",  value: formatCount(totals.classified) },
          { label: "Unlinked",     value: formatCount(totals.unlinked), warn: totals.unlinked > 0 },
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ExpensesPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [period, setPeriod] = useState<Period | "mtd">("30d");
  const [showForm, setShowForm] = useState(false);

  const range = period === "mtd" ? getMtdRange() : getPeriodDates(period as Period);
  const { data: categories = [] } = useExpenseCategories();

  return (
    <div className="min-h-full p-4 sm:p-6 space-y-5">
      <PageHeader title="Expenses" subtitle="Spend analytics, register, and expense entry in one place">
        {tab === "overview" && (
          <div className="flex items-center gap-2">
            <PeriodTabs value={period} options={OVERVIEW_PERIODS} onChange={(k) => setPeriod(k as Period | "mtd")} />
            <button
              onClick={() => setShowForm(v => !v)}
              className={`flex items-center gap-1.5 h-8 px-3 rounded-md text-[12px] font-semibold border transition-colors ${
                showForm
                  ? "bg-violet-600 border-violet-600 text-white"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              <FilePlus className="h-3.5 w-3.5" />
              New Expense
            </button>
          </div>
        )}
      </PageHeader>

      {/* Tab strip */}
      <div className="border-b border-border">
        <div className="flex gap-0">
          {([
            { id: "overview", label: "Overview & Entry" },
            { id: "register", label: "Bank Register" },
          ] as { id: Tab; label: string }[]).map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors -mb-px ${
                tab === id
                  ? "border-violet-500 text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" && (
        <>
          {showForm && <NewExpenseForm categories={categories} onClose={() => setShowForm(false)} />}
          <ExpenseKpiRow start={range.start} end={range.end} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-[15px] font-semibold text-foreground mb-1">Spend by Category</p>
              <p className="text-[12px] text-muted-foreground mb-4">Top 10 expense heads this period</p>
              <ExpenseByCategoryChart start={range.start} end={range.end} />
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-[15px] font-semibold text-foreground mb-1">Expense Trend</p>
              <p className="text-[12px] text-muted-foreground mb-4">Weekly/monthly total outflow</p>
              <ExpenseTrendChart start={range.start} end={range.end} />
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-border bg-card p-5">
              <TopVendorsTable start={range.start} end={range.end} />
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <TopHeadsTable start={range.start} end={range.end} />
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-[15px] font-semibold text-foreground mb-4">All Expenses</p>
            <ExpenseListTable start={range.start} end={range.end} />
          </div>
        </>
      )}

      {tab === "register" && <RegisterTab categories={categories} />}
    </div>
  );
}
