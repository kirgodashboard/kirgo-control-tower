"use client";

import { formatINR, formatPct, formatCount } from "@/lib/utils/format";
import {
  useProductPl,
  useSkuPl,
  useCityPl,
  useLaunchPl,
  useCustomerPl,
} from "@/lib/hooks/use-profitability";
import type { ProductPl, SkuPl, CityPl, LaunchPl, CustomerPl } from "@/types/kpi";

// ── Shared helpers ────────────────────────────────────────────────────────────

function MarginBadge({ pct }: { pct: number }) {
  const color =
    pct >= 35 ? "text-emerald-400 bg-emerald-500/10" :
    pct >= 20 ? "text-amber-400 bg-amber-500/10" :
    "text-red-400 bg-red-500/10";
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

const th = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground";
const td = "px-3 py-2.5 text-[13px] text-foreground";
const tdNum = "px-3 py-2.5 text-[13px] text-foreground text-right tabular-nums";

// ── Product P&L ───────────────────────────────────────────────────────────────

export function ProductPlTable({ start, end }: { start: string; end: string }) {
  const { data: rows, isLoading } = useProductPl(start, end);

  return (
    <div className="overflow-x-auto">
      {isLoading ? (
        <TableSkeleton cols={7} />
      ) : !rows?.length ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No data for this period</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className={th}>Product</th>
              <th className={th}>Launch</th>
              <th className={`${th} text-right`}>Orders</th>
              <th className={`${th} text-right`}>Units</th>
              <th className={`${th} text-right`}>Revenue</th>
              <th className={`${th} text-right`}>COGS</th>
              <th className={`${th} text-right`}>Gross Profit</th>
              <th className={`${th} text-right`}>Margin</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row: ProductPl, i) => (
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
                <td className="px-3 py-2.5 text-right">
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

  return (
    <div className="overflow-x-auto">
      {isLoading ? (
        <TableSkeleton cols={8} />
      ) : !rows?.length ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No data for this period</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className={th}>SKU</th>
              <th className={th}>Product</th>
              <th className={th}>Size</th>
              <th className={`${th} text-right`}>Units</th>
              <th className={`${th} text-right`}>Revenue</th>
              <th className={`${th} text-right`}>COGS</th>
              <th className={`${th} text-right`}>Gross Profit</th>
              <th className={`${th} text-right`}>Margin</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row: SkuPl, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                <td className={`${td} font-mono text-[12px]`}>{row.sku}</td>
                <td className={td}>{row.product_name}</td>
                <td className={td}>{row.size ?? "—"}</td>
                <td className={tdNum}>{formatCount(row.units_sold)}</td>
                <td className={tdNum}>{formatINR(row.revenue_inr)}</td>
                <td className={tdNum}>{formatINR(row.cogs_inr)}</td>
                <td className={tdNum}>{formatINR(row.gross_profit_inr)}</td>
                <td className="px-3 py-2.5 text-right">
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

  return (
    <div className="overflow-x-auto">
      {isLoading ? (
        <TableSkeleton cols={6} />
      ) : !rows?.length ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No data for this period</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className={th}>City</th>
              <th className={`${th} text-right`}>Orders</th>
              <th className={`${th} text-right`}>Units</th>
              <th className={`${th} text-right`}>Revenue</th>
              <th className={`${th} text-right`}>COGS</th>
              <th className={`${th} text-right`}>Gross Profit</th>
              <th className={`${th} text-right`}>Margin</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row: CityPl, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                <td className={td}>{row.city}</td>
                <td className={tdNum}>{formatCount(row.orders_count)}</td>
                <td className={tdNum}>{formatCount(row.units_sold)}</td>
                <td className={tdNum}>{formatINR(row.revenue_inr)}</td>
                <td className={tdNum}>{formatINR(row.cogs_inr)}</td>
                <td className={tdNum}>{formatINR(row.gross_profit_inr)}</td>
                <td className="px-3 py-2.5 text-right">
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

  return (
    <div className="overflow-x-auto">
      {isLoading ? (
        <TableSkeleton cols={7} />
      ) : !rows?.length ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No launch data available</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className={th}>Launch</th>
              <th className={`${th} text-right`}>Live Date</th>
              <th className={`${th} text-right`}>CAPEX Invested</th>
              <th className={`${th} text-right`}>Revenue (All-time)</th>
              <th className={`${th} text-right`}>COGS</th>
              <th className={`${th} text-right`}>Gross Profit</th>
              <th className={`${th} text-right`}>Margin</th>
              <th className={`${th} text-right`}>Orders</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row: LaunchPl, i) => (
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
                <td className="px-3 py-2.5 text-right">
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

  return (
    <div className="overflow-x-auto">
      {isLoading ? (
        <TableSkeleton cols={6} />
      ) : !rows?.length ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No data for this period</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className={th}>Customer</th>
              <th className={`${th} text-right`}>Orders</th>
              <th className={`${th} text-right`}>Units</th>
              <th className={`${th} text-right`}>Revenue</th>
              <th className={`${th} text-right`}>COGS</th>
              <th className={`${th} text-right`}>Gross Profit</th>
              <th className={`${th} text-right`}>Margin</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row: CustomerPl, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                <td className={`${td} font-mono text-[12px] text-muted-foreground`}>{row.customer_ref}</td>
                <td className={tdNum}>{formatCount(row.orders_count)}</td>
                <td className={tdNum}>{formatCount(row.units_sold)}</td>
                <td className={tdNum}>{formatINR(row.revenue_inr)}</td>
                <td className={tdNum}>{formatINR(row.cogs_inr)}</td>
                <td className={tdNum}>{formatINR(row.gross_profit_inr)}</td>
                <td className="px-3 py-2.5 text-right">
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
