import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchMetricCatalog,
  fetchDataTrustLatest,
  fetchDataTrustHistory,
  runDataTrustCheck,
} from "@/lib/data/governance";

export function useMetricCatalog() {
  return useQuery({
    queryKey: ["metric-catalog"],
    queryFn: fetchMetricCatalog,
    staleTime: 5 * 60 * 1000,
  });
}

export function useDataTrustLatest() {
  return useQuery({
    queryKey: ["data-trust-latest"],
    queryFn: fetchDataTrustLatest,
    staleTime: 60 * 1000,
  });
}

export function useDataTrustHistory(limit = 30) {
  return useQuery({
    queryKey: ["data-trust-history", limit],
    queryFn: () => fetchDataTrustHistory(limit),
    staleTime: 60 * 1000,
  });
}

export function useRunDataTrustCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: runDataTrustCheck,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["data-trust-latest"] });
      qc.invalidateQueries({ queryKey: ["data-trust-history"] });
    },
  });
}
