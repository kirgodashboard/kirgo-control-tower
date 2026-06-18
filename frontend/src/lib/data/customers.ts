import { supabase } from "@/lib/supabase/client";
import type { CustomerKpis } from "@/types/kpi";

export async function fetchCustomerKpis(start: string, end: string): Promise<CustomerKpis> {
  const { data, error } = await supabase.rpc("get_customer_kpis", { p_start: start, p_end: end });
  if (error) throw error;
  return data as CustomerKpis;
}

export async function fetchCustomerGrowth() {
  const { data, error } = await supabase
    .from("v_customer_growth_monthly")
    .select("*")
    .order("cohort_month");
  if (error) throw error;
  return data ?? [];
}

export async function fetchTopCities() {
  const { data, error } = await supabase
    .from("v_top_cities")
    .select("*")
    .order("revenue_inr", { ascending: false })
    .limit(10);
  if (error) throw error;
  return data ?? [];
}
