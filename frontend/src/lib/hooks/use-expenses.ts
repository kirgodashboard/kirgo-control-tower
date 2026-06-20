"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchExpenseKpis,
  fetchExpenseList,
  fetchExpenseByCategory,
  fetchExpenseTrend,
  fetchTopVendors,
  fetchExpenseCategories,
  fetchUnclassifiedTransactions,
  insertExpenseCategory,
} from "@/lib/data/expenses";

export function useExpenseKpis(start: string, end: string) {
  return useQuery({
    queryKey: ["expense-kpis", start, end],
    queryFn: () => fetchExpenseKpis(start, end),
    staleTime: 5 * 60 * 1000,
  });
}

export function useExpenseList(
  start: string,
  end: string,
  categoryId?: number | null,
  vendor?: string | null,
) {
  return useQuery({
    queryKey: ["expense-list", start, end, categoryId ?? null, vendor ?? null],
    queryFn: () => fetchExpenseList(start, end, categoryId, vendor),
    staleTime: 2 * 60 * 1000,
  });
}

export function useExpenseByCategory(start: string, end: string) {
  return useQuery({
    queryKey: ["expense-by-category", start, end],
    queryFn: () => fetchExpenseByCategory(start, end),
    staleTime: 5 * 60 * 1000,
  });
}

export function useExpenseTrend(start: string, end: string) {
  return useQuery({
    queryKey: ["expense-trend", start, end],
    queryFn: () => fetchExpenseTrend(start, end),
    staleTime: 5 * 60 * 1000,
  });
}

export function useTopVendors(start: string, end: string) {
  return useQuery({
    queryKey: ["top-vendors", start, end],
    queryFn: () => fetchTopVendors(start, end),
    staleTime: 5 * 60 * 1000,
  });
}

export function useExpenseCategories() {
  return useQuery({
    queryKey: ["expense-categories"],
    queryFn: fetchExpenseCategories,
    staleTime: 10 * 60 * 1000,
  });
}

export function useUnclassifiedTransactions() {
  return useQuery({
    queryKey: ["unclassified-transactions"],
    queryFn: () => fetchUnclassifiedTransactions(50),
    staleTime: 2 * 60 * 1000,
  });
}

export function useInsertExpenseCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, group }: { name: string; group: string }) =>
      insertExpenseCategory(name, group),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expense-categories"] }),
  });
}
