"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle, AlertCircle, CreditCard, RefreshCw, Plus, ChevronDown, ChevronUp, Tag, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { useUnclassifiedTransactions, useExpenseCategories, useInsertExpenseCategory } from "@/lib/hooks/use-expenses";
import { classifyBankTransaction } from "@/lib/data/expenses";
import { formatINR } from "@/lib/utils/format";
import type { UnclassifiedTransaction, ExpenseCategory } from "@/types/kpi";

const CATEGORY_GROUPS = ["Operating", "Finance", "Capital", "Other"];

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
          <span className="text-[13px] font-semibold text-foreground">Manage Categories</span>
          <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{categories.length}</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t border-border px-5 py-4 space-y-4">
          {/* Add new category form */}
          <div className="flex items-end gap-2 flex-wrap">
            <div className="flex-1 min-w-[160px]">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                Category Name
              </label>
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
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                Group
              </label>
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

          {/* Existing categories grid */}
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-muted text-[11px] font-medium text-foreground"
              >
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

interface RowState {
  categoryId: string;
  vendor: string;
  saving: boolean;
  done: boolean;
  error: string | null;
}

function ClassifyRow({
  tx,
  state,
  onChange,
  onClassify,
  categories,
}: {
  tx: UnclassifiedTransaction;
  state: RowState;
  onChange: (field: "categoryId" | "vendor", value: string) => void;
  onClassify: () => void;
  categories: { id: number; name: string }[];
}) {
  if (state.done) {
    return (
      <tr className="border-b border-border/30 opacity-50">
        <td className="px-3 py-2 text-muted-foreground text-[12px]">{tx.transaction_date}</td>
        <td className="px-3 py-2 text-[12px] text-muted-foreground max-w-[200px] truncate" title={tx.narration_raw}>
          {tx.narration_raw}
        </td>
        <td className="px-3 py-2 text-right text-[12px] tabular-nums font-medium text-foreground">
          {formatINR(tx.withdrawal_inr)}
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
      <td className="px-3 py-2 text-[12px] text-muted-foreground whitespace-nowrap">
        {tx.transaction_date}
      </td>
      <td className="px-3 py-2 text-[12px] text-foreground max-w-[200px]">
        <span className="truncate block" title={tx.narration_raw}>{tx.narration_raw}</span>
        {tx.counterparty && (
          <span className="text-[11px] text-muted-foreground">{tx.counterparty}</span>
        )}
      </td>
      <td className="px-3 py-2 text-right text-[12px] tabular-nums font-semibold text-foreground whitespace-nowrap">
        {formatINR(tx.withdrawal_inr)}
      </td>
      <td className="px-3 py-2">
        <select
          value={state.categoryId}
          onChange={(e) => onChange("categoryId", e.target.value)}
          className="h-7 px-2 rounded-md border border-border bg-background text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500 w-36"
        >
          <option value="">Select head...</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
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
        {state.error && (
          <span className="text-[10px] text-red-400 block mb-1">{state.error}</span>
        )}
        <button
          onClick={onClassify}
          disabled={state.saving || !state.categoryId}
          className="h-7 px-3 rounded-md bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {state.saving ? "Saving..." : "Classify"}
        </button>
      </td>
    </tr>
  );
}

export default function BankClassificationPage() {
  const queryClient = useQueryClient();
  const { data: transactions = [], isLoading: txLoading, refetch } = useUnclassifiedTransactions();
  const { data: categories = [], isLoading: catLoading } = useExpenseCategories();

  const [rowStates, setRowStates] = useState<Record<number, RowState>>({});

  const getRowState = (id: number): RowState =>
    rowStates[id] ?? { categoryId: "", vendor: "", saving: false, done: false, error: null };

  const updateRow = (id: number, patch: Partial<RowState>) =>
    setRowStates((prev) => ({ ...prev, [id]: { ...getRowState(id), ...patch } }));

  const handleChange = (id: number, field: "categoryId" | "vendor", value: string) =>
    updateRow(id, { [field]: value });

  const handleClassify = async (tx: UnclassifiedTransaction) => {
    const s = getRowState(tx.id);
    if (!s.categoryId) return;
    updateRow(tx.id, { saving: true, error: null });
    try {
      await classifyBankTransaction({
        transactionId: tx.id,
        categoryId:    Number(s.categoryId),
        vendor:        s.vendor || undefined,
      });
      updateRow(tx.id, { saving: false, done: true });
      queryClient.invalidateQueries({ queryKey: ["expense-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["expense-list"] });
      queryClient.invalidateQueries({ queryKey: ["expense-by-category"] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed";
      updateRow(tx.id, { saving: false, error: msg });
    }
  };

  const pendingCount = transactions.filter((t) => !getRowState(t.id).done).length;
  const doneCount    = Object.values(rowStates).filter((s) => s.done).length;

  return (
    <div className="min-h-full p-4 sm:p-6 space-y-6">
      <PageHeader
        title="Bank Classification"
        subtitle="Classify unclassified bank debits into expense records"
      >
        <div className="flex items-center gap-3">
          {doneCount > 0 && (
            <span className="flex items-center gap-1.5 text-[12px] text-emerald-400 font-medium">
              <CheckCircle className="h-3.5 w-3.5" /> {doneCount} classified
            </span>
          )}
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </PageHeader>

      {/* Summary card */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 flex items-center justify-center rounded-lg bg-amber-500/10">
            <CreditCard className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <p className="text-[20px] font-bold text-foreground tabular-nums">{pendingCount}</p>
            <p className="text-[12px] text-muted-foreground">unclassified debits awaiting classification</p>
          </div>
          {pendingCount === 0 && !txLoading && (
            <div className="ml-auto flex items-center gap-2 text-emerald-400">
              <CheckCircle className="h-4 w-4" />
              <span className="text-[13px] font-medium">All caught up</span>
            </div>
          )}
        </div>
      </div>

      {/* Category management */}
      <ManageCategoriesPanel categories={categories} />

      {/* Table */}
      <div className="rounded-xl border border-border bg-card">
        <div className="px-5 py-3 border-b border-border">
          <p className="text-[13px] font-semibold text-foreground">Unclassified Transactions</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Select a category and optionally a vendor, then click Classify to create an approved expense.
          </p>
        </div>

        {txLoading || catLoading ? (
          <div className="h-52 m-4 rounded-lg skeleton" />
        ) : transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CheckCircle className="h-8 w-8 text-emerald-400 mb-3" />
            <p className="text-[15px] font-semibold text-foreground mb-1">No unclassified transactions</p>
            <p className="text-[12px] text-muted-foreground">All bank debits have been classified.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Date</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Narration</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Amount</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Category</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Vendor</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <ClassifyRow
                    key={tx.id}
                    tx={tx}
                    state={getRowState(tx.id)}
                    categories={categories}
                    onChange={(field, value) => handleChange(tx.id, field, value)}
                    onClassify={() => handleClassify(tx)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Help note */}
      <div className="rounded-xl border border-border bg-card/50 p-4">
        <div className="flex items-start gap-2.5">
          <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-[12px] font-semibold text-foreground mb-1">How classification works</p>
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              Each row is an unclassified bank debit (withdrawal). Selecting a category and clicking Classify
              creates an approved expense entry linked to this bank transaction, and updates the transaction
              type to <code className="text-[11px] bg-muted px-1 py-0.5 rounded">miscellaneous</code>. The expense will appear in Expense Master immediately.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
