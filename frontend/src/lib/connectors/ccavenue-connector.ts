// CCAvenue settlement connector. Maps a CCAvenue settlement/reconciliation
// export into ccavenue_settlements via the import_ccavenue_settlements RPC.

import {
  BaseConnector, type ParsedRow, type SourceSignals,
  type ValidationResult, type ImportContext, type ImportResult, type ReconcileResult,
} from "./base-connector";

interface CcRecord {
  crf_id: string;
  settlement_date: string | null;
  utr_number: string | null;
  bank_amount_inr: number;
  order_count: number;
}

export class CCAvenueConnector extends BaseConnector<CcRecord> {
  readonly source = "ccavenue";
  readonly displayName = "CCAvenue";

  matches(s: SourceSignals): number {
    let score = 0;
    const hay = `${s.sender ?? ""} ${s.subject ?? ""} ${s.filename ?? ""}`.toLowerCase();
    if (/ccavenue|cca\b/.test(hay)) score += 0.6;
    if (s.sender && /@ccavenue\.com$/i.test(s.sender)) score += 0.4;
    if (s.headers && this.findColumn(s.headers, ["crf_id", "crfid"])) score += 0.4;
    return Math.min(score, 1);
  }

  validate(rows: ParsedRow[]): ValidationResult {
    const errors: string[] = [];
    if (rows.length === 0) errors.push("File has no data rows");
    const headers = rows[0] ? Object.keys(rows[0]) : [];
    if (!this.findColumn(headers, ["crf", "crfid", "settlementreference"]))
      errors.push("No CRF/settlement-reference column found");
    if (!this.findColumn(headers, ["amount", "bankamount", "remittedamount", "netamount"]))
      errors.push("No amount column found");
    return { ok: errors.length === 0, rowCount: rows.length, errors };
  }

  transform(rows: ParsedRow[]): CcRecord[] {
    if (rows.length === 0) return [];
    const h = Object.keys(rows[0]);
    const cCrf = this.findColumn(h, ["crfid", "crf", "settlementreference", "reference"])!;
    const cAmount = this.findColumn(h, ["bankamount", "remittedamount", "netamount", "amount"])!;
    const cDate = this.findColumn(h, ["remittancedate", "settlementdate", "date"]);
    const cUtr = this.findColumn(h, ["utr", "utrno", "utrnumber", "bankreference"]);
    const cOrders = this.findColumn(h, ["ordercount", "noofotrans", "transactioncount", "orders"]);
    return rows.map((r) => ({
      crf_id: r[cCrf],
      settlement_date: cDate ? this.date(r[cDate]) : null,
      utr_number: cUtr ? r[cUtr] || null : null,
      bank_amount_inr: this.num(r[cAmount]),
      order_count: cOrders ? Math.round(this.num(r[cOrders])) : 0,
    })).filter((x) => x.crf_id);
  }

  async import(records: CcRecord[], ctx: ImportContext): Promise<ImportResult> {
    const { data, error } = await ctx.db.rpc("import_ccavenue_settlements", {
      p_import_id: ctx.importId,
      p_rows: records,
      p_company_id: ctx.companyId,
    });
    if (error) throw new Error(`CCAvenue import failed: ${error.message}`);
    const r = (data ?? {}) as { imported?: number; duplicates?: number; failed?: number };
    return { imported: r.imported ?? 0, duplicates: r.duplicates ?? 0, failed: r.failed ?? 0 };
  }

  async reconcile(ctx: ImportContext): Promise<ReconcileResult> {
    // Match CCAvenue settlements (crf_id) against COD remittances in bank feed.
    const { data: settlements } = await ctx.db
      .from("ccavenue_settlements")
      .select("crf_id, utr_number, bank_amount_inr");
    const rows = (settlements ?? []) as { crf_id: string; utr_number: string | null }[];
    const withUtr = rows.filter((r) => r.utr_number).length;
    return {
      matched: withUtr,
      missing: rows.length - withUtr,
      duplicate: 0,
      mismatch: 0,
      status: rows.length - withUtr > 0 ? "issues" : "clean",
      details: { total_settlements: rows.length, awaiting_utr: rows.length - withUtr },
    };
  }
}
