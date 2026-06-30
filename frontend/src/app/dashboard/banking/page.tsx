"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Building2, TrendingUp, TrendingDown, AlertCircle, CheckCircle,
  ArrowRight, Percent,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import {
  useBankAccounts, useBankKpis, useBankDailyCashflow, useBankCategoryBreakdown,
} from "@/lib/hooks/use-bank";
import { formatINR } from "@/lib/utils/format";
import { getPeriodDates } from "@/lib/utils/date-ranges";
import { cn } from "@/lib/utils";
import type { Period } from "@/types/chart";

const PERIODS = [
  { label: "30 Days", value: "30d", days: 30  },
  { label: "90 Days", value: "90d", days: 90  },
  { label: "6 Months", value: "6m",  days: 180 },
  { label: "1 Year",   value: "1y",  days: 365 },
];

const PIE_COLORS = [
  "#8b5cf6","#06b6d4","#10b981","#f59e0b","#ef4444",
  "#ec4899","#3b82f6","#84cc16","#f97316","#6366f1",
];

type PeriodValue = "30d" | "90d" | "6m" | "1y";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TooltipShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-xl text-[12px] space-y-1">
      {children}
    </div>
  );
}

export default function BankingDashboardPage() {
  const [period, setPeriod] = useState<PeriodValue>("30d");
  const [accountId, setAccountId] = useState<number | null>(null);

  const { data: accounts = [] } = useBankAccounts();
  const dr    = getPeriodDates(period as Period);
  const days  = PERIODS.find(p => p.value === period)?.days ?? 30;

  const { data: kpis,       isLoading: kpisLoad } = useBankKpis(accountId, dr.start, dr.end);
  const { data: cashflow = []  }                  = useBankDailyCashflow(accountId, days);
  const { data: categories = [] }                 = useBankCategoryBreakdown(accountId);

  const visibleAccounts = accountId === null
    ? accounts
    : accounts.filter(a => a.id === accountId);

  const totalBalance = visibleAccounts.reduce((s, a) => s + (a.closing_balance_inr ?? 0), 0);

  const selectCls = "h-8 px-2 rounded-md border border-border bg-card text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500";

  return (
    <div className="min-h-full p-4 sm:p-6 space-y-5">
      <PageHeader title="Banking" subtitle="Account balances, cashflow summary and reconciliation status">
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={accountId ?? ""}
            onChange={e => setAccountId(e.target.value === "" ? null : parseInt(e.target.value, 10))}
            className={selectCls}
          >
            <option value="">All Accounts</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.bank_name} · {a.account_name}</option>
            ))}
          </select>

          <div className="flex rounded-md border border-border overflow-hidden">
            {PERIODS.map(p => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value as PeriodValue)}
                className={cn(
                  "px-3 py-1.5 text-[11px] font-medium transition-colors",
                  period === p.value
                    ? "bg-violet-500/20 text-violet-400"
                    : "bg-card text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          <Link
            href="/dashboard/bank"
            className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            Bank Register <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </PageHeader>

      {/* ── KPI strip ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          label="Current Balance"
          value={formatINR(totalBalance)}
          icon={<Building2 className="h-3.5 w-3.5" />}
          alert={totalBalance < 0 ? "red" : totalBalance < 50_000 ? "amber" : undefined}
        />
        <KpiCard
          label="Total Inflow"
          value={kpisLoad ? undefined : formatINR(kpis?.total_receipts ?? 0)}
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          subValue={dr.label}
        />
        <KpiCard
          label="Total Outflow"
          value={kpisLoad ? undefined : formatINR(kpis?.total_payments ?? 0)}
          icon={<TrendingDown className="h-3.5 w-3.5" />}
          subValue={dr.label}
        />
        <KpiCard
          label="Net Flow"
          value={kpisLoad ? undefined : formatINR(kpis?.net_flow ?? 0)}
          alert={(kpis?.net_flow ?? 0) < 0 ? "amber" : undefined}
        />
        <KpiCard
          label="Unclassified"
          value={kpisLoad ? undefined : String(kpis?.unclassified_count ?? 0)}
          icon={<AlertCircle className="h-3.5 w-3.5" />}
          subValue="transactions"
          alert={
            (kpis?.unclassified_count ?? 0) > 50 ? "red"   :
            (kpis?.unclassified_count ?? 0) > 0  ? "amber" :
            kpis !== undefined                   ? "green" : undefined
          }
        />
        <KpiCard
          label="Reconciled"
          value={kpisLoad ? undefined : `${kpis?.reconciliation_pct?.toFixed(1) ?? "—"}%`}
          icon={<Percent className="h-3.5 w-3.5" />}
          alert={
            (kpis?.reconciliation_pct ?? 100) < 80 ? "red"   :
            (kpis?.reconciliation_pct ?? 100) < 95 ? "amber" :
            kpis !== undefined                     ? "green" : undefined
          }
        />
      </div>

      {/* ── Account cards ─────────────────────────────────────────────── */}
      {visibleAccounts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visibleAccounts.map(a => (
            <div key={a.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-[13px] font-semibold text-foreground">{a.bank_name}</p>
                  <p className="text-[11px] text-muted-foreground">{a.account_name}</p>
                  {a.account_number_masked && (
                    <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{a.account_number_masked}</p>
                  )}
                </div>
                {a.unclassified_count > 0 ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/20">
                    {a.unclassified_count} pending
                  </span>
                ) : (
                  <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                )}
              </div>
              <p className="text-xl font-bold tabular-nums text-foreground">
                {formatINR(a.closing_balance_inr ?? 0)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {a.latest_date ? `Balance as of ${a.latest_date}` : "Current balance"} · {a.transaction_count} txns
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ── Charts ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Daily cashflow */}
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-4">
            Daily Cashflow — {dr.label}
          </p>
          {cashflow.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-[12px] text-muted-foreground">
              No cashflow data for this period
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={cashflow} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barGap={2}>
                <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="day"
                  tickFormatter={(v: string) => new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false} tickLine={false} tickMargin={6}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickFormatter={(v: number) => formatINR(v)}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false} tickLine={false} width={56}
                />
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  content={({ active, payload, label }: any) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <TooltipShell>
                        <p className="text-muted-foreground mb-1">
                          {new Date(label ?? "").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </p>
                        {payload.map((p: { name: string; value: number; fill: string }) => (
                          <p key={p.name} className="tabular-nums" style={{ color: p.fill }}>
                            {p.name === "receipts_inr" ? "Inflow" : "Outflow"}: {formatINR(p.value)}
                          </p>
                        ))}
                      </TooltipShell>
                    );
                  }}
                />
                <Bar dataKey="receipts_inr" fill="hsl(142 71% 45%)" radius={[2, 2, 0, 0]} name="receipts_inr" />
                <Bar dataKey="payments_inr" fill="hsl(0 72% 51%)"   radius={[2, 2, 0, 0]} name="payments_inr" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Category breakdown */}
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-4">
            Outflow by Category
          </p>
          {categories.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-[12px] text-muted-foreground">
              No category data — classify transactions in Bank Register
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={categories}
                  dataKey="total_inr"
                  nameKey="category_name"
                  cx="40%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={42}
                >
                  {categories.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  content={({ active, payload }: any) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]?.payload as { category_name: string; total_inr: number; pct_of_total: number };
                    return (
                      <TooltipShell>
                        <p className="font-medium text-foreground">{d.category_name}</p>
                        <p className="text-muted-foreground">
                          {formatINR(d.total_inr)} · {d.pct_of_total?.toFixed(1)}%
                        </p>
                      </TooltipShell>
                    );
                  }}
                />
                <Legend
                  layout="vertical" align="right" verticalAlign="middle"
                  formatter={(value: string) => (
                    <span className="text-[11px] text-muted-foreground">{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Classify nudge ────────────────────────────────────────────── */}
      {!kpisLoad && (kpis?.unclassified_count ?? 0) > 0 && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-4 flex items-center justify-between gap-4">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-[13px] font-semibold text-foreground">
                {kpis?.unclassified_count} transactions need classification
              </p>
              <p className="text-[12px] text-muted-foreground mt-0.5">
                Worth {formatINR(kpis?.unclassified_amount ?? 0)} — open the Bank Register to classify or reconcile each entry.
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/bank"
            className="flex items-center gap-1.5 h-8 px-4 rounded-md bg-amber-400/10 border border-amber-400/20 text-[12px] text-amber-400 hover:bg-amber-400/20 transition-colors whitespace-nowrap flex-shrink-0"
          >
            Classify Now <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}
    </div>
  );
}
