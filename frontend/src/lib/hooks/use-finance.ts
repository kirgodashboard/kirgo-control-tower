"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchFinanceKpis, fetchCashFlowDaily, fetchGatewaySettlements } from "@/lib/data/finance";

export function useFinanceKpis(start: string, end: string) {
  return useQuery({
    queryKey: ["finance-kpis", start, end],
    queryFn: () => fetchFinanceKpis(start, end),
    staleTime: 2 * 60 * 1000,
  });
}

export function useCashFlowDaily(start: string) {
  return useQuery({
    queryKey: ["cash-flow-daily", start],
    queryFn: () => fetchCashFlowDaily(start),
    staleTime: 5 * 60 * 1000,
  });
}

export function useGatewaySettlements() {
  return useQuery({
    queryKey: ["gateway-settlements"],
    queryFn: fetchGatewaySettlements,
    staleTime: 5 * 60 * 1000,
  });
}
