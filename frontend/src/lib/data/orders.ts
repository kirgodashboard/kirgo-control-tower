import { supabase } from "@/lib/supabase/client";
import type {
  ClassificationSummaryItem,
  OrderClass,
  OrderClassificationRow,
  ReceivablesSummary,
  ReceivablesListItem,
} from "@/types/kpi";

export async function fetchClassificationSummary(): Promise<ClassificationSummaryItem[]> {
  const { data, error } = await supabase.rpc("get_classification_summary");
  if (error) throw error;
  return (data ?? []) as ClassificationSummaryItem[];
}

export async function fetchOrdersByClassification(
  classification?: string | null,
  limit = 100,
  offset = 0,
  undeliveredOnly = false,
): Promise<OrderClassificationRow[]> {
  const { data, error } = await supabase.rpc("get_orders_by_classification", {
    p_classification: classification ?? null,
    p_limit: limit,
    p_offset: offset,
    p_undelivered_only: undeliveredOnly,
  });
  if (error) throw error;
  return (data ?? []) as OrderClassificationRow[];
}

export async function classifyOrder(
  orderId: number,
  classification: OrderClass,
  notes?: string,
): Promise<void> {
  const { error } = await supabase.rpc("classify_order", {
    p_order_id:       orderId,
    p_classification: classification,
    p_notes:          notes ?? null,
  });
  if (error) throw error;
}

export async function autoClassifyOrders(): Promise<number> {
  const { data, error } = await supabase.rpc("auto_classify_orders");
  if (error) throw error;
  return data as number;
}

export async function fetchReceivablesSummary(): Promise<ReceivablesSummary> {
  const { data, error } = await supabase.rpc("get_receivables_summary");
  if (error) throw error;
  return data as ReceivablesSummary;
}

export async function fetchReceivablesList(limit = 100): Promise<ReceivablesListItem[]> {
  const { data, error } = await supabase.rpc("get_receivables_list", { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as ReceivablesListItem[];
}
