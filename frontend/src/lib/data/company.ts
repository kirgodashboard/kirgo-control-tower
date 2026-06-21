import { supabase } from "@/lib/supabase/client";
import type {
  CompanySettings,
  UserRole,
  NotificationPreference,
  SystemInfo,
  SettingsDataQuality,
} from "@/types/company";

export async function fetchCompanySettings(): Promise<CompanySettings | null> {
  const { data, error } = await supabase.rpc("get_company_settings", { p_company_id: 1 });
  if (error) throw error;
  return (data as CompanySettings[])?.[0] ?? null;
}

export async function saveCompanySettings(
  settings: Partial<CompanySettings>,
): Promise<CompanySettings> {
  const { data, error } = await supabase.rpc("upsert_company_settings", {
    p_company_id:           1,
    p_company_name:         settings.company_name         ?? null,
    p_brand_name:           settings.brand_name           ?? null,
    p_logo_url:             settings.logo_url             ?? null,
    p_gst_number:           settings.gst_number           ?? null,
    p_pan_number:           settings.pan_number           ?? null,
    p_financial_year_start: settings.financial_year_start ?? null,
    p_currency:             settings.currency             ?? null,
    p_timezone:             settings.timezone             ?? null,
    p_address_line1:        settings.address_line1        ?? null,
    p_address_line2:        settings.address_line2        ?? null,
    p_city:                 settings.city                 ?? null,
    p_state:                settings.state                ?? null,
    p_pincode:              settings.pincode              ?? null,
    p_country:              settings.country              ?? null,
    p_support_email:        settings.support_email        ?? null,
  });
  if (error) throw error;
  return (data as CompanySettings[])[0];
}

export async function fetchUserRoles(): Promise<UserRole[]> {
  const { data, error } = await supabase.rpc("get_user_roles", { p_company_id: 1 });
  if (error) throw error;
  return (data ?? []) as UserRole[];
}

export async function saveUserRole(params: {
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
}): Promise<UserRole> {
  const { data, error } = await supabase.rpc("upsert_user_role", {
    p_company_id: 1,
    p_email:      params.email,
    p_full_name:  params.full_name,
    p_role:       params.role,
    p_is_active:  params.is_active,
  });
  if (error) throw error;
  return (data as UserRole[])[0];
}

export async function fetchNotificationPreferences(): Promise<NotificationPreference[]> {
  const { data, error } = await supabase.rpc("get_notification_preferences", { p_company_id: 1 });
  if (error) throw error;
  return (data ?? []) as NotificationPreference[];
}

export async function saveNotificationPreference(params: {
  notification_type: string;
  channel: string;
  is_enabled: boolean;
  recipients?: string[];
  webhook_url?: string;
}): Promise<NotificationPreference> {
  const { data, error } = await supabase.rpc("upsert_notification_preference", {
    p_company_id:        1,
    p_notification_type: params.notification_type,
    p_channel:           params.channel,
    p_is_enabled:        params.is_enabled,
    p_recipients:        params.recipients ?? null,
    p_webhook_url:       params.webhook_url ?? null,
  });
  if (error) throw error;
  return (data as NotificationPreference[])[0];
}

export async function fetchSystemInfo(): Promise<SystemInfo> {
  const { data, error } = await supabase.rpc("get_system_info");
  if (error) throw error;
  return data as SystemInfo;
}

export async function fetchSettingsDataQuality(): Promise<SettingsDataQuality> {
  const { data, error } = await supabase.rpc("get_settings_data_quality", { p_company_id: 1 });
  if (error) throw error;
  return data as SettingsDataQuality;
}
