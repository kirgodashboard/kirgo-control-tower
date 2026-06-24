"use client";

import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  TrendingUp, TrendingDown, AlertCircle, CheckCircle,
  Loader2, ArrowUpRight, ArrowDownLeft, ChevronDown, Tag,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import {
  useBankAccounts, useBankKpis, useBankDailyCashflow,
  useBankCategoryBreakdown, useBankTransactions, useRefreshBankData,
} from "@/lib/hooks/use-bank";
import { formatINR } from "@/lib/utils/format";
import type { BankTransaction } from "@/types/bank";

const PIE_COLORS = [
  "#8b5cf6","#06b6d4","#10b981","#f59e0b","#ef4444",
  "#ec4899","#3b82f6","#84cc16","#f97316","#6366f1",
];

type TxTab = "all" | "unclassified" | "classified";

// ─── Account Selector ──────────────────────────────────────────────────────

function AccountSelector({
  accounts,
  selectedId,
  onChange,
}: {
  accounts: { id: number; bank_name: string; account_name: string }[];
  selectedId: number | null;
  onChange: (id: number | null) => void;
}) {
  return (
    <select
      value={selectedId ?? ""}
      onChange={e => onChange(e.target.value === "" ? null : parseInt(e.target.value, 10))}
      className="h-8 px-3 pr-8 rounded-md border border-border bg-card text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500 appearance-none cursor-pointer"
    >
      <option value="">All Accounts</option>
      {accounts.map(a => (
        <option key={a.id} value={a.id}>{a.bank_name} · {a.account_name}</option>
      ))}
    </select>
  );
}

// ─── Daily Cash Flow Chart ─────────────────────────────────────────────────

function CashflowChart({ accountId }: { accountId: number | null }) {
  const { data, isLoading } = useBankDailyCashflow(accountId, 30);

  if (isLoading) return (
    <div className="flex items-center justify-center h-48">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );

  if (!data?.length) return (
    <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
      No data yet — import a bank statement to see cash flow.
    </div>
  );

  const formatted = data.map(r => ({
    day: new Date(r.day).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
    Receipts: r.receipts_inr,
    Payments: r.payments_inr,
  }));

  const fmtK = (v: number) => v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : v >= 1000 ? `₹${(v / 1000).toFixed(0)}K` : `₹${v}`;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={formatted} barSize={6} barCategoryGap="30%">
        <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={fmtK} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={50} />
        <Tooltip
          formatter={(v: unknown) => [formatINR(Number(v)), ""]}
          contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
        />
        <Bar dataKey="Receipts" fill="#10b981" radius={[3, 3, 0, 0]} />
        <Bar dataKey="Payments" fill="#ef4444" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Category Breakdown Chart ──────────────────────────────────────────────

function CategoryChart({ accountId }: { accountId: number | null }) {
  const { data, isLoading } = useBankCategoryBreakdown(accountId);

  if (isLoading) return (
    <div className="flex items-center justify-center h-48">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );

  if (!data?.length) return (
    <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
      No classified transactions yet.
    </div>
  );

  const top = data.slice(0, 8);

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={top}
          dataKey="total_inr"
          nameKey="category_name"
          cx="40%"
          cy="50%"
          outerRadius={80}
          innerRadius={45}
          paddingAngle={2}
        >
          {top.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
        </Pie>
        <Legend
          layout="vertical"
          align="right"
          verticalAlign="middle"
          formatter={(v: string) => <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>{v}</span>}
        />
        <Tooltip
          formatter={(v: unknown) => [formatINR(Number(v)), ""]}
          contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ─── Transaction Row ───────────────────────────────────────────────────────

function TransactionRow({ tx }: { tx: BankTransaction }) {
  const isDebit  = (tx.withdrawal_inr ?? 0) > 0;
  const isCredit = (tx.deposit_inr ?? 0) > 0;
  const amount   = isDebit ? tx.withdrawal_inr! : tx.deposit_inr!;

  return (
    <tr className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
      <td className="px-4 py-2.5 whitespace-nowrap text-[12px] text-muted-foreground tabular-nums">
        {new Date(tx.transaction_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}
      </td>
      <td className="px-3 py-2.5 max-w-[220px]">
        <p className="text-[12px] text-foreground truncate">{tx.narration_raw}</p>
        {tx.counterparty && (
          <p className="text-[10px] text-muted-foreground truncate">{tx.counterparty}</p>
        )}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">
        {isDebit && (
          <span className="flex items-center justify-end gap-1 text-[12px] text-red-400">
            <ArrowDownLeft className="h-3 w-3" />
            {formatINR(amount)}
          </span>
        )}
        {isCredit && (
          <span className="flex items-center justify-end gap-1 text-[12px] text-emerald-400">
            <ArrowUpRight className="h-3 w-3" />
            {formatINR(amount)}
          </span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-[12px] text-muted-foreground">
        {tx.closing_balance_inr != null ? formatINR(tx.closing_balance_inr) : "—"}
      </td>
      <td className="px-3 py-2.5">
        {tx.transaction_type === "unclassified" ? (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-400">
            <Tag className="h-2.5 w-2.5" />
            Unclassified
          </span>
        ) : (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-[10px] text-emerald-400">
            <CheckCircle className="h-2.5 w-2.5" />
            {tx.transaction_type}
          </span>
        )}
      </td>
    </tr>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function BankDashboardPage() {
  const [selectedAccount, setSelectedAccount] = useState<number | null>(null);
  const [txTab, setTxTab] = useState<TxTab>("all");

  const { data: accounts } = useBankAccounts();
  const { data: kpis, isLoading: kpisLoading } = useBankKpis(selectedAccount);
  const { data: transactions } = useBankTransactions(selectedAccount, txTab, 60);
  useRefreshBankData();

  const KpiNum = ({ v, label, sub, color = "text-foreground" }: {
    v: string; label: string; sub?: string; color?: string;
  }) => (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{v}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
    </div>
  );

  const tabCls = (t: TxTab) =>
    `px-3 py-1.5 text-[12px] font-medium rounded-md transition-colors ${
      txTab === t ? "bg-violet-600 text-white" : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="Bank" subtitle="Cash position, transaction feed, and expense classification">
        <AccountSelector
          accounts={accounts ?? []}
          selectedId={selectedAccount}
          onChange={setSelectedAccount}
        />
      </PageHeader>

      {/* KPI row */}
      {kpisLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiNum
            label="Opening Balance"
            v={formatINR(accounts?.find(a => a.id === selectedAccount)?.opening_balance_inr ?? 0)}
          />
          <KpiNum
            label="Closing Balance"
            v={kpis?.latest_balance != null ? formatINR(kpis.latest_balance) : "—"}
            color="text-violet-400"
          />
          <KpiNum
            label="Total Receipts"
            v={formatINR(kpis?.total_receipts ?? 0)}
            color="text-emerald-400"
          />
          <KpiNum
            label="Total Payments"
            v={formatINR(kpis?.total_payments ?? 0)}
            color="text-red-400"
          />
          <KpiNum
            label="Unclassified Debits"
            v={`${kpis?.unclassified_debit_count ?? 0}`}
            sub={
              (kpis?.unclassified_credit_count ?? 0) > 0
                ? `${kpis!.unclassified_credit_count} credits pending reconciliation`
                : (kpis?.unclassified_debit_count ?? 0) > 0
                  ? formatINR(kpis?.unclassified_amount ?? 0)
                  : "all caught up"
            }
            color={
              (kpis?.unclassified_debit_count ?? 0) > 0 ? "text-amber-400" :
              (kpis?.unclassified_credit_count ?? 0) > 0 ? "text-blue-400" :
              "text-emerald-400"
            }
          />
          <KpiNum
            label="Reconciliation"
            v={`${kpis?.reconciliation_pct ?? 0}%`}
            sub={`${kpis?.classified_count ?? 0} / ${kpis?.total_transactions ?? 0} classified`}
            color={(kpis?.reconciliation_pct ?? 0) >= 80 ? "text-emerald-400" : "text-amber-400"}
          />
        </div>
      )}

      {/* Charts row */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-4">
            Daily Cash Flow · 30 Days
          </p>
          <CashflowChart accountId={selectedAccount} />
          <div className="flex items-center gap-4 mt-2 justify-center">
            <span className="flex items-center gap-1.5 text-[11px] text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />Receipts
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-red-400">
              <span className="h-2 w-2 rounded-full bg-red-400" />Payments
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-4">
            Expense Category Breakdown
          </p>
          <CategoryChart accountId={selectedAccount} />
        </div>
      </div>

      {/* Transactions table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <p className="text-[13px] font-semibold text-foreground">Transactions</p>
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
            <button className={tabCls("all")}          onClick={() => setTxTab("all")}>All</button>
            <button className={tabCls("unclassified")} onClick={() => setTxTab("unclassified")}>
              Unclassified
              {(kpis?.unclassified_debit_count ?? 0) > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-amber-500/20 text-amber-400 rounded-full">
                  {kpis!.unclassified_debit_count}
                </span>
              )}
            </button>
            <button className={tabCls("classified")}   onClick={() => setTxTab("classified")}>Classified</button>
          </div>
        </div>

        {!transactions?.length ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {txTab === "unclassified"
                ? "No unclassified transactions — you're all caught up!"
                : "No transactions yet. Import a bank statement from Settings → Bank Feeds."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Date</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Narration</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Amount</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Balance</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(tx => (
                  <TransactionRow key={tx.id} tx={tx} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
