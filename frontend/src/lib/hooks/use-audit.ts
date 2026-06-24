import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchAuditRevenue, fetchAuditOrders, fetchAuditShipments,
  fetchAuditCod, fetchAuditInfluencerOrders, fetchAuditSetProducts,
  fetchAuditRecognitionHealth,
  fetchAuditRuns, fetchAuditKpiResults, runKpiAudit,
} from "@/lib/data/audit";

const STALE = 60_000; // 1 min — audit data doesn't need real-time freshness

export const useAuditRevenue         = () => useQuery({ queryKey: ["audit","revenue"],      queryFn: fetchAuditRevenue,           staleTime: STALE });
export const useAuditOrders          = () => useQuery({ queryKey: ["audit","orders"],       queryFn: fetchAuditOrders,            staleTime: STALE });
export const useAuditShipments       = () => useQuery({ queryKey: ["audit","shipments"],    queryFn: fetchAuditShipments,         staleTime: STALE });
export const useAuditCod             = () => useQuery({ queryKey: ["audit","cod"],          queryFn: fetchAuditCod,               staleTime: STALE });
export const useAuditInfluencerOrders= () => useQuery({ queryKey: ["audit","influencer"],   queryFn: fetchAuditInfluencerOrders,  staleTime: STALE });
export const useAuditSetProducts     = () => useQuery({ queryKey: ["audit","sets"],         queryFn: fetchAuditSetProducts,       staleTime: STALE });
export const useAuditRecognitionHealth= () => useQuery({ queryKey: ["audit","recognition"], queryFn: fetchAuditRecognitionHealth, staleTime: STALE });

// System Audit Center — KPI validation engine
export const useAuditRuns = (limit = 30) =>
  useQuery({ queryKey: ["audit-runs", limit], queryFn: () => fetchAuditRuns(limit), staleTime: 30_000 });

export const useAuditKpiResults = (runId: number | null) =>
  useQuery({ queryKey: ["audit-results", runId], queryFn: () => fetchAuditKpiResults(runId as number), enabled: runId != null, staleTime: 30_000 });

export function useRunKpiAudit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: runKpiAudit,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["audit-runs"] }); },
  });
}
