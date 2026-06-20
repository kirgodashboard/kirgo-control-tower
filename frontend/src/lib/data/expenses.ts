import { supabase } from "@/lib/supabase/client";
import type {
  ExpenseKpis,
  ExpenseListItem,
  ExpenseByCategory,
  ExpenseTrendPoint,
  ExpenseVendor,
  ExpenseCategory,
  UnclassifiedTransaction,
} from "@/types/kpi";

export async function fetchExpenseKpis(start: string, end: string): Promise<ExpenseKpis> {
  const { data, error } = await supabase.rpc("get_expense_kpis", { p_start: start, p_end: end });
  if (error) throw error;
  return data as ExpenseKpis;
}

export async function fetchExpenseList(
  start: string,
  end: string,
  categoryId?: number | null,
  vendor?: string | null,
): Promise<ExpenseListItem[]> {
  const { data, error } = await supabase.rpc("get_expense_list", {
    p_start: start,
    p_end: end,
    p_category_id: categoryId ?? null,
    p_vendor: vendor ?? null,
  });
  if (error) throw error;
  return (data ?? []) as ExpenseListItem[];
}

export async function fetchExpenseByCategory(start: string, end: string): Promise<ExpenseByCategory[]> {
  const { data, error } = await supabase.rpc("get_expense_by_category", { p_start: start, p_end: end });
  if (error) throw error;
  return (data ?? []) as ExpenseByCategory[];
}

export async function fetchExpenseTrend(start: string, end: string): Promise<ExpenseTrendPoint[]> {
  const { data, error } = await supabase.rpc("get_expense_trend", { p_start: start, p_end: end });
  if (error) throw error;
  return (data ?? []) as ExpenseTrendPoint[];
}

export async function fetchTopVendors(start: string, end: string, limit = 10): Promise<ExpenseVendor[]> {
  const { data, error } = await supabase.rpc("get_top_vendors", {
    p_start: start,
    p_end: end,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as ExpenseVendor[];
}

export async function fetchExpenseCategories(): Promise<ExpenseCategory[]> {
  const { data, error } = await supabase.rpc("get_expense_categories");
  if (error) throw error;
  return (data ?? []) as ExpenseCategory[];
}

export async function fetchUnclassifiedTransactions(limit = 50): Promise<UnclassifiedTransaction[]> {
  const { data, error } = await supabase.rpc("get_unclassified_transactions", { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as UnclassifiedTransaction[];
}

export async function insertExpense(params: {
  expenseDate: string;
  categoryId: number;
  description: string;
  amountInr: number;
  vendor?: string;
  paymentMethod?: string;
  notes?: string;
  attachmentUrl?: string;
  status?: string;
}): Promise<number> {
  const { data, error } = await supabase.rpc("insert_expense", {
    p_expense_date:   params.expenseDate,
    p_category_id:    params.categoryId,
    p_description:    params.description,
    p_amount_inr:     params.amountInr,
    p_vendor:         params.vendor         ?? null,
    p_payment_method: params.paymentMethod  ?? null,
    p_notes:          params.notes          ?? null,
    p_attachment_url: params.attachmentUrl  ?? null,
    p_status:         params.status         ?? "draft",
  });
  if (error) throw error;
  return data as number;
}

export async function insertExpenseCategory(name: string, group: string): Promise<number> {
  const { data, error } = await supabase.rpc("insert_expense_category", {
    p_name:           name.trim(),
    p_category_group: group,
  });
  if (error) throw error;
  return data as number;
}

export async function classifyBankTransaction(params: {
  transactionId: number;
  categoryId: number;
  vendor?: string;
  description?: string;
  notes?: string;
}): Promise<number> {
  const { data, error } = await supabase.rpc("classify_bank_transaction", {
    p_transaction_id: params.transactionId,
    p_category_id:    params.categoryId,
    p_vendor:         params.vendor      ?? null,
    p_description:    params.description ?? null,
    p_notes:          params.notes       ?? null,
  });
  if (error) throw error;
  return data as number;
}
