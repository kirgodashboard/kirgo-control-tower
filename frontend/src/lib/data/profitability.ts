import { supabase } from "@/lib/supabase/client";
import type {
  ProfitabilityKpis,
  ProductPl,
  SkuPl,
  CityPl,
  LaunchPl,
  CustomerPl,
} from "@/types/kpi";

export async function fetchProfitabilityKpis(
  start: string,
  end: string,
): Promise<ProfitabilityKpis> {
  const { data, error } = await supabase.rpc("get_profitability_kpis", {
    p_start: start,
    p_end: end,
  });
  if (error) throw error;
  return data as ProfitabilityKpis;
}

export async function fetchProductPl(
  start: string,
  end: string,
): Promise<ProductPl[]> {
  const { data, error } = await supabase.rpc("get_product_pl", {
    p_start: start,
    p_end: end,
  });
  if (error) throw error;
  return (data ?? []) as ProductPl[];
}

export async function fetchSkuPl(
  start: string,
  end: string,
): Promise<SkuPl[]> {
  const { data, error } = await supabase.rpc("get_sku_pl", {
    p_start: start,
    p_end: end,
  });
  if (error) throw error;
  return (data ?? []) as SkuPl[];
}

export async function fetchCityPl(
  start: string,
  end: string,
): Promise<CityPl[]> {
  const { data, error } = await supabase.rpc("get_city_pl", {
    p_start: start,
    p_end: end,
  });
  if (error) throw error;
  return (data ?? []) as CityPl[];
}

export async function fetchLaunchPl(): Promise<LaunchPl[]> {
  const { data, error } = await supabase.rpc("get_launch_pl");
  if (error) throw error;
  return (data ?? []) as LaunchPl[];
}

export async function fetchCustomerPl(
  start: string,
  end: string,
): Promise<CustomerPl[]> {
  const { data, error } = await supabase.rpc("get_customer_pl", {
    p_start: start,
    p_end: end,
  });
  if (error) throw error;
  return (data ?? []) as CustomerPl[];
}
