"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  TrendingUp, TrendingDown, AlertCircle, CheckCircle,
  Loader2, ArrowUpRight, ArrowDownLeft, ChevronDown, ChevronUp,
  Tag, CreditCard, RefreshCw, Plus,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import {
  useBankAccounts, useBankKpis, useBankDailyCashflow,
  useBankCategoryBreakdown, useBankTransactions, useRefreshBankData,
} from "@/lib/hooks/use-bank";
import {
  useUnclassifiedTransactions,
  useExpenseCategories,
  useInsertExpenseCategory,
  useReconcileBankCredit,
  useBankCreditTypes,
  useAddBankCreditType,
} from "@/lib/hooks/use-expenses";
import { classifyBankTransaction } from "@/lib/data/expenses";
import { formatINR } from "@/lib/utils/format";
import type { BankTransaction } from "@/types/bank";
import type { UnclassifiedTransaction, ExpenseCategory } from "@/types/kpi";

const PIE_COLORS = [
  "#8b5cf6","#06b6d4","#10b981","#f59e0b","#ef4444",
  "#ec4899","#3b82f6","#84cc16","#f97316","#6366f1",
];

const CATEGORY_GROUPS = ["Operating", "Finance", "Capital", "Other"];

const CREDIT_TYPES = [
  { value: "gateway_settlement", label: "Gateway Settlement (Razorpay/CCAvenue)" },
  { value: "gokwik_settlement",  label: "GoKwik Settlement" },
  { value: "cod_remittance",     label: "COD Remittance (Shiprocket)" },
  { value: "founder_transfer",   label: "Founder / Investor Transfer" },
  { value: "advance_received",   label: "Advance / Loan Received" },
  { value: "customer_refund",    label: "Customer Refund Received" },
  { value: "bank_interest",      label: "Bank Interest / FD Returns" },
  { value: "tax_refund",         label: "GST / Tax Refund" },
  { value: "miscellaneous",      label: "Other / Miscellaneous Income" },
];

type TxTab = "all" | "unclassified" | "classified" | "classify";

// ─── Account Selector ──────────────────────────────────────────────────────

function AccountSelector({
  accounts, selectedId, onChange,
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
        <Pie data={top} dataKey="total_inr" nameKey="category_name" cx="40%" cy="50%" outerRadius={80} innerRadius={45} paddingAngle={2}>
          {top.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
        </Pie>
        <Legend
          layout="vertical" align="right" verticalAlign="middle"
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
        {tx.counterparty && <p className="text-[10px] text-muted-foreground truncate">{tx.counterparty}</p>}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">
        {isDebit && (
          <span className="flex items-center justify-end gap-1 text-[12px] text-red-400">
            <ArrowDownLeft className="h-3 w-3" />{formatINR(amount)}
          </span>
        )}
        {isCredit && (
          <span className="flex items-center justify-end gap-1 text-[12px] text-emerald-400">
            <ArrowUpRight className="h-3 w-3" />{formatINR(amount)}
          </span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-[12px] text-muted-foreground">
        {tx.closing_balance_inr != null ? formatINR(tx.closing_balance_inr) : "—"}
      </td>
      <td className="px-3 py-2.5">
        {tx.transaction_type === "unclassified" ? (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-400">
            <Tag className="h-2.5 w-2.5" />Unclassified
          </span>
        ) : (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-[10px] text-emerald-400">
            <CheckCircle className="h-2.5 w-2.5" />{tx.transaction_type}
          </span>
        )}
      </td>
    </tr>
  );
}

// ─── Classification Panel (Manage Categories) ──────────────────────────────

function ManageCategoriesPanel({ categories }: { categories: ExpenseCategory[] }) {
  const [open, setOpen]   = useState(false);
  const [name, setName]   = useState("");
  const [group, setGroup] = useState("Operating");
  const [success, setSuccess] = useState("");
  const { mutate, isPending, error } = useInsertExpenseCategory();

  const handleAdd = () => {
    if (!name.trim()) return;
    mutate({ name: name.trim(), group }, {
      onSuccess: () => {
        setSuccess(`"${name.trim()}" added`);
        setName("");
        setTimeout(() => setSuccess(""), 2500);
      },
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-accent/30 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Tag className="h-4 w-4 text-violet-400" />
          <span className="text-[13px] font-semibold text-foreground">Manage Expense Categories</span>
          <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{categories.length}</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="border-t border-border px-5 py-4 space-y-4">
          <div className="flex items-end gap-2 flex-wrap">
            <div className="flex-1 min-w-[160px]">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">Category Name</label>
              <input
                type="text" value={name} onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAdd()}
                placeholder="e.g. Delivery Charges"
                className="h-8 w-full px-3 rounded-md border border-border bg-background text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">Group</label>
              <select
                value={group} onChange={e => setGroup(e.target.value)}
                className="h-8 px-2 rounded-md border border-border bg-background text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500"
              >
                {CATEGORY_GROUPS.map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
            <button
              onClick={handleAdd} disabled={isPending || !name.trim()}
              className="h-8 px-3 flex items-center gap-1.5 rounded-md bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-[12px] font-semibold transition-colors"
            >
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add
            </button>
            {success && <span className="text-[12px] text-emerald-400 flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5" />{success}</span>}
            {error && <span className="text-[12px] text-red-400">{(error as Error).message}</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map(c => (
              <span key={c.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-muted text-[11px] font-medium text-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400 flex-shrink-0" />
                {c.name}<span className="text-muted-foreground/60">· {c.category_group}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Debit Row ─────────────────────────────────────────────────────────────

interface DebitRowState { categoryId: string; vendor: string; saving: boolean; done: boolean; error: string | null; }

function DebitRow({
  tx, state, categories, onChange, onClassify,
}: {
  tx: UnclassifiedTransaction; state: DebitRowState;
  categories: { id: number; name: string }[];
  onChange: (field: "categoryId" | "vendor", value: string) => void;
  onClassify: () => void;
}) {
  if (state.done) {
    return (
      <tr className="border-b border-border/30 opacity-50">
        <td className="px-3 py-2 text-muted-foreground text-[12px]">{tx.transaction_date}</td>
        <td className="px-3 py-2 text-[12px] text-muted-foreground max-w-[200px] truncate" title={tx.narration_raw}>{tx.narration_raw}</td>
        <td className="px-3 py-2 text-right text-[12px] tabular-nums font-medium text-red-400">
          <span className="flex items-center justify-end gap-1"><ArrowDownLeft className="h-3 w-3" />{formatINR(tx.amount_inr)}</span>
        </td>
        <td colSpan={3} className="px-3 py-2">
          <span className="flex items-center gap-1.5 text-[12px] text-emerald-400"><CheckCircle className="h-3.5 w-3.5" /> Classified</span>
        </td>
      </tr>
    );
  }
  return (
    <tr className="border-b border-border/30 hover:bg-accent/20">
      <td className="px-3 py-2 text-[12px] text-muted-foreground whitespace-nowrap">{tx.transaction_date}</td>
      <td className="px-3 py-2 text-[12px] text-foreground max-w-[200px]">
        <span className="truncate block" title={tx.narration_raw}>{tx.narration_raw}</span>
        {tx.counterparty && <span className="text-[11px] text-muted-foreground">{tx.counterparty}</span>}
      </td>
      <td className="px-3 py-2 text-right text-[12px] tabular-nums font-semibold text-red-400 whitespace-nowrap">
        <span className="flex items-center justify-end gap-1"><ArrowDownLeft className="h-3 w-3" />{formatINR(tx.amount_inr)}</span>
      </td>
      <td className="px-3 py-2">
        <select
          value={state.categoryId} onChange={e => onChange("categoryId", e.target.value)}
          className="h-7 px-2 rounded-md border border-border bg-background text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500 w-40"
        >
          <option value="">Select category…</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </td>
      <td className="px-3 py-2">
        <input
          type="text" value={state.vendor} onChange={e => onChange("vendor", e.target.value)}
          placeholder="Vendor (optional)"
          className="h-7 px-2 rounded-md border border-border bg-background text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet-500 w-32"
        />
      </td>
      <td className="px-3 py-2">
        {state.error && <span className="text-[10px] text-red-400 block mb-1">{state.error}</span>}
        <button
          onClick={onClassify} disabled={state.saving || !state.categoryId}
          className="h-7 px-3 rounded-md bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {state.saving ? "Saving…" : "Classify"}
        </button>
      </td>
    </tr>
  );
}

// ─── Credit Row ────────────────────────────────────────────────────────────

interface CreditRowState { type: string; saving: boolean; done: boolean; error: string | null; }
interface CreditTypeOption { value: string; label: string; }

function CreditRow({
  tx, state, creditTypes, onChange, onReconcile,
}: {
  tx: UnclassifiedTransaction; state: CreditRowState;
  creditTypes: CreditTypeOption[];
  onChange: (type: string) => void; onReconcile: () => void;
}) {
  if (state.done) {
    return (
      <tr className="border-b border-border/30 opacity-50">
        <td className="px-3 py-2 text-muted-foreground text-[12px]">{tx.transaction_date}</td>
        <td className="px-3 py-2 text-[12px] text-muted-foreground max-w-[200px] truncate" title={tx.narration_raw}>{tx.narration_raw}</td>
        <td className="px-3 py-2 text-right text-[12px] tabular-nums font-medium text-emerald-400">
          <span className="flex items-center justify-end gap-1"><ArrowUpRight className="h-3 w-3" />{formatINR(tx.amount_inr)}</span>
        </td>
        <td colSpan={2} className="px-3 py-2">
          <span className="flex items-center gap-1.5 text-[12px] text-emerald-400"><CheckCircle className="h-3.5 w-3.5" /> Reconciled</span>
        </td>
      </tr>
    );
  }
  return (
    <tr className="border-b border-border/30 hover:bg-accent/20">
      <td className="px-3 py-2 text-[12px] text-muted-foreground whitespace-nowrap">{tx.transaction_date}</td>
      <td className="px-3 py-2 text-[12px] text-foreground max-w-[200px]">
        <span className="truncate block" title={tx.narration_raw}>{tx.narration_raw}</span>
        {tx.counterparty && <span className="text-[11px] text-muted-foreground">{tx.counterparty}</span>}
      </td>
      <td className="px-3 py-2 text-right text-[12px] tabular-nums font-semibold text-emerald-400 whitespace-nowrap">
        <span className="flex items-center justify-end gap-1"><ArrowUpRight className="h-3 w-3" />{formatINR(tx.amount_inr)}</span>
      </td>
      <td className="px-3 py-2">
        <select
          value={state.type} onChange={e => onChange(e.target.value)}
          className="h-7 px-2 rounded-md border border-border bg-background text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500 w-56"
        >
          <option value="">Identify receipt type…</option>
          {creditTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </td>
      <td className="px-3 py-2">
        {state.error && <span className="text-[10px] text-red-400 block mb-1">{state.error}</span>}
        <button
          onClick={onReconcile} disabled={state.saving || !state.type}
          className="h-7 px-3 rounded-md bg-emerald-700 hover:bg-emerald-600 text-white text-[11px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {state.saving ? "Saving…" : "Reconcile"}
        </button>
      </td>
    </tr>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function BankDashboardPage() {
  const queryClient = useQueryClient();
  const [selectedAccount, setSelectedAccount] = useState<number | null>(null);
  const [txTab, setTxTab] = useState<TxTab>("all");

  // Bank overview data
  const { data: accounts } = useBankAccounts();
  const { data: kpis, isLoading: kpisLoading } = useBankKpis(selectedAccount);
  const { data: bankTxns } = useBankTransactions(selectedAccount, txTab === "classify" ? "all" : txTab, 60);
  useRefreshBankData();

  // Classification data
  const { data: unclassifiedTxns = [], isLoading: uTxLoading, isFetching: uFetching, refetch: uRefetch } = useUnclassifiedTransactions();
  const { data: expenseCategories = [], isLoading: catLoading } = useExpenseCategories();
  const { data: creditTypes = [] } = useBankCreditTypes();
  const { mutateAsync: addCreditType } = useAddBankCreditType();
  const { mutateAsync: reconcile } = useReconcileBankCredit();

  // Add credit type inline form state
  const [showAddCreditType, setShowAddCreditType] = useState(false);
  const [newTypeLabel, setNewTypeLabel] = useState("");
  const [addingType, setAddingType] = useState(false);

  const unclassDebits  = unclassifiedTxns.filter(t => t.tx_direction === "debit");
  const unclassCredits = unclassifiedTxns.filter(t => t.tx_direction === "credit");

  const [debitStates, setDebitStates] = useState<Record<number, DebitRowState>>({});
  const getDebitState = (id: number) => debitStates[id] ?? { categoryId: "", vendor: "", saving: false, done: false, error: null };
  const updateDebit = (id: number, patch: Partial<DebitRowState>) =>
    setDebitStates(prev => ({ ...prev, [id]: { ...getDebitState(id), ...patch } }));

  const [creditStates, setCreditStates] = useState<Record<number, CreditRowState>>({});
  const getCreditState = (id: number): CreditRowState => creditStates[id] ?? { type: "", saving: false, done: false, error: null };
  const updateCredit = (id: number, patch: Partial<CreditRowState>) =>
    setCreditStates(prev => ({ ...prev, [id]: { ...getCreditState(id), ...patch } }));

  const handleClassifyDebit = async (tx: UnclassifiedTransaction) => {
    const s = getDebitState(tx.id);
    if (!s.categoryId) return;
    updateDebit(tx.id, { saving: true, error: null });
    try {
      await classifyBankTransaction({ transactionId: tx.id, categoryId: Number(s.categoryId), vendor: s.vendor || undefined });
      updateDebit(tx.id, { saving: false, done: true });
      queryClient.invalidateQueries({ queryKey: ["expense-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["expense-list"] });
      queryClient.invalidateQueries({ queryKey: ["bank-kpis"] });
    } catch (err) {
      updateDebit(tx.id, { saving: false, error: err instanceof Error ? err.message : "Failed" });
    }
  };

  const handleReconcileCredit = async (tx: UnclassifiedTransaction) => {
    const s = getCreditState(tx.id);
    if (!s.type) return;
    updateCredit(tx.id, { saving: true, error: null });
    try {
      await reconcile({ id: tx.id, type: s.type });
      updateCredit(tx.id, { saving: false, done: true });
    } catch (err) {
      updateCredit(tx.id, { saving: false, error: err instanceof Error ? err.message : "Failed" });
    }
  };

  const doneCount = Object.values(debitStates).filter(s => s.done).length
                  + Object.values(creditStates).filter(s => s.done).length;
  const pendingDebits  = unclassDebits.filter(t => !getDebitState(t.id).done).length;
  const pendingCredits = unclassCredits.filter(t => !getCreditState(t.id).done).length;

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
      <PageHeader title="Bank" subtitle="Cash position, transactions, and classification">
        <AccountSelector accounts={accounts ?? []} selectedId={selectedAccount} onChange={setSelectedAccount} />
      </PageHeader>

      {/* KPI row */}
      {kpisLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiNum label="Opening Balance" v={formatINR(accounts?.find(a => a.id === selectedAccount)?.opening_balance_inr ?? 0)} />
          <KpiNum label="Closing Balance" v={kpis?.latest_balance != null ? formatINR(kpis.latest_balance) : "—"} color="text-violet-400" />
          <KpiNum label="Total Receipts" v={formatINR(kpis?.total_receipts ?? 0)} color="text-emerald-400" />
          <KpiNum label="Total Payments" v={formatINR(kpis?.total_payments ?? 0)} color="text-red-400" />
          <KpiNum
            label="Unclassified Debits"
            v={`${kpis?.unclassified_debit_count ?? 0}`}
            sub={(kpis?.unclassified_credit_count ?? 0) > 0 ? `${kpis!.unclassified_credit_count} credits pending` : (kpis?.unclassified_debit_count ?? 0) > 0 ? formatINR(kpis?.unclassified_amount ?? 0) : "all caught up"}
            color={(kpis?.unclassified_debit_count ?? 0) > 0 ? "text-amber-400" : (kpis?.unclassified_credit_count ?? 0) > 0 ? "text-blue-400" : "text-emerald-400"}
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
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-4">Daily Cash Flow · 30 Days</p>
          <CashflowChart accountId={selectedAccount} />
          <div className="flex items-center gap-4 mt-2 justify-center">
            <span className="flex items-center gap-1.5 text-[11px] text-emerald-400"><span className="h-2 w-2 rounded-full bg-emerald-400" />Receipts</span>
            <span className="flex items-center gap-1.5 text-[11px] text-red-400"><span className="h-2 w-2 rounded-full bg-red-400" />Payments</span>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-4">Expense Category Breakdown</p>
          <CategoryChart accountId={selectedAccount} />
        </div>
      </div>

      {/* Transactions / Classify panel */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <p className="text-[13px] font-semibold text-foreground">
            {txTab === "classify" ? "Classify Transactions" : "Transactions"}
          </p>
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
            <button className={tabCls("all")} onClick={() => setTxTab("all")}>All</button>
            <button className={tabCls("unclassified")} onClick={() => setTxTab("unclassified")}>
              Unclassified
              {(kpis?.unclassified_debit_count ?? 0) > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-amber-500/20 text-amber-400 rounded-full">
                  {kpis!.unclassified_debit_count}
                </span>
              )}
            </button>
            <button className={tabCls("classified")} onClick={() => setTxTab("classified")}>Classified</button>
            <button className={tabCls("classify")} onClick={() => setTxTab("classify")}>
              <span className="flex items-center gap-1.5">
                <CreditCard className="h-3 w-3" />Classify
                {(pendingDebits + pendingCredits) > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] bg-violet-500/20 text-violet-400 rounded-full">
                    {pendingDebits + pendingCredits}
                  </span>
                )}
              </span>
            </button>
          </div>
        </div>

        {/* Classify tab content */}
        {txTab === "classify" ? (
          <div className="p-4 sm:p-5 space-y-5">
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 flex items-center justify-center rounded-lg bg-amber-500/10">
                    <ArrowDownLeft className="h-5 w-5 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-[20px] font-bold text-foreground tabular-nums">{pendingDebits}</p>
                    <p className="text-[12px] text-muted-foreground">unclassified debits</p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 flex items-center justify-center rounded-lg bg-blue-500/10">
                    <ArrowUpRight className="h-5 w-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-[20px] font-bold text-foreground tabular-nums">{pendingCredits}</p>
                    <p className="text-[12px] text-muted-foreground">credits pending reconciliation</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Refresh + done count */}
            <div className="flex items-center gap-3">
              {doneCount > 0 && (
                <span className="flex items-center gap-1.5 text-[12px] text-emerald-400 font-medium">
                  <CheckCircle className="h-3.5 w-3.5" /> {doneCount} resolved this session
                </span>
              )}
              <button
                onClick={() => uRefetch()} disabled={uFetching}
                className="ml-auto flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${uFetching ? "animate-spin" : ""}`} />
                {uFetching ? "Refreshing…" : "Refresh"}
              </button>
            </div>

            <ManageCategoriesPanel categories={expenseCategories} />

            {/* Unclassified Debits */}
            <div className="rounded-xl border border-border bg-card">
              <div className="px-5 py-3 border-b border-border flex items-center gap-2">
                <ArrowDownLeft className="h-4 w-4 text-amber-400" />
                <p className="text-[13px] font-semibold text-foreground">Unclassified Debits</p>
                <span className="ml-auto text-[11px] text-muted-foreground">Classify each debit as an expense category</span>
              </div>
              {uTxLoading || catLoading ? (
                <div className="h-32 m-4 rounded-lg skeleton" />
              ) : unclassDebits.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <CheckCircle className="h-7 w-7 text-emerald-400 mb-2" />
                  <p className="text-[14px] font-semibold text-foreground">No unclassified debits</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">All bank withdrawals have been classified.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Date</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Narration</th>
                        <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Amount</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Category</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Vendor</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unclassDebits.map(tx => (
                        <DebitRow
                          key={tx.id} tx={tx} state={getDebitState(tx.id)} categories={expenseCategories}
                          onChange={(field, value) => updateDebit(tx.id, { [field]: value })}
                          onClassify={() => handleClassifyDebit(tx)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Unidentified Credits */}
            <div className="rounded-xl border border-border bg-card">
              <div className="px-5 py-3 border-b border-border flex items-center gap-2 flex-wrap">
                <ArrowUpRight className="h-4 w-4 text-blue-400" />
                <p className="text-[13px] font-semibold text-foreground">Unidentified Credits</p>
                <span className="text-[11px] text-muted-foreground">Identify what each incoming receipt is</span>
                <button
                  onClick={() => setShowAddCreditType(v => !v)}
                  className="ml-auto inline-flex items-center gap-1 text-[11px] text-violet-400 hover:text-violet-300 transition-colors"
                >
                  <Plus className="h-3 w-3" /> Add receipt type
                </button>
              </div>
              {showAddCreditType && (
                <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
                  <input
                    value={newTypeLabel}
                    onChange={e => setNewTypeLabel(e.target.value)}
                    placeholder="e.g. B2B Invoice Payment"
                    className="h-7 px-2 rounded-md border border-border bg-background text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500 flex-1"
                  />
                  <button
                    disabled={!newTypeLabel.trim() || addingType}
                    onClick={async () => {
                      if (!newTypeLabel.trim()) return;
                      setAddingType(true);
                      try {
                        await addCreditType({ value: newTypeLabel.trim(), label: newTypeLabel.trim() });
                        setNewTypeLabel("");
                        setShowAddCreditType(false);
                      } finally { setAddingType(false); }
                    }}
                    className="h-7 px-3 rounded-md bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-medium transition-colors disabled:opacity-50"
                  >
                    {addingType ? "Saving…" : "Add"}
                  </button>
                  <button onClick={() => setShowAddCreditType(false)} className="text-muted-foreground hover:text-foreground text-[11px]">Cancel</button>
                </div>
              )}
              {uTxLoading ? (
                <div className="h-32 m-4 rounded-lg skeleton" />
              ) : unclassCredits.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <CheckCircle className="h-7 w-7 text-emerald-400 mb-2" />
                  <p className="text-[14px] font-semibold text-foreground">No unidentified credits</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">All incoming receipts have been reconciled.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Date</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Narration</th>
                        <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Amount</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Receipt Type</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unclassCredits.map(tx => (
                        <CreditRow
                          key={tx.id} tx={tx} state={getCreditState(tx.id)}
                          creditTypes={creditTypes}
                          onChange={type => updateCredit(tx.id, { type })}
                          onReconcile={() => handleReconcileCredit(tx)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Transaction feed (All / Unclassified / Classified tabs) */
          !bankTxns?.length ? (
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
                  {bankTxns.map(tx => <TransactionRow key={tx.id} tx={tx} />)}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
}
