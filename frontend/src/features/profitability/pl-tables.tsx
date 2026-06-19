"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { formatINR, formatPct, formatCount } from "@/lib/utils/format";
import {
  useProductPl,
  useSkuPl,
  useCityPl,
  useLaunchPl,
  useCustomerPl,
} from "@/lib/hooks/use-profitability";
import type { ProductPl, SkuPl, CityPl, LaunchPl, CustomerPl } from "@/types/kpi";

// ── Sort helpers ──────────────────────────────────────────────────────────────

type SortState = { col: string; dir: "asc" | "desc" };

function useSortState(defaultCol: string): [SortState, (col: string) => void] {
  const [sort, setSort] = useState<SortState>({ col: defaultCol, dir: "desc" });
  const toggle = (col: string) =>
    setSort((prev) =>
      prev.col === col
        ? { col, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { col, dir: "desc" }
    );
  return [sort, toggle];
}

function sortRows<T>(rows: T[], sort: SortState): T[] {
  return [...rows].sort((a, b) => {
    const va = (a as Record<string, unknown>)[sort.col];
    const vb = (b as Record<string, unknown>)[sort.col];
    if (typeof va === "number" && typeof vb === "number") {
      return sort.dir === "asc" ? va - vb : vb - va;
    }
    return sort.dir === "asc"
      ? String(va ?? "").localeCompare(String(vb ?? ""))
      : String(vb ?? "").localeCompare(String(va ?? ""));
  });
}

function exportCsv(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const csv = [
    cols.join(","),
    ...rows.map((r) =>
      cols
        .map((c) => {
          const v = r[c];
          if (typeof v === "string" && (v.includes(",") || v.includes('"')))
            return `"${v.replace(/"/g, '""')}"`;
          return v ?? "";
        })
        .join(",")
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

function MarginBadge({ pct }: { pct: number }) {
  const color =
    pct >= 35
      ? "text-emerald-400 bg-emerald-500/10"
      : pct >= 20
      ? "text-amber-400 bg-amber-500/10"
      : "text-red-400 bg-red-500/10";
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold ${color}`}>
      {formatPct(pct)}
    </span>
  );
}

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {Array.from({ length: cols }).map((_, j) => (
            <div key={j} className="h-5 rounded skeleton" />
          ))}
        </div>
      ))}
    </div>
  );
}

function ExportButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
    >
      <Download className="h-3 w-3" />
      Export CSV
    </button>
  );
}

function SortTh({
  label,
  col,
  sort,
  onSort,
  className = "",
}: {
  label: string;
  col: string;
  sort: SortState;
  onSort: (col: string) => void;
  className?: string;
}) {
  const active = sort.col === col;
  return (
    <th
      onClick={() => onSort(col)}
      className={`px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors group ${className}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className={`text-[9px] ${active ? "opacity-100" : "opacity-0 group-hover:opacity-40"}`}>
          {active ? (sort.dir === "asc" ? "▲" : "▼") : "▼"}
        </span>
      </span>
    </th>
  );
}

const td    = "px-3 py-4 text-[15px] text-foreground";
const tdNum = "px-3 py-4 text-[15px] text-foreground text-right tabular-nums font-medium";

// ── Product P&L ───────────────────────────────────────────────────────────────

export function ProductPlTable({ start, end }: { start: string; end: string }) {
  const { data: rows, isLoading } = useProductPl(start, end);
  const [sort, toggleSort] = useSortState("revenue_inr");
  const sorted = sortRows(rows ?? [], sort);

  return (
    <div className="overflow-x-auto">
      <div className="flex items-center justify-end mb-2">
        <ExportButton onClick={() => exportCsv(sorted as unknown as Record<string, unknown>[], "product-pl")} />
      </div>
      {isLoading ? (
        <TableSkeleton cols={8} />
      ) : !sorted.length ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No data for this period</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <SortTh label="Product"      col="product_name"     sort={sort} onSort={toggleSort} />
              <SortTh label="Launch"       col="launch_code"      sort={sort} onSort={toggleSort} />
              <SortTh label="Orders"       col="orders_count"     sort={sort} onSort={toggleSort} className="text-right" />
              <SortTh label="Units"        col="units_sold"       sort={sort} onSort={toggleSort} className="text-right" />
              <SortTh label="Revenue"      col="revenue_inr"      sort={sort} onSort={toggleSort} className="text-right" />
              <SortTh label="COGS"         col="cogs_inr"         sort={sort} onSort={toggleSort} className="text-right" />
              <SortTh label="Gross Profit" col="gross_profit_inr" sort={sort} onSort={toggleSort} className="text-right" />
              <SortTh label="Margin"       col="gross_margin_pct" sort={sort} onSort={toggleSort} className="text-right" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row: ProductPl, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                <td className={td}>{row.product_name}</td>
                <td className={td}>
                  <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium bg-violet-500/10 text-violet-400">
                    {row.launch_code}
                  </span>
                </td>
                <td className={tdNum}>{formatCount(row.orders_count)}</td>
                <td className={tdNum}>{formatCount(row.units_sold)}</td>
                <td className={tdNum}>{formatINR(row.revenue_inr)}</td>
                <td className={tdNum}>{formatINR(row.cogs_inr)}</td>
                <td className={tdNum}>{formatINR(row.gross_profit_inr)}</td>
                <td className="px-3 py-4 text-right">
                  <MarginBadge pct={row.gross_margin_pct} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── SKU P&L ───────────────────────────────────────────────────────────────────

export function SkuPlTable({ start, end }: { start: string; end: string }) {
  const { data: rows, isLoading } = useSkuPl(start, end);
  const [sort, toggleSort] = useSortState("revenue_inr");
  const sorted = sortRows(rows ?? [], sort);

  return (
    <div className="overflow-x-auto">
      <div className="flex items-center justify-end mb-2">
        <ExportButton onClick={() => exportCsv(sorted as unknown as Record<string, unknown>[], "sku-pl")} />
      </div>
      {isLoading ? (
        <TableSkeleton cols={8} />
      ) : !sorted.length ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No data for this period</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <SortTh label="SKU"          col="sku"              sort={sort} onSort={toggleSort} />
              <SortTh label="Product"      col="product_name"     sort={sort} onSort={toggleSort} />
              <SortTh label="Size"         col="size"             sort={sort} onSort={toggleSort} />
              <SortTh label="Units"        col="units_sold"       sort={sort} onSort={toggleSort} className="text-right" />
              <SortTh label="Revenue"      col="revenue_inr"      sort={sort} onSort={toggleSort} className="text-right" />
              <SortTh label="COGS"         col="cogs_inr"         sort={sort} onSort={toggleSort} className="text-right" />
              <SortTh label="Gross Profit" col="gross_profit_inr" sort={sort} onSort={toggleSort} className="text-right" />
              <SortTh label="Margin"       col="gross_margin_pct" sort={sort} onSort={toggleSort} className="text-right" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row: SkuPl, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                <td className={`${td} font-mono text-[12px]`}>{row.sku}</td>
                <td className={td}>{row.product_name}</td>
                <td className={td}>{row.size ?? "—"}</td>
                <td className={tdNum}>{formatCount(row.units_sold)}</td>
                <td className={tdNum}>{formatINR(row.revenue_inr)}</td>
                <td className={tdNum}>{formatINR(row.cogs_inr)}</td>
                <td className={tdNum}>{formatINR(row.gross_profit_inr)}</td>
                <td className="px-3 py-4 text-right">
                  <MarginBadge pct={row.gross_margin_pct} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── City P&L ──────────────────────────────────────────────────────────────────

export function CityPlTable({ start, end }: { start: string; end: string }) {
  const { data: rows, isLoading } = useCityPl(start, end);
  const [sort, toggleSort] = useSortState("revenue_inr");
  const sorted = sortRows(rows ?? [], sort);

  return (
    <div className="overflow-x-auto">
      <div className="flex items-center justify-end mb-2">
        <ExportButton onClick={() => exportCsv(sorted as unknown as Record<string, unknown>[], "city-pl")} />
      </div>
      {isLoading ? (
        <TableSkeleton cols={7} />
      ) : !sorted.length ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No data for this period</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <SortTh label="City"         col="city"             sort={sort} onSort={toggleSort} />
              <SortTh label="Orders"       col="orders_count"     sort={sort} onSort={toggleSort} className="text-right" />
              <SortTh label="Units"        col="units_sold"       sort={sort} onSort={toggleSort} className="text-right" />
              <SortTh label="Revenue"      col="revenue_inr"      sort={sort} onSort={toggleSort} className="text-right" />
              <SortTh label="COGS"         col="cogs_inr"         sort={sort} onSort={toggleSort} className="text-right" />
              <SortTh label="Gross Profit" col="gross_profit_inr" sort={sort} onSort={toggleSort} className="text-right" />
              <SortTh label="Margin"       col="gross_margin_pct" sort={sort} onSort={toggleSort} className="text-right" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row: CityPl, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                <td className={td}>{row.city}</td>
                <td className={tdNum}>{formatCount(row.orders_count)}</td>
                <td className={tdNum}>{formatCount(row.units_sold)}</td>
                <td className={tdNum}>{formatINR(row.revenue_inr)}</td>
                <td className={tdNum}>{formatINR(row.cogs_inr)}</td>
                <td className={tdNum}>{formatINR(row.gross_profit_inr)}</td>
                <td className="px-3 py-4 text-right">
                  <MarginBadge pct={row.gross_margin_pct} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Launch P&L ────────────────────────────────────────────────────────────────

export function LaunchPlTable() {
  const { data: rows, isLoading } = useLaunchPl();
  const [sort, toggleSort] = useSortState("revenue_inr");
  const sorted = sortRows(rows ?? [], sort);

  return (
    <div className="overflow-x-auto">
      <div className="flex items-center justify-end mb-2">
        <ExportButton onClick={() => exportCsv(sorted as unknown as Record<string, unknown>[], "launch-pl")} />
      </div>
      {isLoading ? (
        <TableSkeleton cols={8} />
      ) : !sorted.length ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No launch data available</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <SortTh label="Launch"       col="launch_name"          sort={sort} onSort={toggleSort} />
              <SortTh label="Live Date"    col="launched_at"          sort={sort} onSort={toggleSort} className="text-right" />
              <SortTh label="CAPEX"        col="total_investment_inr" sort={sort} onSort={toggleSort} className="text-right" />
              <SortTh label="Revenue"      col="revenue_inr"          sort={sort} onSort={toggleSort} className="text-right" />
              <SortTh label="COGS"         col="cogs_inr"             sort={sort} onSort={toggleSort} className="text-right" />
              <SortTh label="Gross Profit" col="gross_profit_inr"     sort={sort} onSort={toggleSort} className="text-right" />
              <SortTh label="Margin"       col="gross_margin_pct"     sort={sort} onSort={toggleSort} className="text-right" />
              <SortTh label="Orders"       col="orders_count"         sort={sort} onSort={toggleSort} className="text-right" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row: LaunchPl, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                <td className={td}>
                  <div>
                    <p className="font-medium">{row.launch_name}</p>
                    <p className="text-[11px] text-muted-foreground">{row.launch_code}</p>
                  </div>
                </td>
                <td className={tdNum}>
                  {row.launched_at
                    ? new Date(row.launched_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                    : "—"}
                </td>
                <td className={tdNum}>
                  {row.total_investment_inr != null ? formatINR(row.total_investment_inr) : "—"}
                </td>
                <td className={tdNum}>{formatINR(row.revenue_inr)}</td>
                <td className={tdNum}>{formatINR(row.cogs_inr)}</td>
                <td className={tdNum}>{formatINR(row.gross_profit_inr)}</td>
                <td className="px-3 py-4 text-right">
                  <MarginBadge pct={row.gross_margin_pct} />
                </td>
                <td className={tdNum}>{formatCount(row.orders_count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Customer P&L ──────────────────────────────────────────────────────────────

export function CustomerPlTable({ start, end }: { start: string; end: string }) {
  const { data: rows, isLoading } = useCustomerPl(start, end);
  const [sort, toggleSort] = useSortState("revenue_inr");
  const sorted = sortRows(rows ?? [], sort);

  return (
    <div className="overflow-x-auto">
      <div className="flex items-center justify-end mb-2">
        <ExportButton onClick={() => exportCsv(sorted as unknown as Record<string, unknown>[], "customer-pl")} />
      </div>
      {isLoading ? (
        <TableSkeleton cols={7} />
      ) : !sorted.length ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No data for this period</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <SortTh label="Customer"     col="customer_ref"     sort={sort} onSort={toggleSort} />
              <SortTh label="Orders"       col="orders_count"     sort={sort} onSort={toggleSort} className="text-right" />
              <SortTh label="Units"        col="units_sold"       sort={sort} onSort={toggleSort} className="text-right" />
              <SortTh label="Revenue"      col="revenue_inr"      sort={sort} onSort={toggleSort} className="text-right" />
              <SortTh label="COGS"         col="cogs_inr"         sort={sort} onSort={toggleSort} className="text-right" />
              <SortTh label="Gross Profit" col="gross_profit_inr" sort={sort} onSort={toggleSort} className="text-right" />
              <SortTh label="Margin"       col="gross_margin_pct" sort={sort} onSort={toggleSort} className="text-right" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row: CustomerPl, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                <td className={`${td} font-mono text-[12px] text-muted-foreground`}>{row.customer_ref}</td>
                <td className={tdNum}>{formatCount(row.orders_count)}</td>
                <td className={tdNum}>{formatCount(row.units_sold)}</td>
                <td className={tdNum}>{formatINR(row.revenue_inr)}</td>
                <td className={tdNum}>{formatINR(row.cogs_inr)}</td>
                <td className={tdNum}>{formatINR(row.gross_profit_inr)}</td>
                <td className="px-3 py-4 text-right">
                  <MarginBadge pct={row.gross_margin_pct} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
