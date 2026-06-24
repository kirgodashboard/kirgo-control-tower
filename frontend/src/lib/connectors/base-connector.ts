// Connector framework — generic base for all import sources (Part D4).
// Each connector implements validate/parse/transform/import/reconcile so the
// core ingestion pipeline stays source-agnostic. Add a new source by
// subclassing BaseConnector and registering it — no changes to the core.

import * as XLSX from "xlsx";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ParsedRow = Record<string, string>;

export interface SourceSignals {
  sender?: string | null;
  subject?: string | null;
  filename?: string | null;
  headers?: string[];
}

export interface ValidationResult {
  ok: boolean;
  rowCount: number;
  errors: string[];
}

export interface ImportContext {
  db: SupabaseClient;
  companyId: number;
  importId: number;          // settlement_imports.id (or batch source id)
  batchId?: number;          // import_batches.id
}

export interface ImportResult {
  imported: number;
  duplicates: number;
  failed: number;
}

export interface ReconcileResult {
  matched: number;
  missing: number;
  duplicate: number;
  mismatch: number;
  status: "clean" | "issues";
  details?: Record<string, unknown>;
}

export abstract class BaseConnector<TRecord = Record<string, unknown>> {
  abstract readonly source: string;       // canonical key, e.g. "gokwik"
  abstract readonly displayName: string;

  // ── Source identification (D3) — return 0..1 confidence ───────────
  abstract matches(signals: SourceSignals): number;

  // ── Pipeline (D4) ─────────────────────────────────────────────────
  abstract validate(rows: ParsedRow[]): ValidationResult;
  abstract transform(rows: ParsedRow[]): TRecord[];
  abstract import(records: TRecord[], ctx: ImportContext): Promise<ImportResult>;
  abstract reconcile(ctx: ImportContext): Promise<ReconcileResult>;

  // ── Shared parsing (CSV/XLSX → rows keyed by trimmed header) ──────
  parse(buffer: Buffer, _filename?: string): ParsedRow[] {
    const wb = XLSX.read(buffer, { type: "buffer", cellText: true, cellDates: false });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" });
    if (raw.length < 2) return [];

    let headerRow = 0;
    for (let i = 0; i < Math.min(raw.length, 10); i++) {
      const nonEmpty = (raw[i] as string[]).filter((c) => String(c).trim() !== "").length;
      if (nonEmpty >= 3) { headerRow = i; break; }
    }
    const headers = (raw[headerRow] as string[]).map((h) => String(h).trim());
    return (raw.slice(headerRow + 1) as string[][])
      .filter((r) => r.some((c) => String(c).trim() !== ""))
      .map((r) => Object.fromEntries(headers.map((h, i) => [h, String(r[i] ?? "").trim()])));
  }

  // ── Helpers shared across connectors ──────────────────────────────
  protected norm(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  protected findColumn(headers: string[], candidates: string[]): string | null {
    for (const h of headers) {
      const n = this.norm(h);
      if (candidates.some((c) => n.includes(this.norm(c)))) return h;
    }
    return null;
  }

  protected num(v: unknown): number {
    if (v == null || v === "") return 0;
    const n = parseFloat(String(v).replace(/[,\s₹]/g, "").trim());
    return isNaN(n) ? 0 : n;
  }

  protected date(v: string): string | null {
    if (!v) return null;
    const s = v.trim();
    let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    m = s.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})/);
    if (m) return s.substring(0, 10);
    const months: Record<string, string> = {
      jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
      jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
    };
    m = s.match(/^(\d{1,2})[\s\-]([A-Za-z]{3})[\s\-](\d{4})$/);
    if (m && months[m[2].toLowerCase()]) return `${m[3]}-${months[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}`;
    return null;
  }
}
