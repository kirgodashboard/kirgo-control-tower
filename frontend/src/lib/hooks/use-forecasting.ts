import { useQuery } from "@tanstack/react-query";
import {
  fetchRevenueForecast,
  fetchCashFlowForecast,
  fetchCustomerForecast,
  fetchForecastChartData,
} from "@/lib/data/forecasting";

export function useRevenueForecast() {
  return useQuery({
    queryKey: ["forecasting", "revenue"],
    queryFn: fetchRevenueForecast,
    staleTime: 60_000,
  });
}

export function useCashFlowForecast() {
  return useQuery({
    queryKey: ["forecasting", "cashflow"],
    queryFn: fetchCashFlowForecast,
    staleTime: 60_000,
  });
}

export function useCustomerForecast() {
  return useQuery({
    queryKey: ["forecasting", "customers"],
    queryFn: fetchCustomerForecast,
    staleTime: 60_000,
  });
}

export function useForecastChartData() {
  return useQuery({
    queryKey: ["forecasting", "chart"],
    queryFn: fetchForecastChartData,
    staleTime: 60_000,
  });
}
