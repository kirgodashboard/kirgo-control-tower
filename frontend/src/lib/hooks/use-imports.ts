import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchImportHistory, processImport } from "@/lib/data/imports";

export function useImportHistory(limit = 50) {
  return useQuery({
    queryKey: ["import-history", limit],
    queryFn: () => fetchImportHistory(limit),
    staleTime: 30_000,
  });
}

export function useProcessImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, source }: { file: File; source?: string }) => processImport(file, source),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["import-history"] }); },
  });
}
