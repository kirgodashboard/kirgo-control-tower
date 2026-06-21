import { supabase } from "@/lib/supabase/client";
import type {
  RevenueForecast,
  CashFlowForecast,
  CustomerForecastPoint,
  ForecastChartPoint,
} from "@/types/kpi";

export async function fetchRevenueForecast(): Promise<RevenueForecast> {
  const { data, error } = await supabase.rpc("get_revenue_forecast");
  if (error) throw error;
  return data as RevenueForecast;
}

export async function fetchCashFlowForecast(): Promise<CashFlowForecast> {
  const { data, error } = await supabase.rpc("get_cash_flow_forecast");
  if (error) throw error;
  return data as CashFlowForecast;
}

export async function fetchCustomerForecast(): Promise<CustomerForecastPoint[]> {
  const { data, error } = await supabase.rpc("get_customer_forecast");
  if (error) throw error;
  return (data ?? []) as CustomerForecastPoint[];
}

export async function fetchForecastChartData(): Promise<ForecastChartPoint[]> {
  const { data, error } = await supabase.rpc("get_forecast_chart_data");
  if (error) throw error;
  return (data ?? []) as ForecastChartPoint[];
}
