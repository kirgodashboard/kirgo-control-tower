"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchOperationsKpis, fetchShipmentFunnel, fetchCodReconciliation } from "@/lib/data/operations";

export function useOperationsKpis(start: string, end: string) {
  return useQuery({
    queryKey: ["operations-kpis", start, end],
    queryFn: () => fetchOperationsKpis(start, end),
    staleTime: 2 * 60 * 1000,
  });
}

export function useShipmentFunnel() {
  return useQuery({
    queryKey: ["shipment-funnel"],
    queryFn: fetchShipmentFunnel,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCodReconciliation() {
  return useQuery({
    queryKey: ["cod-reconciliation"],
    queryFn: fetchCodReconciliation,
    staleTime: 2 * 60 * 1000,
  });
}
