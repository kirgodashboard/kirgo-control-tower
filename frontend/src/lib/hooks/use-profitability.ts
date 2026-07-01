"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchProfitabilityKpis,
  fetchProfitabilityTrend,
  fetchProductPl,
  fetchSkuPl,
  fetchCityPl,
  fetchLaunchPl,
  fetchCustomerPl,
  fetchTradingAccount,
} from "@/lib/data/profitability";

export function useProfitabilityKpis(start: string, end: string) {
  return useQuery({
    queryKey: ["profitability-kpis", start, end],
    queryFn: () => fetchProfitabilityKpis(start, end),
    staleTime: 5 * 60 * 1000,
  });
}

export function useProfitabilityTrend(start: string, end: string) {
  return useQuery({
    queryKey: ["profitability-trend", start, end],
    queryFn: () => fetchProfitabilityTrend(start, end),
    staleTime: 5 * 60 * 1000,
  });
}

export function useProductPl(start: string, end: string) {
  return useQuery({
    queryKey: ["product-pl", start, end],
    queryFn: () => fetchProductPl(start, end),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSkuPl(start: string, end: string) {
  return useQuery({
    queryKey: ["sku-pl", start, end],
    queryFn: () => fetchSkuPl(start, end),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCityPl(start: string, end: string) {
  return useQuery({
    queryKey: ["city-pl", start, end],
    queryFn: () => fetchCityPl(start, end),
    staleTime: 5 * 60 * 1000,
  });
}

export function useLaunchPl() {
  return useQuery({
    queryKey: ["launch-pl"],
    queryFn: fetchLaunchPl,
    staleTime: 10 * 60 * 1000,
  });
}

export function useTradingAccount(start: string, end: string) {
  return useQuery({
    queryKey: ["trading-account", start, end],
    queryFn: () => fetchTradingAccount(start, end),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCustomerPl(start: string, end: string) {
  return useQuery({
    queryKey: ["customer-pl", start, end],
    queryFn: () => fetchCustomerPl(start, end),
    staleTime: 5 * 60 * 1000,
  });
}
