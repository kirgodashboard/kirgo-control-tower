"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchDataQualitySummary } from "@/lib/data/data-quality";

export function useDataQuality() {
  return useQuery({
    queryKey: ["data-quality"],
    queryFn: fetchDataQualitySummary,
    staleTime: 60_000,
  });
}
