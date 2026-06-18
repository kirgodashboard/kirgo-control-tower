"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchDirectorSnapshot,
  fetchSystemAlerts,
  fetchRevenueTrend30d,
  fetchCashFlow30d,
} from "@/lib/data/director";

export function useDirectorSnapshot() {
  return useQuery({
    queryKey: ["director-snapshot"],
    queryFn: fetchDirectorSnapshot,
    refetchInterval: 2 * 60 * 1000, // auto-refresh every 2 minutes
    staleTime: 90 * 1000,
  });
}

export function useSystemAlerts() {
  return useQuery({
    queryKey: ["system-alerts"],
    queryFn: fetchSystemAlerts,
    refetchInterval: 2 * 60 * 1000,
    staleTime: 90 * 1000,
  });
}

export function useRevenueTrend30d() {
  return useQuery({
    queryKey: ["revenue-trend-30d"],
    queryFn: fetchRevenueTrend30d,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCashFlow30d() {
  return useQuery({
    queryKey: ["cash-flow-30d"],
    queryFn: fetchCashFlow30d,
    staleTime: 5 * 60 * 1000,
  });
}
