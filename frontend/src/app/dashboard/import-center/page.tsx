"use client";

import { useRef, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { useImportHistory, useProcessImport } from "@/lib/hooks/use-imports";
import { formatCount } from "@/lib/utils/format";
import { UploadCloud, Loader2, CheckCircle2, XCircle, Mail, FileUp } from "lucide-react";
import type { ProcessImportResult } from "@/lib/data/imports";

const SOURCES = [
  { value: "", label: "Auto-detect" },
  { value: "gokwik", label: "GoKwik" },
  { value: "ccavenue", label: "CCAvenue" },
];

function statusPill(status: string) {
  const map: Record<string, string> = {
    completed: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    failed: "bg-red-500/10 text-red-500 border-red-500/20",
    pending: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  };
  return map[status] ?? "bg-muted text-muted-foreground border-border";
}

export default function ImportCenterPage() {
  const { data: history = [], isLoading } = useImportHistory(50);
  const processMutation = useProcessImport();
  const fileRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState("");
  const [lastResult, setLastResult] = useState<ProcessImportResult | null>(null);

  async function handleFile(file: File) {
    setLastResult(null);
    const result = await processMutation.mutateAsync({ file, source: source || undefined });
    setLastResult(result);
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Import Center"
        subtitle="Upload settlement files manually, or let the email inbox ingest them automatically"
      />

      {/* Upload panel */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          >
            {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={processMutation.isPending}
            className="inline-flex items-center gap-2 rounded-md bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
          >
            {processMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            {processMutation.isPending ? "Processing…" : "Upload settlement file"}
          </button>
          <input
            ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
          />
          <span className="text-xs text-muted-foreground">CSV or XLSX · GoKwik / CCAvenue</span>
        </div>

        {lastResult && (
          <div className={`mt-4 flex items-start gap-3 rounded-lg border p-3 text-sm ${lastResult.ok ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5"}`}>
            {lastResult.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" /> : <XCircle className="mt-0.5 h-4 w-4 text-red-500" />}
            <div>
              {lastResult.ok ? (
                <>
                  <span className="font-medium">Imported {formatCount(lastResult.imported)} {lastResult.source} records</span>
                  {" · "}{formatCount(lastResult.duplicates)} duplicates, {formatCount(lastResult.failed)} failed
                  {lastResult.reconciliation && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Reconciliation: {lastResult.reconciliation.matched} matched · {lastResult.reconciliation.missing} missing · {lastResult.reconciliation.mismatch} mismatch
                    </div>
                  )}
                </>
              ) : (
                <span className="font-medium text-red-500">{lastResult.error}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* History */}
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Import history</span>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : history.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No imports yet. Upload a file or wait for the email inbox.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-5 py-2 font-medium">When</th>
                <th className="px-5 py-2 font-medium">Source</th>
                <th className="px-5 py-2 font-medium">Origin</th>
                <th className="px-5 py-2 font-medium">File</th>
                <th className="px-5 py-2 text-right font-medium">Imported</th>
                <th className="px-5 py-2 text-right font-medium">Dup</th>
                <th className="px-5 py-2 text-right font-medium">Failed</th>
                <th className="px-5 py-2 font-medium">Reconciliation</th>
                <th className="px-5 py-2 text-center font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.batch_id} className="border-t border-border/60">
                  <td className="px-5 py-2.5 text-xs text-muted-foreground">{new Date(h.started_at).toLocaleString()}</td>
                  <td className="px-5 py-2.5 font-medium capitalize">{h.source}</td>
                  <td className="px-5 py-2.5">
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      {h.origin === "email" ? <Mail className="h-3 w-3" /> : <FileUp className="h-3 w-3" />}
                      {h.origin}
                    </span>
                  </td>
                  <td className="px-5 py-2.5 text-xs text-muted-foreground">{h.filename ?? h.email_subject ?? "—"}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{formatCount(h.records_imported)}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">{formatCount(h.records_duplicate)}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{h.records_failed > 0 ? <span className="text-red-500">{formatCount(h.records_failed)}</span> : "0"}</td>
                  <td className="px-5 py-2.5 text-xs text-muted-foreground capitalize">{h.reconciliation_status ?? "—"}</td>
                  <td className="px-5 py-2.5 text-center">
                    <span className={`rounded-md border px-2 py-0.5 text-[11px] ${statusPill(h.status)}`}>{h.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
