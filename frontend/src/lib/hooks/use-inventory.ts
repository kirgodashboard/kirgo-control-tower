"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchInventoryKpis,
  fetchStockPosition,
  fetchStockMovements,
  fetchStockAgeing,
  fetchReorderReport,
} from "@/lib/data/inventory";

export function useInventoryKpis() {
  return useQuery({
    queryKey: ["inventory-kpis"],
    queryFn: fetchInventoryKpis,
    staleTime: 60_000,
  });
}

export function useStockPosition(search?: string | null) {
  return useQuery({
    queryKey: ["stock-position", search ?? "all"],
    queryFn: () => fetchStockPosition(search),
    staleTime: 30_000,
  });
}

export function useStockMovements(itemId?: number | null) {
  return useQuery({
    queryKey: ["stock-movements", itemId ?? "all"],
    queryFn: () => fetchStockMovements(itemId),
    staleTime: 30_000,
  });
}

export function useStockAgeing() {
  return useQuery({
    queryKey: ["stock-ageing"],
    queryFn: fetchStockAgeing,
    staleTime: 60_000,
  });
}

export function useReorderReport() {
  return useQuery({
    queryKey: ["reorder-report"],
    queryFn: fetchReorderReport,
    staleTime: 60_000,
  });
}
