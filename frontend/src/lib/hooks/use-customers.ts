"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchCustomerKpis, fetchCustomerGrowth, fetchTopCities } from "@/lib/data/customers";

export function useCustomerKpis(start: string, end: string) {
  return useQuery({
    queryKey: ["customer-kpis", start, end],
    queryFn: () => fetchCustomerKpis(start, end),
    staleTime: 2 * 60 * 1000,
  });
}

export function useCustomerGrowth() {
  return useQuery({
    queryKey: ["customer-growth"],
    queryFn: fetchCustomerGrowth,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTopCities() {
  return useQuery({
    queryKey: ["top-cities"],
    queryFn: fetchTopCities,
    staleTime: 5 * 60 * 1000,
  });
}
