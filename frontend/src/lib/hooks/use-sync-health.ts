import { useQuery } from "@tanstack/react-query";
import { fetchSyncHealth } from "@/lib/data/sync-health";

export function useSyncHealth() {
  return useQuery({
    queryKey: ["sync-health"],
    queryFn:  fetchSyncHealth,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}
