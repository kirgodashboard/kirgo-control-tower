"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchReceivablesKpis,
  fetchCustomerReceivables,
  fetchCodReceivables,
  fetchSettlementPending,
  fetchReceivablesTrend,
  fetchReceivablesAgeing,
  fetchCollectionPerformance,
} from "@/lib/data/receivables";

export function useReceivablesKpis() {
  return useQuery({
    queryKey: ["receivables", "kpis"],
    queryFn: fetchReceivablesKpis,
    staleTime: 60_000,
  });
}

export function useCustomerReceivables(limit = 200) {
  return useQuery({
    queryKey: ["receivables", "customer", limit],
    queryFn: () => fetchCustomerReceivables(limit),
    staleTime: 60_000,
  });
}

export function useCodReceivables(limit = 200) {
  return useQuery({
    queryKey: ["receivables", "cod", limit],
    queryFn: () => fetchCodReceivables(limit),
    staleTime: 60_000,
  });
}

export function useSettlementPending() {
  return useQuery({
    queryKey: ["receivables", "settlement-pending"],
    queryFn: fetchSettlementPending,
    staleTime: 60_000,
  });
}

export function useReceivablesTrend(days = 90) {
  return useQuery({
    queryKey: ["receivables", "trend", days],
    queryFn: () => fetchReceivablesTrend(days),
    staleTime: 60_000,
  });
}

export function useReceivablesAgeing() {
  return useQuery({
    queryKey: ["receivables", "ageing"],
    queryFn: fetchReceivablesAgeing,
    staleTime: 60_000,
  });
}

export function useCollectionPerformance() {
  return useQuery({
    queryKey: ["receivables", "collection-performance"],
    queryFn: fetchCollectionPerformance,
    staleTime: 60_000,
  });
}
