import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchBankAccounts, fetchBankKpis, fetchBankDailyCashflow,
  fetchBankCategoryBreakdown, fetchBankTransactions,
  fetchBankImportHistory, fetchBankClassificationRules,
} from "@/lib/data/bank";

export function useBankAccounts() {
  return useQuery({
    queryKey: ["bank-accounts"],
    queryFn: fetchBankAccounts,
    staleTime: 30_000,
  });
}

export function useBankKpis(
  accountId: number | null = null,
  from?: string,
  to?: string,
) {
  return useQuery({
    queryKey: ["bank-kpis", accountId, from, to],
    queryFn: () => fetchBankKpis(accountId, from, to),
    staleTime: 60_000,
  });
}

export function useBankDailyCashflow(accountId: number | null = null, days = 30) {
  return useQuery({
    queryKey: ["bank-cashflow", accountId, days],
    queryFn: () => fetchBankDailyCashflow(accountId, days),
    staleTime: 60_000,
  });
}

export function useBankCategoryBreakdown(accountId: number | null = null) {
  return useQuery({
    queryKey: ["bank-categories", accountId],
    queryFn: () => fetchBankCategoryBreakdown(accountId),
    staleTime: 60_000,
  });
}

export function useBankTransactions(
  accountId: number | null = null,
  filter: "all" | "unclassified" | "classified" = "all",
  limit = 50,
) {
  return useQuery({
    queryKey: ["bank-transactions", accountId, filter, limit],
    queryFn: () => fetchBankTransactions(accountId, filter, limit),
    staleTime: 30_000,
  });
}

export function useBankImportHistory(accountId: number | null) {
  return useQuery({
    queryKey: ["bank-import-history", accountId],
    queryFn: () => fetchBankImportHistory(accountId!),
    enabled: accountId != null,
    staleTime: 15_000,
  });
}

export function useBankClassificationRules() {
  return useQuery({
    queryKey: ["bank-classification-rules"],
    queryFn: fetchBankClassificationRules,
    staleTime: 60_000,
  });
}

export function useRefreshBankData() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["bank-accounts"] });
    qc.invalidateQueries({ queryKey: ["bank-kpis"] });
    qc.invalidateQueries({ queryKey: ["bank-cashflow"] });
    qc.invalidateQueries({ queryKey: ["bank-categories"] });
    qc.invalidateQueries({ queryKey: ["bank-transactions"] });
    qc.invalidateQueries({ queryKey: ["bank-import-history"] });
  };
}
