"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { useMetricCatalog } from "@/lib/hooks/use-governance";

/**
 * Info icon that opens the canonical definition of a KPI from metric_catalog.
 * Usage: <KpiInfo metricKey="gross_revenue" />
 */
export function KpiInfo({ metricKey }: { metricKey: string }) {
  const [open, setOpen] = useState(false);
  const { data: catalog } = useMetricCatalog();
  const entry = catalog?.find((m) => m.metric_key === metricKey);

  if (!entry) {
    return (
      <button
        type="button"
        aria-label="Metric definition"
        className="inline-flex text-muted-foreground/40 hover:text-muted-foreground"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={`Definition of ${entry.display_name}`}
        className="inline-flex text-muted-foreground/50 transition-colors hover:text-violet-500"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
      >
        <Info className="h-3.5 w-3.5" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute left-1/2 top-6 z-50 w-72 -translate-x-1/2 rounded-xl border border-border bg-card p-4 text-left shadow-xl">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">{entry.display_name}</span>
              {entry.acronym && (
                <span className="rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-violet-500">
                  {entry.acronym}
                </span>
              )}
            </div>
            <dl className="space-y-2 text-xs">
              <div>
                <dt className="font-medium uppercase tracking-wider text-muted-foreground">Definition</dt>
                <dd className="mt-0.5 text-foreground">{entry.definition}</dd>
              </div>
              <div>
                <dt className="font-medium uppercase tracking-wider text-muted-foreground">Formula</dt>
                <dd className="mt-0.5 font-mono text-[11px] text-foreground">{entry.formula}</dd>
              </div>
              <div>
                <dt className="font-medium uppercase tracking-wider text-muted-foreground">Data source</dt>
                <dd className="mt-0.5 font-mono text-[11px] text-muted-foreground">{entry.source_tables}</dd>
              </div>
              {entry.notes && (
                <div>
                  <dt className="font-medium uppercase tracking-wider text-muted-foreground">Notes</dt>
                  <dd className="mt-0.5 text-muted-foreground">{entry.notes}</dd>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-border pt-2 text-[10px] text-muted-foreground">
                <span>Owner: {entry.owner_dashboard}</span>
                <span>Updated {new Date(entry.updated_at).toLocaleDateString()}</span>
              </div>
            </dl>
          </div>
        </>
      )}
    </span>
  );
}
