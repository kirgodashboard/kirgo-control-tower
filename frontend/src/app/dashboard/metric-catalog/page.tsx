"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { useMetricCatalog } from "@/lib/hooks/use-governance";
import type { MetricCatalogEntry } from "@/lib/data/governance";
import { Loader2, Search, BookMarked } from "lucide-react";

const CATEGORY_LABEL: Record<string, string> = {
  revenue: "Revenue",
  customer: "Customer",
  operations: "Operations",
  finance: "Finance & Bank",
  receivables: "Receivables",
  profitability: "Profitability",
};

const BASIS_LABEL: Record<string, string> = {
  intake: "Order intake",
  delivered: "Delivered",
  cash: "Cash basis",
  classification: "Classification",
};

function basisChip(basis: string | null) {
  if (!basis) return null;
  return (
    <span className="rounded-md border border-violet-500/20 bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-violet-500">
      {BASIS_LABEL[basis] ?? basis}
    </span>
  );
}

export default function MetricCatalogPage() {
  const { data: catalog, isLoading } = useMetricCatalog();
  const [query, setQuery] = useState("");

  const grouped = useMemo(() => {
    const rows = (catalog ?? []).filter((m) => {
      const q = query.toLowerCase().trim();
      if (!q) return true;
      return (
        m.display_name.toLowerCase().includes(q) ||
        (m.acronym ?? "").toLowerCase().includes(q) ||
        m.definition.toLowerCase().includes(q)
      );
    });
    const map = new Map<string, MetricCatalogEntry[]>();
    for (const r of rows) {
      if (!map.has(r.category)) map.set(r.category, []);
      map.get(r.category)!.push(r);
    }
    return Array.from(map.entries());
  }, [catalog, query]);

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Metric Catalog"
          subtitle="Single source of truth — every KPI's definition, formula, source, and owner"
        />
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search metrics…"
            className="h-8 w-56 rounded-md border border-border bg-card pl-8 pr-3 text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">
          No metrics match “{query}”.
        </div>
      ) : (
        grouped.map(([category, metrics]) => (
          <div key={category} className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <BookMarked className="h-4 w-4 text-muted-foreground" />
              <p className="text-[13px] font-semibold text-foreground">{CATEGORY_LABEL[category] ?? category}</p>
              <span className="text-[11px] text-muted-foreground">· {metrics.length}</span>
            </div>
            <div className="divide-y divide-border/40">
              {metrics.map((m) => (
                <div key={m.metric_key} className="px-4 py-3.5">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{m.display_name}</span>
                    {m.acronym && (
                      <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        {m.acronym}
                      </span>
                    )}
                    {basisChip(m.basis)}
                    <span className="ml-auto text-[11px] text-muted-foreground">{m.owner_dashboard}</span>
                  </div>
                  <p className="text-sm text-foreground">{m.definition}</p>
                  <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Formula</p>
                      <p className="mt-0.5 font-mono text-[11px] text-foreground">{m.formula}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Source tables</p>
                      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{m.source_tables}</p>
                    </div>
                  </div>
                  {m.notes && (
                    <p className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                      {m.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
