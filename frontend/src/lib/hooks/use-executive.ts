"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchExecutiveKpis, fetchRevenueTrend, fetchPeriodComparison, fetchLaunchPerformance } from "@/lib/data/executive";
import { getPriorPeriod } from "@/lib/utils/date-ranges";

export function useExecutiveKpis(start: string, end: string) {
  return useQuery({
    queryKey: ["executive-kpis", start, end],
    queryFn: () => fetchExecutiveKpis(start, end),
    staleTime: 2 * 60 * 1000,
  });
}

export function useRevenueTrend(start: string, end: string, grain: string) {
  return useQuery({
    queryKey: ["revenue-trend", start, end, grain],
    queryFn: () => fetchRevenueTrend(start, end, grain),
    staleTime: 2 * 60 * 1000,
  });
}

export function usePeriodComparison(start: string, end: string) {
  return useQuery({
    queryKey: ["period-comparison", start, end],
    queryFn: () => {
      const prior = getPriorPeriod({ start, end, label: "" });
      return fetchPeriodComparison(start, end, prior.start, prior.end);
    },
    staleTime: 2 * 60 * 1000,
  });
}

export function useLaunchPerformance() {
  return useQuery({
    queryKey: ["launch-performance"],
    queryFn: fetchLaunchPerformance,
    staleTime: 5 * 60 * 1000,
  });
}
