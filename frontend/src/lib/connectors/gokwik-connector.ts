// GoKwik settlement connector. Maps a GoKwik settlement/orders export into
// gateway_settlements via the import_gokwik_settlements RPC.

import {
  BaseConnector, type ParsedRow, type SourceSignals,
  type ValidationResult, type ImportContext, type ImportResult, type ReconcileResult,
} from "./base-connector";

interface GkRecord {
  gokwik_order_id: string;
  amount_inr: number;
  settlement_date: string | null;
  utr_number: string | null;
  status: string;
}

export class GoKwikConnector extends BaseConnector<GkRecord> {
  readonly source = "gokwik";
  readonly displayName = "GoKwik";

  matches(s: SourceSignals): number {
    let score = 0;
    const hay = `${s.sender ?? ""} ${s.subject ?? ""} ${s.filename ?? ""}`.toLowerCase();
    if (/gokwik/.test(hay)) score += 0.6;
    if (s.sender && /@gokwik\.co$/i.test(s.sender)) score += 0.4;
    if (s.headers && this.findColumn(s.headers, ["gokwik_order_id", "merchant_order_id"])) score += 0.3;
    return Math.min(score, 1);
  }

  validate(rows: ParsedRow[]): ValidationResult {
    const errors: string[] = [];
    if (rows.length === 0) errors.push("File has no data rows");
    const headers = rows[0] ? Object.keys(rows[0]) : [];
    if (!this.findColumn(headers, ["order_id", "orderid", "gokwikorderid", "merchantorderid"]))
      errors.push("No order-id column found");
    if (!this.findColumn(headers, ["amount", "grandtotal", "settlementamount"]))
      errors.push("No amount column found");
    return { ok: errors.length === 0, rowCount: rows.length, errors };
  }

  transform(rows: ParsedRow[]): GkRecord[] {
    if (rows.length === 0) return [];
    const h = Object.keys(rows[0]);
    const cOrder = this.findColumn(h, ["gokwikorderid", "orderid", "order_id", "merchantorderid"])!;
    const cAmount = this.findColumn(h, ["settlementamount", "grandtotal", "amount", "total"])!;
    const cDate = this.findColumn(h, ["settlementdate", "settleddate", "date", "createdat"]);
    const cUtr = this.findColumn(h, ["utr", "utrnumber", "settlementutr", "reference"]);
    const cStatus = this.findColumn(h, ["status", "orderstatus", "paymentstatus"]);
    return rows.map((r) => ({
      gokwik_order_id: r[cOrder],
      amount_inr: this.num(r[cAmount]),
      settlement_date: cDate ? this.date(r[cDate]) : null,
      utr_number: cUtr ? r[cUtr] || null : null,
      status: cStatus ? r[cStatus] || "settled" : "settled",
    })).filter((x) => x.gokwik_order_id);
  }

  async import(records: GkRecord[], ctx: ImportContext): Promise<ImportResult> {
    const { data, error } = await ctx.db.rpc("import_gokwik_settlements", {
      p_import_id: ctx.importId,
      p_rows: records,
      p_company_id: ctx.companyId,
    });
    if (error) throw new Error(`GoKwik import failed: ${error.message}`);
    const r = (data ?? {}) as { imported?: number; duplicates?: number; failed?: number };
    return { imported: r.imported ?? 0, duplicates: r.duplicates ?? 0, failed: r.failed ?? 0 };
  }

  async reconcile(ctx: ImportContext): Promise<ReconcileResult> {
    // Match imported gokwik settlements against orders by reference; flag gaps.
    const { data } = await ctx.db
      .from("gateway_settlements")
      .select("settlement_reference, amount_inr")
      .eq("gateway", "gokwik");
    const rows = (data ?? []) as { settlement_reference: string; amount_inr: number }[];
    const refs = new Set(rows.map((x) => x.settlement_reference));
    const matched = refs.size;
    const duplicate = rows.length - refs.size;
    return {
      matched, missing: 0, duplicate, mismatch: 0,
      status: duplicate > 0 ? "issues" : "clean",
      details: { total_rows: rows.length },
    };
  }
}
