import { supabase } from "@/lib/supabase/client";
import type {
  BankAccount, BankKpis, BankCashflowRow, BankCategoryRow,
  BankTransaction, BankUpload, BankClassificationRule,
} from "@/types/bank";

export async function fetchBankAccounts(): Promise<BankAccount[]> {
  const { data, error } = await supabase.rpc("get_bank_accounts", { p_company_id: 1 });
  if (error) throw error;
  return (data ?? []) as BankAccount[];
}

export async function fetchBankKpis(
  accountId: number | null = null,
  from?: string,
  to?: string,
): Promise<BankKpis> {
  const { data, error } = await supabase.rpc("get_bank_kpis", {
    p_account_id: accountId,
    p_company_id: 1,
    p_from: from ?? null,
    p_to: to ?? null,
  });
  if (error) throw error;
  return (data ?? {}) as BankKpis;
}

export async function fetchBankDailyCashflow(
  accountId: number | null = null,
  days = 30,
): Promise<BankCashflowRow[]> {
  const { data, error } = await supabase.rpc("get_bank_daily_cashflow", {
    p_account_id: accountId,
    p_days: days,
  });
  if (error) throw error;
  return (data ?? []) as BankCashflowRow[];
}

export async function fetchBankCategoryBreakdown(
  accountId: number | null = null,
): Promise<BankCategoryRow[]> {
  const { data, error } = await supabase.rpc("get_bank_category_breakdown", {
    p_account_id: accountId,
  });
  if (error) throw error;
  return (data ?? []) as BankCategoryRow[];
}

export async function fetchBankTransactions(
  accountId: number | null = null,
  filter: "all" | "unclassified" | "classified" = "all",
  limit = 50,
  offset = 0,
): Promise<BankTransaction[]> {
  const { data, error } = await supabase.rpc("get_bank_transactions_list", {
    p_account_id: accountId,
    p_filter: filter === "all" ? null : filter,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return (data ?? []) as BankTransaction[];
}

export async function fetchBankImportHistory(
  accountId: number,
  limit = 10,
): Promise<BankUpload[]> {
  const { data, error } = await supabase.rpc("get_bank_import_history", {
    p_account_id: accountId,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as BankUpload[];
}

export async function fetchBankClassificationRules(): Promise<BankClassificationRule[]> {
  const { data, error } = await supabase.rpc("get_bank_classification_rules", {
    p_company_id: 1,
  });
  if (error) throw error;
  return (data ?? []) as BankClassificationRule[];
}
