import { supabase as db } from "@/lib/supabase/client";

export interface ImportHistoryRow {
  batch_id: number;
  source: string;
  origin: "email" | "manual" | "api";
  filename: string | null;
  status: string;
  records_imported: number;
  records_duplicate: number;
  records_failed: number;
  reconciliation_status: string | null;
  started_at: string;
  completed_at: string | null;
  email_sender: string | null;
  email_subject: string | null;
}

export interface ProcessImportResult {
  ok: boolean;
  source: string | null;
  imported: number;
  duplicates: number;
  failed: number;
  reconciliation?: { matched: number; missing: number; duplicate: number; mismatch: number; status: string };
  error?: string;
}

export async function fetchImportHistory(limit = 50): Promise<ImportHistoryRow[]> {
  const { data, error } = await db.rpc("get_import_center_history", { p_company_id: 1, p_limit: limit });
  if (error) throw error;
  return (data ?? []) as ImportHistoryRow[];
}

export async function processImport(file: File, source?: string): Promise<ProcessImportResult> {
  const fd = new FormData();
  fd.append("file", file);
  if (source) fd.append("source", source);
  const res = await fetch("/api/imports/process", { method: "POST", body: fd });
  return (await res.json()) as ProcessImportResult;
}
