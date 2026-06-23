import { useQuery } from "@tanstack/react-query";
import {
  fetchAuditRevenue, fetchAuditOrders, fetchAuditShipments,
  fetchAuditCod, fetchAuditInfluencerOrders, fetchAuditSetProducts,
  fetchAuditRecognitionHealth,
} from "@/lib/data/audit";

const STALE = 60_000; // 1 min — audit data doesn't need real-time freshness

export const useAuditRevenue         = () => useQuery({ queryKey: ["audit","revenue"],      queryFn: fetchAuditRevenue,           staleTime: STALE });
export const useAuditOrders          = () => useQuery({ queryKey: ["audit","orders"],       queryFn: fetchAuditOrders,            staleTime: STALE });
export const useAuditShipments       = () => useQuery({ queryKey: ["audit","shipments"],    queryFn: fetchAuditShipments,         staleTime: STALE });
export const useAuditCod             = () => useQuery({ queryKey: ["audit","cod"],          queryFn: fetchAuditCod,               staleTime: STALE });
export const useAuditInfluencerOrders= () => useQuery({ queryKey: ["audit","influencer"],   queryFn: fetchAuditInfluencerOrders,  staleTime: STALE });
export const useAuditSetProducts     = () => useQuery({ queryKey: ["audit","sets"],         queryFn: fetchAuditSetProducts,       staleTime: STALE });
export const useAuditRecognitionHealth= () => useQuery({ queryKey: ["audit","recognition"], queryFn: fetchAuditRecognitionHealth, staleTime: STALE });
