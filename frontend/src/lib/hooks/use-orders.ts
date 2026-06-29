"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchClassificationSummary,
  fetchOrdersByClassification,
  classifyOrder,
  autoClassifyOrders,
  fetchReceivablesSummary,
  fetchReceivablesList,
} from "@/lib/data/orders";
import type { OrderClass } from "@/types/kpi";

export function useClassificationSummary() {
  return useQuery({
    queryKey: ["classification-summary"],
    queryFn: fetchClassificationSummary,
    staleTime: 60_000,
  });
}

export function useOrdersByClassification(
  classification?: string | null,
  limit = 100,
  undeliveredOnly = false,
) {
  return useQuery({
    queryKey: ["orders-by-classification", classification ?? "all", limit, undeliveredOnly],
    queryFn: () => fetchOrdersByClassification(classification, limit, 0, undeliveredOnly),
    staleTime: 30_000,
  });
}

export function useClassifyOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      orderId,
      classification,
      notes,
    }: {
      orderId: number;
      classification: OrderClass;
      notes?: string;
    }) => classifyOrder(orderId, classification, notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders-by-classification"] });
      qc.invalidateQueries({ queryKey: ["classification-summary"] });
      qc.invalidateQueries({ queryKey: ["receivables"] });
    },
  });
}

export function useAutoClassify() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: autoClassifyOrders,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders-by-classification"] });
      qc.invalidateQueries({ queryKey: ["classification-summary"] });
      qc.invalidateQueries({ queryKey: ["receivables"] });
    },
  });
}

export function useReceivablesSummary() {
  return useQuery({
    queryKey: ["receivables", "summary"],
    queryFn: fetchReceivablesSummary,
    staleTime: 60_000,
  });
}

export function useReceivablesList(limit = 100) {
  return useQuery({
    queryKey: ["receivables", "list", limit],
    queryFn: () => fetchReceivablesList(limit),
    staleTime: 60_000,
  });
}
