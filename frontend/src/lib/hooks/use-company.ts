import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchCompanySettings,
  saveCompanySettings,
  fetchUserRoles,
  saveUserRole,
  fetchNotificationPreferences,
  saveNotificationPreference,
  fetchSystemInfo,
  fetchSettingsDataQuality,
} from "@/lib/data/company";
import type { CompanySettings } from "@/types/company";

export function useCompanySettings() {
  return useQuery({
    queryKey: ["company-settings"],
    queryFn:  fetchCompanySettings,
    staleTime: 60_000,
  });
}

export function useSaveCompanySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings: Partial<CompanySettings>) => saveCompanySettings(settings),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-settings"] }),
  });
}

export function useUserRoles() {
  return useQuery({
    queryKey: ["user-roles"],
    queryFn:  fetchUserRoles,
    staleTime: 60_000,
  });
}

export function useSaveUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveUserRole,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user-roles"] }),
  });
}

export function useNotificationPreferences() {
  return useQuery({
    queryKey: ["notification-preferences"],
    queryFn:  fetchNotificationPreferences,
    staleTime: 60_000,
  });
}

export function useSaveNotificationPreference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveNotificationPreference,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notification-preferences"] }),
  });
}

export function useSystemInfo() {
  return useQuery({
    queryKey: ["system-info"],
    queryFn:  fetchSystemInfo,
    staleTime: 30_000,
  });
}

export function useSettingsDataQuality() {
  return useQuery({
    queryKey: ["settings-data-quality"],
    queryFn:  fetchSettingsDataQuality,
    staleTime: 60_000,
  });
}
