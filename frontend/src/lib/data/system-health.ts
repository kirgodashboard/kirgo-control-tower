import { supabase } from "@/lib/supabase/client";
import type { SystemHealth } from "@/types/system-health";

export async function fetchSystemHealth(): Promise<SystemHealth> {
  const { data, error } = await supabase.rpc("get_system_health");
  if (error) throw error;
  return data as SystemHealth;
}
