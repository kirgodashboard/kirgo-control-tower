"use client";

import { useState } from "react";
import { CheckCircle, AlertCircle, FilePlus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { useExpenseCategories } from "@/lib/hooks/use-expenses";
import { insertExpense } from "@/lib/data/expenses";

const PAYMENT_METHODS = [
  { value: "upi",          label: "UPI" },
  { value: "bank_transfer",label: "Bank Transfer" },
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
  expense_date:    "",
  category_id:     "",
  description:     "",
  amount_inr:      "",
  vendor:          "",
  payment_method:  "",
  notes:           "",
  attachment_url:  "",
  status:          "draft",
};

type FormState = typeof EMPTY_FORM;

function InputField({
  label, required, children,
}: {
  label: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full h-9 px-3 rounded-md border border-border bg-background text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet-500 transition-colors";
const selectCls =
  "w-full h-9 px-3 rounded-md border border-border bg-background text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500 transition-colors";

export default function ExpenseEntryPage() {
  const { data: categories = [], isLoading: catLoading } = useExpenseCategories();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const set = (field: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

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
        expenseDate:    form.expense_date,
        categoryId:     Number(form.category_id),
        description:    form.description,
        amountInr:      amount,
        vendor:         form.vendor         || undefined,
        paymentMethod:  form.payment_method || undefined,
        notes:          form.notes          || undefined,
        attachmentUrl:  form.attachment_url || undefined,
        status:         form.status,
      });
      setResult({ ok: true, message: `Expense #${id} saved as ${form.status}.` });
      setForm(EMPTY_FORM);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setResult({ ok: false, message: `Failed to save: ${msg}` });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-full p-4 sm:p-6 space-y-6">
      <PageHeader
        title="New Expense"
        subtitle="Manually record an operational expense"
      >
        <div className="flex items-center gap-2">
          <FilePlus className="h-4 w-4 text-muted-foreground" />
          <span className="text-[12px] text-muted-foreground">Manual entry</span>
        </div>
      </PageHeader>

      <div className="max-w-2xl">
        <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card p-6 space-y-5">

          {/* Row 1: Date + Amount */}
          <div className="grid grid-cols-2 gap-4">
            <InputField label="Expense Date" required>
              <input
                type="date"
                value={form.expense_date}
                onChange={set("expense_date")}
                className={inputCls}
                required
              />
            </InputField>
            <InputField label="Amount (₹)" required>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount_inr}
                onChange={set("amount_inr")}
                placeholder="0.00"
                className={inputCls}
                required
              />
            </InputField>
          </div>

          {/* Row 2: Category */}
          <InputField label="Expense Category" required>
            <select
              value={form.category_id}
              onChange={set("category_id")}
              className={selectCls}
              required
              disabled={catLoading}
            >
              <option value="">{catLoading ? "Loading..." : "Select category..."}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </InputField>

          {/* Row 3: Description */}
          <InputField label="Description" required>
            <input
              type="text"
              value={form.description}
              onChange={set("description")}
              placeholder="Brief description of the expense"
              className={inputCls}
              required
            />
          </InputField>

          {/* Row 4: Vendor + Payment Method */}
          <div className="grid grid-cols-2 gap-4">
            <InputField label="Vendor">
              <input
                type="text"
                value={form.vendor}
                onChange={set("vendor")}
                placeholder="Vendor or payee name"
                className={inputCls}
              />
            </InputField>
            <InputField label="Payment Method">
              <select value={form.payment_method} onChange={set("payment_method")} className={selectCls}>
                <option value="">Select method...</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </InputField>
          </div>

          {/* Row 5: Notes */}
          <InputField label="Notes">
            <textarea
              value={form.notes}
              onChange={set("notes")}
              placeholder="Additional notes or context..."
              rows={3}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet-500 transition-colors resize-none"
            />
          </InputField>

          {/* Row 6: Attachment URL */}
          <InputField label="Attachment URL">
            <input
              type="url"
              value={form.attachment_url}
              onChange={set("attachment_url")}
              placeholder="https://..."
              className={inputCls}
            />
          </InputField>

          {/* Row 7: Status */}
          <InputField label="Status">
            <div className="flex gap-2">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, status: s.value }))}
                  className={`flex-1 h-9 rounded-md text-[12px] font-semibold border transition-colors ${
                    form.status === s.value
                      ? s.value === "approved"
                        ? "bg-emerald-500/10 border-emerald-500 text-emerald-400"
                        : s.value === "rejected"
                        ? "bg-red-500/10 border-red-500 text-red-400"
                        : "bg-violet-500/10 border-violet-500 text-violet-400"
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </InputField>

          {/* Result message */}
          {result && (
            <div
              className={`flex items-start gap-2.5 p-3 rounded-md text-[13px] ${
                result.ok
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "bg-red-500/10 text-red-400"
              }`}
            >
              {result.ok
                ? <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                : <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              }
              {result.message}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full h-10 rounded-md bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Saving..." : "Save Expense"}
          </button>
        </form>
      </div>
    </div>
  );
}
