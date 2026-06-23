import { supabase } from "@/lib/supabase/client";
import type {
  SalesRegisterRow,
  PurchaseRegisterRow,
  ExpensesRegisterRow,
  ReceiptRow,
  PaymentRow,
  WcSyncStatus,
  OrderDetail,
  LogisticsRegisterRow,
  CustomerRegisterRow,
  CustomerOrderRow,
} from "@/types/registers";

export async function fetchOrderDetail(orderId: number): Promise<OrderDetail | null> {
  const { data, error } = await supabase.rpc("get_order_detail", { p_order_id: orderId });
  if (error) throw error;
  return (data as OrderDetail) ?? null;
}

export async function fetchSalesRegister(params: {
  start?: string;
  end?: string;
  orderStatus?: string;
  paymentMethod?: string;
  city?: string;
  limit?: number;
  offset?: number;
}): Promise<SalesRegisterRow[]> {
  const { data, error } = await supabase.rpc("get_sales_register", {
    p_start:          params.start          ?? null,
    p_end:            params.end            ?? null,
    p_order_status:   params.orderStatus    ?? null,
    p_payment_method: params.paymentMethod  ?? null,
    p_city:           params.city           ?? null,
    p_limit:          params.limit          ?? 500,
    p_offset:         params.offset         ?? 0,
  });
  if (error) throw error;
  return (data ?? []) as SalesRegisterRow[];
}

export async function fetchPurchaseRegister(params: {
  start?: string;
  end?: string;
  supplier?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<PurchaseRegisterRow[]> {
  const { data, error } = await supabase.rpc("get_purchase_register", {
    p_start:    params.start    ?? null,
    p_end:      params.end      ?? null,
    p_supplier: params.supplier ?? null,
    p_status:   params.status   ?? null,
    p_limit:    params.limit    ?? 500,
    p_offset:   params.offset   ?? 0,
  });
  if (error) throw error;
  return (data ?? []) as PurchaseRegisterRow[];
}

export async function fetchExpensesRegister(params: {
  start?: string;
  end?: string;
  categoryId?: number;
  vendor?: string;
  bankAccountId?: number;
  limit?: number;
  offset?: number;
}): Promise<ExpensesRegisterRow[]> {
  const { data, error } = await supabase.rpc("get_expenses_register", {
    p_start:           params.start         ?? null,
    p_end:             params.end           ?? null,
    p_category_id:     params.categoryId    ?? null,
    p_vendor:          params.vendor        ?? null,
    p_bank_account_id: params.bankAccountId ?? null,
    p_limit:           params.limit         ?? 500,
    p_offset:          params.offset        ?? 0,
  });
  if (error) throw error;
  return (data ?? []) as ExpensesRegisterRow[];
}

export async function fetchReceiptsRegister(params: {
  start?: string;
  end?: string;
  bankAccountId?: number;
  type?: string;
  limit?: number;
  offset?: number;
}): Promise<ReceiptRow[]> {
  const { data, error } = await supabase.rpc("get_receipts_register", {
    p_start:           params.start         ?? null,
    p_end:             params.end           ?? null,
    p_bank_account_id: params.bankAccountId ?? null,
    p_type:            params.type          ?? null,
    p_limit:           params.limit         ?? 500,
    p_offset:          params.offset        ?? 0,
  });
  if (error) throw error;
  return (data ?? []) as ReceiptRow[];
}

export async function fetchPaymentsRegister(params: {
  start?: string;
  end?: string;
  bankAccountId?: number;
  type?: string;
  limit?: number;
  offset?: number;
}): Promise<PaymentRow[]> {
  const { data, error } = await supabase.rpc("get_payments_register", {
    p_start:           params.start         ?? null,
    p_end:             params.end           ?? null,
    p_bank_account_id: params.bankAccountId ?? null,
    p_type:            params.type          ?? null,
    p_limit:           params.limit         ?? 500,
    p_offset:          params.offset        ?? 0,
  });
  if (error) throw error;
  return (data ?? []) as PaymentRow[];
}

export async function fetchLogisticsRegister(params: {
  start?: string;
  end?: string;
  status?: string;
  paymentMethod?: string;
  courier?: string;
  limit?: number;
  offset?: number;
}): Promise<LogisticsRegisterRow[]> {
  const { data, error } = await supabase.rpc("get_logistics_register", {
    p_start:          params.start         ?? null,
    p_end:            params.end           ?? null,
    p_status:         params.status        ?? null,
    p_payment_method: params.paymentMethod ?? null,
    p_courier:        params.courier       ?? null,
    p_limit:          params.limit         ?? 1000,
    p_offset:         params.offset        ?? 0,
  });
  if (error) throw error;
  return (data ?? []) as LogisticsRegisterRow[];
}

export async function fetchCustomerRegister(params: {
  start?: string;
  end?: string;
  segment?: string;
  city?: string;
  limit?: number;
  offset?: number;
}): Promise<CustomerRegisterRow[]> {
  const { data, error } = await supabase.rpc("get_customer_register", {
    p_start:   params.start   ?? null,
    p_end:     params.end     ?? null,
    p_segment: params.segment ?? null,
    p_city:    params.city    ?? null,
    p_limit:   params.limit   ?? 500,
    p_offset:  params.offset  ?? 0,
  });
  if (error) throw error;
  return (data ?? []) as CustomerRegisterRow[];
}

export async function fetchCustomerOrders(customerId: number): Promise<CustomerOrderRow[]> {
  const { data, error } = await supabase.rpc("get_customer_orders", { p_customer_id: customerId });
  if (error) throw error;
  return (data ?? []) as CustomerOrderRow[];
}

export async function fetchWcSyncStatus(): Promise<WcSyncStatus> {
  const { data, error } = await supabase.rpc("get_wc_sync_status");
  if (error) throw error;
  return data as WcSyncStatus;
}
