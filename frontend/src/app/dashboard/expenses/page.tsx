"use client";

import { useState, useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import { Download, TrendingUp, TrendingDown, Wallet, Store, AlertCircle } from "lucide-react";
import { PageHeader, PeriodTabs } from "@/components/ui/page-header";
import {
  useExpenseKpis,
  useExpenseList,
  useExpenseByCategory,
  useExpenseTrend,
  useTopVendors,
  useExpenseCategories,
} from "@/lib/hooks/use-expenses";
import { formatINR } from "@/lib/utils/format";
import { getPeriodDates, getMtdRange } from "@/lib/utils/date-ranges";
import type { Period } from "@/types/chart";
import type { ExpenseListItem } from "@/types/kpi";

const PERIODS = [
  { key: "mtd", label: "MTD" },
  { key: "30d", label: "30 Days" },
  { key: "90d", label: "90 Days" },
  { key: "6m",  label: "6 Months" },
  { key: "all", label: "All Time" },
];

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

function SortTh({
  col, label, sort, toggle, className,
}: {
  col: string; label: string; sort: SortState; toggle: (c: string) => void; className?: string;
}) {
  const active = sort.col === col;
  return (
    <th
      onClick={() => toggle(col)}
      className={`px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground ${className ?? ""}`}
    >
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

// ── KPI Row ───────────────────────────────────────────────────────────────────

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
    {
      label: "Total Expenses",
      value: formatINR(kpis.total_expense_inr),
      sub: growth !== null
        ? `${growth > 0 ? "+" : ""}${growth.toFixed(1)}% vs prior period`
        : "vs prior period",
      subColor: growthColor,
      icon: <Wallet className="h-4 w-4" />,
      iconColor: "text-violet-400",
    },
    {
      label: "Monthly Run Rate",
      value: formatINR(kpis.monthly_run_rate_inr),
      sub: "30-day projection",
      icon: <TrendingUp className="h-4 w-4" />,
      iconColor: "text-amber-400",
    },
    {
      label: "Largest Head",
      value: kpis.largest_head_name === "N/A" ? "—" : kpis.largest_head_name,
      sub: kpis.largest_head_name === "N/A" ? "" : formatINR(kpis.largest_head_amount_inr),
      icon: <TrendingDown className="h-4 w-4" />,
      iconColor: "text-orange-400",
    },
    {
      label: "Largest Vendor",
      value: kpis.largest_vendor === "N/A" ? "—" : kpis.largest_vendor,
      sub: kpis.largest_vendor === "N/A" ? "" : formatINR(kpis.largest_vendor_amount_inr),
      icon: <Store className="h-4 w-4" />,
      iconColor: "text-sky-400",
    },
    {
      label: "Unclassified",
      value: kpis.unclassified_count.toString(),
      sub: "bank txns need classification",
      icon: <AlertCircle className="h-4 w-4" />,
      iconColor: kpis.unclassified_count > 0 ? "text-amber-400" : "text-emerald-400",
      valuePill: kpis.unclassified_count > 0 ? "amber" : "green",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((c, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {c.label}
            </span>
            <span className={c.iconColor}>{c.icon}</span>
          </div>
          <div
            className={`text-[20px] font-bold tabular-nums leading-none mb-1 ${
              c.valuePill === "amber"
                ? "text-amber-400"
                : c.valuePill === "green"
                ? "text-emerald-400"
                : "text-foreground"
            }`}
          >
            {c.value}
          </div>
          {c.sub && (
            <p className={`text-[11px] ${c.subColor ?? "text-muted-foreground"}`}>{c.sub}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Charts ────────────────────────────────────────────────────────────────────

function ExpenseByCategoryChart({ start, end }: { start: string; end: string }) {
  const { data = [], isLoading } = useExpenseByCategory(start, end);

  if (isLoading) return <div className="h-52 rounded-lg skeleton" />;
  if (!data.length) return <p className="text-[13px] text-muted-foreground text-center py-8">No expense data</p>;

  const top10 = data.slice(0, 10);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={top10} layout="vertical" margin={{ left: 8, right: 8, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickFormatter={(v) => formatINR(v)}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          dataKey="category_name"
          type="category"
          width={110}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
          formatter={(v) => [formatINR(Number(v)), "Spend"]}
        />
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
        <XAxis
          dataKey="period"
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickFormatter={(v) => formatINR(v)}
          axisLine={false}
          tickLine={false}
          width={64}
        />
        <Tooltip
          contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
          formatter={(v) => [formatINR(Number(v)), "Expenses"]}
        />
        <Line dataKey="total_inr" stroke="#f59e0b" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Top Vendors Table ─────────────────────────────────────────────────────────

function TopVendorsTable({ start, end }: { start: string; end: string }) {
  const { data = [], isLoading } = useTopVendors(start, end);
  const [sort, toggle] = useSortState("total_inr");
  const rows = sortRows(data, sort);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px] font-semibold text-foreground">Top Vendors</p>
        <button
          onClick={() => exportCsv(rows as unknown as Record<string, unknown>[], "top-vendors")}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <Download className="h-3 w-3" /> CSV
        </button>
      </div>
      {isLoading ? (
        <div className="h-40 rounded-lg skeleton" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border">
                <SortTh col="vendor"            label="Vendor"  sort={sort} toggle={toggle} />
                <SortTh col="total_inr"         label="Spend"   sort={sort} toggle={toggle} className="text-right" />
                <SortTh col="transaction_count" label="Txns"    sort={sort} toggle={toggle} className="text-right" />
                <SortTh col="last_expense_date" label="Last"    sort={sort} toggle={toggle} />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No data</td></tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={i} className="border-b border-border/30 hover:bg-accent/30">
                    <td className="px-3 py-2 font-medium text-foreground">{r.vendor}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatINR(r.total_inr)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.transaction_count}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.last_expense_date}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Top Heads Table ───────────────────────────────────────────────────────────

function TopHeadsTable({ start, end }: { start: string; end: string }) {
  const { data = [], isLoading } = useExpenseByCategory(start, end);
  const [sort, toggle] = useSortState("total_inr");
  const rows = sortRows(data, sort);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px] font-semibold text-foreground">Expense Heads</p>
        <button
          onClick={() => exportCsv(rows as unknown as Record<string, unknown>[], "expense-heads")}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <Download className="h-3 w-3" /> CSV
        </button>
      </div>
      {isLoading ? (
        <div className="h-40 rounded-lg skeleton" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border">
                <SortTh col="category_name"     label="Category" sort={sort} toggle={toggle} />
                <SortTh col="total_inr"         label="Spend"    sort={sort} toggle={toggle} className="text-right" />
                <SortTh col="pct_of_total"      label="% of Total" sort={sort} toggle={toggle} className="text-right" />
                <SortTh col="transaction_count" label="Txns"     sort={sort} toggle={toggle} className="text-right" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No data</td></tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={i} className="border-b border-border/30 hover:bg-accent/30">
                    <td className="px-3 py-2 font-medium text-foreground">{r.category_name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatINR(r.total_inr)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.pct_of_total}%</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.transaction_count}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Expense List Table ────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  approved: "bg-emerald-500/10 text-emerald-400",
  rejected: "bg-red-500/10 text-red-400",
  draft:    "bg-muted text-muted-foreground",
};

function ExpenseListTable({
  start, end,
}: {
  start: string; end: string;
}) {
  const { data: categories = [] } = useExpenseCategories();
  const [filterCat, setFilterCat] = useState<number | null>(null);
  const [filterVendor, setFilterVendor] = useState("");
  const [sort, toggle] = useSortState("expense_date");

  const { data = [], isLoading } = useExpenseList(start, end, filterCat, filterVendor || null);

  const sorted = useMemo(() => sortRows(data, sort), [data, sort]);

  return (
    <div>
      {/* Filters + Export */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select
          value={filterCat ?? ""}
          onChange={(e) => setFilterCat(e.target.value ? Number(e.target.value) : null)}
          className="h-8 px-2.5 rounded-md border border-border bg-card text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Filter vendor..."
          value={filterVendor}
          onChange={(e) => setFilterVendor(e.target.value)}
          className="h-8 px-2.5 rounded-md border border-border bg-card text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet-500 w-40"
        />
        <div className="ml-auto">
          <button
            onClick={() => exportCsv(sorted as unknown as Record<string, unknown>[], "expenses")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent border border-border transition-colors"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="h-52 rounded-lg skeleton" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border">
                <SortTh col="expense_date"   label="Date"        sort={sort} toggle={toggle} />
                <SortTh col="category_name"  label="Category"    sort={sort} toggle={toggle} />
                <SortTh col="description"    label="Description" sort={sort} toggle={toggle} />
                <SortTh col="vendor"         label="Vendor"      sort={sort} toggle={toggle} />
                <SortTh col="amount_inr"     label="Amount"      sort={sort} toggle={toggle} className="text-right" />
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr><td colSpan={6} className="py-10 text-center text-muted-foreground">No expenses found</td></tr>
              ) : (
                sorted.map((r: ExpenseListItem) => (
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
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground text-right">{sorted.length} records</p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ExpensesPage() {
  const [period, setPeriod] = useState<Period | "mtd">("30d");
  const range = period === "mtd" ? getMtdRange() : getPeriodDates(period as Period);

  return (
    <div className="min-h-full p-4 sm:p-6 space-y-6">
      <PageHeader title="Expense Master" subtitle={range.label}>
        <PeriodTabs value={period} options={PERIODS} onChange={(k) => setPeriod(k as Period | "mtd")} />
      </PageHeader>

      <ExpenseKpiRow start={range.start} end={range.end} />

      {/* Charts */}
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

      {/* Vendor + Head tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <TopVendorsTable start={range.start} end={range.end} />
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <TopHeadsTable start={range.start} end={range.end} />
        </div>
      </div>

      {/* Full expense list */}
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-[15px] font-semibold text-foreground mb-4">All Expenses</p>
        <ExpenseListTable start={range.start} end={range.end} />
      </div>
    </div>
  );
}
