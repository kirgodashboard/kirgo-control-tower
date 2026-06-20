import { supabase } from "@/lib/supabase/client";
import type {
  InventoryKpis,
  StockPositionRow,
  StockMovementRow,
  StockAgeingRow,
  ReorderRow,
} from "@/types/kpi";

export async function fetchInventoryKpis(): Promise<InventoryKpis> {
  const { data, error } = await supabase.rpc("get_inventory_kpis");
  if (error) throw error;
  return data as InventoryKpis;
}

export async function fetchStockPosition(
  search?: string | null,
  limit = 200,
  offset = 0,
): Promise<StockPositionRow[]> {
  const { data, error } = await supabase.rpc("get_stock_position", {
    p_search: search ?? null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return (data ?? []) as StockPositionRow[];
}

export async function fetchStockMovements(
  itemId?: number | null,
  limit = 200,
): Promise<StockMovementRow[]> {
  const { data, error } = await supabase.rpc("get_stock_movements", {
    p_item_id: itemId ?? null,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as StockMovementRow[];
}

export async function fetchStockAgeing(): Promise<StockAgeingRow[]> {
  const { data, error } = await supabase.rpc("get_stock_ageing");
  if (error) throw error;
  return (data ?? []) as StockAgeingRow[];
}

export async function fetchReorderReport(): Promise<ReorderRow[]> {
  const { data, error } = await supabase.rpc("get_reorder_report");
  if (error) throw error;
  return (data ?? []) as ReorderRow[];
}
