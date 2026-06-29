"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle, AlertCircle, CreditCard, RefreshCw,
  Plus, ChevronDown, ChevronUp, Tag, Loader2,
  ArrowDownLeft, ArrowUpRight,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import {
  useUnclassifiedTransactions,
  useExpenseCategories,
  useInsertExpenseCategory,
  useReconcileBankCredit,
} from "@/lib/hooks/use-expenses";
import { classifyBankTransaction } from "@/lib/data/expenses";
import { formatINR } from "@/lib/utils/format";
import type { UnclassifiedTransaction, ExpenseCategory } from "@/types/kpi";

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

// ─── Manage Categories ─────────────────────────────────────────────────────────

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
        onClick={() => setOpen((o) => !o)}
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
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                placeholder="e.g. Delivery Charges"
                className="h-8 w-full px-3 rounded-md border border-border bg-background text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">Group</label>
              <select
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                className="h-8 px-2 rounded-md border border-border bg-background text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500"
              >
                {CATEGORY_GROUPS.map((g) => <option key={g}>{g}</option>)}
              </select>
            </div>
            <button
              onClick={handleAdd}
              disabled={isPending || !name.trim()}
              className="h-8 px-3 flex items-center gap-1.5 rounded-md bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-[12px] font-semibold transition-colors"
            >
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add
            </button>
            {success && <span className="text-[12px] text-emerald-400 flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5" />{success}</span>}
            {error && <span className="text-[12px] text-red-400">{(error as Error).message}</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-muted text-[11px] font-medium text-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400 flex-shrink-0" />
                {c.name}
                <span className="text-muted-foreground/60">· {c.category_group}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Debit Row (classify as expense) ──────────────────────────────────────────

interface DebitRowState { categoryId: string; vendor: string; saving: boolean; done: boolean; error: string | null; }

function DebitRow({
  tx, state, categories,
  onChange, onClassify,
}: {
  tx: UnclassifiedTransaction;
  state: DebitRowState;
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
          <span className="flex items-center gap-1.5 text-[12px] text-emerald-400">
            <CheckCircle className="h-3.5 w-3.5" /> Classified
          </span>
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
          value={state.categoryId}
          onChange={(e) => onChange("categoryId", e.target.value)}
          className="h-7 px-2 rounded-md border border-border bg-background text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500 w-40"
        >
          <option value="">Select category…</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </td>
      <td className="px-3 py-2">
        <input
          type="text"
          value={state.vendor}
          onChange={(e) => onChange("vendor", e.target.value)}
          placeholder="Vendor (optional)"
          className="h-7 px-2 rounded-md border border-border bg-background text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet-500 w-32"
        />
      </td>
      <td className="px-3 py-2">
        {state.error && <span className="text-[10px] text-red-400 block mb-1">{state.error}</span>}
        <button
          onClick={onClassify}
          disabled={state.saving || !state.categoryId}
          className="h-7 px-3 rounded-md bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {state.saving ? "Saving…" : "Classify"}
        </button>
      </td>
    </tr>
  );
}

// ─── Credit Row (reconcile as known type) ──────────────────────────────────────

interface CreditRowState { type: string; saving: boolean; done: boolean; error: string | null; }

function CreditRow({
  tx, state,
  onChange, onReconcile,
}: {
  tx: UnclassifiedTransaction;
  state: CreditRowState;
  onChange: (type: string) => void;
  onReconcile: () => void;
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
          <span className="flex items-center gap-1.5 text-[12px] text-emerald-400">
            <CheckCircle className="h-3.5 w-3.5" /> Reconciled
          </span>
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
      <td className="px-3 py-2" colSpan={1}>
        <select
          value={state.type}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 px-2 rounded-md border border-border bg-background text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500 w-56"
        >
          <option value="">Identify receipt type…</option>
          {CREDIT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </td>
      <td className="px-3 py-2">
        {state.error && <span className="text-[10px] text-red-400 block mb-1">{state.error}</span>}
        <button
          onClick={onReconcile}
          disabled={state.saving || !state.type}
          className="h-7 px-3 rounded-md bg-emerald-700 hover:bg-emerald-600 text-white text-[11px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {state.saving ? "Saving…" : "Reconcile"}
        </button>
      </td>
    </tr>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function BankClassificationPage() {
  const queryClient = useQueryClient();
  const { data: transactions = [], isLoading: txLoading, isFetching, refetch } = useUnclassifiedTransactions();
  const { data: categories = [], isLoading: catLoading } = useExpenseCategories();
  const { mutateAsync: reconcile } = useReconcileBankCredit();

  const debits  = transactions.filter((t) => t.tx_direction === "debit");
  const credits = transactions.filter((t) => t.tx_direction === "credit");

  // Debit row state
  const [debitStates, setDebitStates] = useState<Record<number, { categoryId: string; vendor: string; saving: boolean; done: boolean; error: string | null }>>({});
  const getDebitState = (id: number) => debitStates[id] ?? { categoryId: "", vendor: "", saving: false, done: false, error: null };
  const updateDebit = (id: number, patch: Partial<typeof debitStates[number]>) =>
    setDebitStates((prev) => ({ ...prev, [id]: { ...getDebitState(id), ...patch } }));

  // Credit row state
  const [creditStates, setCreditStates] = useState<Record<number, CreditRowState>>({});
  const getCreditState = (id: number): CreditRowState => creditStates[id] ?? { type: "", saving: false, done: false, error: null };
  const updateCredit = (id: number, patch: Partial<CreditRowState>) =>
    setCreditStates((prev) => ({ ...prev, [id]: { ...getCreditState(id), ...patch } }));

  const handleClassifyDebit = async (tx: UnclassifiedTransaction) => {
    const s = getDebitState(tx.id);
    if (!s.categoryId) return;
    updateDebit(tx.id, { saving: true, error: null });
    try {
      await classifyBankTransaction({
        transactionId: tx.id,
        categoryId: Number(s.categoryId),
        vendor: s.vendor || undefined,
      });
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

  const pendingDebits  = debits.filter((t) => !getDebitState(t.id).done).length;
  const pendingCredits = credits.filter((t) => !getCreditState(t.id).done).length;
  const doneCount      = Object.values(debitStates).filter((s) => s.done).length
                       + Object.values(creditStates).filter((s) => s.done).length;

  return (
    <div className="min-h-full p-4 sm:p-6 space-y-6">
      <PageHeader
        title="Bank Classification"
        subtitle="Classify debits as expenses · Reconcile unidentified credits"
      >
        <div className="flex items-center gap-3">
          {doneCount > 0 && (
            <span className="flex items-center gap-1.5 text-[12px] text-emerald-400 font-medium">
              <CheckCircle className="h-3.5 w-3.5" /> {doneCount} resolved
            </span>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            {isFetching ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </PageHeader>

      {/* Summary row */}
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

      {/* Expense categories */}
      <ManageCategoriesPanel categories={categories} />

      {/* Debits section */}
      <div className="rounded-xl border border-border bg-card">
        <div className="px-5 py-3 border-b border-border flex items-center gap-2">
          <ArrowDownLeft className="h-4 w-4 text-amber-400" />
          <p className="text-[13px] font-semibold text-foreground">Unclassified Debits</p>
          <span className="ml-auto text-[11px] text-muted-foreground">Classify each debit as an expense category</span>
        </div>
        {txLoading || catLoading ? (
          <div className="h-32 m-4 rounded-lg skeleton" />
        ) : debits.length === 0 ? (
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
                {debits.map((tx) => (
                  <DebitRow
                    key={tx.id}
                    tx={tx}
                    state={getDebitState(tx.id)}
                    categories={categories}
                    onChange={(field, value) => updateDebit(tx.id, { [field]: value })}
                    onClassify={() => handleClassifyDebit(tx)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Credits section */}
      <div className="rounded-xl border border-border bg-card">
        <div className="px-5 py-3 border-b border-border flex items-center gap-2">
          <ArrowUpRight className="h-4 w-4 text-blue-400" />
          <p className="text-[13px] font-semibold text-foreground">Unidentified Credits</p>
          <span className="ml-auto text-[11px] text-muted-foreground">Identify what each incoming receipt is</span>
        </div>
        {txLoading ? (
          <div className="h-32 m-4 rounded-lg skeleton" />
        ) : credits.length === 0 ? (
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
                {credits.map((tx) => (
                  <CreditRow
                    key={tx.id}
                    tx={tx}
                    state={getCreditState(tx.id)}
                    onChange={(type) => updateCredit(tx.id, { type })}
                    onReconcile={() => handleReconcileCredit(tx)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card/50 p-4">
        <div className="flex items-start gap-2.5">
          <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-[12px] font-semibold text-foreground mb-1">How this works</p>
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Debits</strong> (withdrawals) are classified as expense categories — this creates an approved expense entry and links it to the bank transaction.{" "}
              <strong className="text-foreground">Credits</strong> (incoming money) are reconciled by identifying their type (gateway settlement, COD remittance, etc.) so they appear correctly in cashflow reports.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
