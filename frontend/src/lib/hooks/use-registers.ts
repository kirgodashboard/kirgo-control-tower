"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchSalesRegister,
  fetchPurchaseRegister,
  fetchExpensesRegister,
  fetchReceiptsRegister,
  fetchPaymentsRegister,
  fetchWcSyncStatus,
  fetchOrderDetail,
  fetchLogisticsRegister,
  fetchCustomerRegister,
  fetchCustomerOrders,
} from "@/lib/data/registers";

export function useOrderDetail(orderId: number | null) {
  return useQuery({
    queryKey: ["order-detail", orderId],
    queryFn: () => fetchOrderDetail(orderId!),
    enabled: orderId !== null,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSalesRegister(params: {
  start?: string;
  end?: string;
  orderStatus?: string;
  paymentMethod?: string;
  city?: string;
}) {
  return useQuery({
    queryKey: ["sales-register", params],
    queryFn: () => fetchSalesRegister({ ...params, limit: 1000 }),
    staleTime: 2 * 60 * 1000,
  });
}

export function usePurchaseRegister(params: {
  start?: string;
  end?: string;
  supplier?: string;
  status?: string;
}) {
  return useQuery({
    queryKey: ["purchase-register", params],
    queryFn: () => fetchPurchaseRegister({ ...params, limit: 500 }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useExpensesRegister(params: {
  start?: string;
  end?: string;
  categoryId?: number;
  vendor?: string;
  bankAccountId?: number;
}) {
  return useQuery({
    queryKey: ["expenses-register", params],
    queryFn: () => fetchExpensesRegister({ ...params, limit: 500 }),
    staleTime: 2 * 60 * 1000,
  });
}

export function useReceiptsRegister(params: {
  start?: string;
  end?: string;
  bankAccountId?: number;
  type?: string;
}) {
  return useQuery({
    queryKey: ["receipts-register", params],
    queryFn: () => fetchReceiptsRegister({ ...params, limit: 500 }),
    staleTime: 2 * 60 * 1000,
  });
}

export function usePaymentsRegister(params: {
  start?: string;
  end?: string;
  bankAccountId?: number;
  type?: string;
}) {
  return useQuery({
    queryKey: ["payments-register", params],
    queryFn: () => fetchPaymentsRegister({ ...params, limit: 500 }),
    staleTime: 2 * 60 * 1000,
  });
}

export function useLogisticsRegister(params: {
  start?: string;
  end?: string;
  status?: string;
  paymentMethod?: string;
  courier?: string;
}) {
  return useQuery({
    queryKey: ["logistics-register", params],
    queryFn: () => fetchLogisticsRegister({ ...params, limit: 1000 }),
    staleTime: 2 * 60 * 1000,
  });
}

export function useCustomerRegister(params: {
  start?: string;
  end?: string;
  segment?: string;
  city?: string;
}) {
  return useQuery({
    queryKey: ["customer-register", params],
    queryFn: () => fetchCustomerRegister({ ...params, limit: 500 }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCustomerOrders(customerId: number | null) {
  return useQuery({
    queryKey: ["customer-orders", customerId],
    queryFn: () => fetchCustomerOrders(customerId!),
    enabled: customerId !== null,
    staleTime: 5 * 60 * 1000,
  });
}

export function useWcSyncStatus() {
  return useQuery({
    queryKey: ["wc-sync-status"],
    queryFn: fetchWcSyncStatus,
    staleTime: 5 * 60 * 1000,
  });
}
