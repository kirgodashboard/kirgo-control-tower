"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchIntegrationSummary,
  fetchIntegrationHealth,
  fetchRecentSyncRuns,
  fetchSyncJobs,
  triggerManualSync,
} from "@/lib/data/integrations";

export function useIntegrationHealth() {
  return useQuery({
    queryKey: ["integration-health"],
    queryFn:  fetchIntegrationHealth,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });
}

export function useIntegrationSummary() {
  return useQuery({
    queryKey:      ["integration-summary"],
    queryFn:       fetchIntegrationSummary,
    staleTime:     30 * 1000,          // 30 s
    refetchInterval: 30 * 1000,        // auto-refresh every 30 s
  });
}

export function useRecentSyncRuns(integrationKey?: string) {
  return useQuery({
    queryKey:  ["sync-runs", integrationKey ?? "all"],
    queryFn:   () => fetchRecentSyncRuns(integrationKey),
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });
}

export function useSyncJobs(integrationKey?: string) {
  return useQuery({
    queryKey: ["sync-jobs", integrationKey ?? "all"],
    queryFn:  () => fetchSyncJobs(integrationKey),
    staleTime: 5 * 60 * 1000,
  });
}

export function useTriggerSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: number) => triggerManualSync(jobId),
    onSuccess:  () => {
      // Refetch after a short delay to catch the new running row
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["integration-summary"] });
        qc.invalidateQueries({ queryKey: ["sync-runs"] });
      }, 1500);
    },
  });
}
