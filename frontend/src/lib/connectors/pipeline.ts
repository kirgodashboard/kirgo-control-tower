// Shared import pipeline — used by both the manual Import Center upload route
// and the email-inbound webhook. Source-agnostic: resolves a connector, then
// runs validate → parse → transform → import → reconcile, recording
// settlement_imports + import_batches rows. (Parts D2/D4/E)

import { makeSupabaseAdmin } from "@/lib/supabase/server";
import { getConnector, identifySource } from "./registry";
import type { ReconcileResult } from "./base-connector";

export interface PipelineInput {
  buffer: Buffer;
  filename: string;
  source?: string;                 // explicit source key; else auto-detect
  companyId?: number;
  origin?: "manual" | "email" | "api";
  emailFrom?: string | null;
  emailSubject?: string | null;
  emailAttachmentId?: number | null;
}

export interface PipelineResult {
  ok: boolean;
  source: string | null;
  importId?: number;
  batchId?: number;
  rowCount: number;
  imported: number;
  duplicates: number;
  failed: number;
  reconciliation?: ReconcileResult;
  error?: string;
}

export async function runImportPipeline(input: PipelineInput): Promise<PipelineResult> {
  const db = makeSupabaseAdmin();
  const companyId = input.companyId ?? 1;
  const origin = input.origin ?? "manual";

  // 1. Resolve connector (explicit source wins; else identify by signals)
  let connector = input.source ? getConnector(input.source) : null;
  if (!connector) {
    const hit = identifySource({ sender: input.emailFrom, subject: input.emailSubject, filename: input.filename });
    connector = hit?.connector ?? null;
  }
  if (!connector) {
    return { ok: false, source: null, rowCount: 0, imported: 0, duplicates: 0, failed: 0,
      error: "Could not identify source (no matching connector)" };
  }

  // 2. Parse + validate
  const rows = connector.parse(input.buffer, input.filename);
  const valid = connector.validate(rows);

  // 3. Record the import (settlement_imports drives the import RPCs)
  const { data: imp, error: impErr } = await db.from("settlement_imports").insert({
    gateway: connector.source, company_id: companyId, file_name: input.filename,
    file_size_bytes: input.buffer.length, source: origin === "email" ? "email" : "manual",
    email_from: input.emailFrom ?? null, email_subject: input.emailSubject ?? null,
    status: valid.ok ? "processing" : "failed", row_count: valid.rowCount,
    error_summary: valid.ok ? null : valid.errors.join("; "),
  }).select("id").single();
  if (impErr || !imp) {
    return { ok: false, source: connector.source, rowCount: valid.rowCount, imported: 0, duplicates: 0, failed: 0,
      error: impErr?.message ?? "Failed to create import record" };
  }
  const importId = imp.id as number;

  if (!valid.ok) {
    await createBatch(db, companyId, connector.source, origin, importId, input.emailAttachmentId, "failed", 0, 0, 0, null, valid.errors.join("; "));
    return { ok: false, source: connector.source, importId, rowCount: valid.rowCount, imported: 0, duplicates: 0, failed: 0,
      error: valid.errors.join("; ") };
  }

  // 4. Transform + import (the import RPC updates settlement_imports counts/status)
  try {
    const records = connector.transform(rows);
    const result = await connector.import(records, { db, companyId, importId });

    // 5. Reconcile (Part E)
    let reconciliation: ReconcileResult | undefined;
    try { reconciliation = await connector.reconcile({ db, companyId, importId }); }
    catch { /* reconciliation best-effort */ }

    const batchId = await createBatch(
      db, companyId, connector.source, origin, importId, input.emailAttachmentId,
      "completed", result.imported, result.duplicates, result.failed,
      reconciliation ? reconciliation.status : null,
      reconciliation ? JSON.stringify(reconciliation) : null,
    );

    return {
      ok: true, source: connector.source, importId, batchId,
      rowCount: valid.rowCount, imported: result.imported, duplicates: result.duplicates,
      failed: result.failed, reconciliation,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from("settlement_imports").update({ status: "failed", error_summary: msg }).eq("id", importId);
    await createBatch(db, companyId, connector.source, origin, importId, input.emailAttachmentId, "failed", 0, 0, 0, null, msg);
    return { ok: false, source: connector.source, importId, rowCount: valid.rowCount, imported: 0, duplicates: 0, failed: 0, error: msg };
  }
}

async function createBatch(
  db: ReturnType<typeof makeSupabaseAdmin>, companyId: number, source: string,
  origin: string, importId: number, attachmentId: number | null | undefined,
  status: string, imported: number, duplicate: number, failed: number,
  reconStatus: string | null, reconSummaryOrError: string | null,
): Promise<number | undefined> {
  const isError = status === "failed";
  const { data } = await db.from("import_batches").insert({
    company_id: companyId, source, origin, settlement_import_id: importId,
    email_attachment_id: attachmentId ?? null, status,
    records_imported: imported, records_duplicate: duplicate, records_failed: failed,
    reconciliation_status: reconStatus,
    reconciliation_summary: isError ? null : (reconSummaryOrError ? JSON.parse(reconSummaryOrError) : null),
    error_summary: isError ? reconSummaryOrError : null,
    completed_at: new Date().toISOString(),
  }).select("id").single();
  return data?.id as number | undefined;
}
