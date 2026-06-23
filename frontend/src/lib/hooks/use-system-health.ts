"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchSystemHealth } from "@/lib/data/system-health";

export function useSystemHealth() {
  return useQuery({
    queryKey: ["system-health"],
    queryFn: fetchSystemHealth,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}
