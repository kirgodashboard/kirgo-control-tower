"use client";

import { useState } from "react";
import {
  Boxes,
  RefreshCw,
  Search,
  AlertTriangle,
  XCircle,
  TrendingDown,
  ArrowDown,
  ArrowUp,
  RotateCcw,
  Wrench,
  Shuffle,
  Gift,
  PackageOpen,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { cn } from "@/lib/utils";
import {
  useInventoryKpis,
  useStockPosition,
  useStockMovements,
  useStockAgeing,
  useReorderReport,
  useTrueConsumption,
} from "@/lib/hooks/use-inventory";
import { formatINR, formatCount, formatDate } from "@/lib/utils/format";
import type { StockPositionRow, StockMovementRow, StockAgeingRow, ReorderRow, TrueConsumptionRow } from "@/types/kpi";

type Tab = "position" | "movement" | "ageing" | "reorder" | "true-demand";

// ── helpers ──────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  ok:  "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  low: "bg-amber-400/10 text-amber-400 border-amber-400/20",
  out: "bg-red-500/10 text-red-400 border-red-500/20",
};
const STATUS_LABEL: Record<string, string> = { ok: "OK", low: "Low", out: "Out" };

const AGE_STYLES: Record<string, string> = {
  fresh: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  watch: "bg-amber-400/10 text-amber-400 border-amber-400/20",
  slow:  "bg-orange-500/10 text-orange-400 border-orange-500/20",
  dead:  "bg-red-500/10 text-red-400 border-red-500/20",
};
const AGE_LABEL: Record<string, string> = {
  fresh: "Fresh (0–30d)",
  watch: "Watch (31–60d)",
  slow:  "Slow (61–90d)",
  dead:  "Dead (90+d)",
};

const MOVE_IN = new Set(["opening","purchase_in","return_in","adjustment_in","transfer_in"]);

function moveIcon(type: string) {
  const cls = "h-3.5 w-3.5 flex-shrink-0";
  switch (type) {
    case "opening":       return <PackageOpen className={cn(cls, "text-violet-400")} />;
    case "purchase_in":   return <ArrowDown   className={cn(cls, "text-emerald-400")} />;
    case "sale_out":      return <ArrowUp     className={cn(cls, "text-red-400")} />;
    case "return_in":     return <RotateCcw   className={cn(cls, "text-emerald-400")} />;
    case "adjustment_in": return <ArrowDown   className={cn(cls, "text-blue-400")} />;
    case "adjustment_out":return <Wrench      className={cn(cls, "text-amber-400")} />;
    case "sample_out":    return <Gift        className={cn(cls, "text-violet-400")} />;
    case "transfer_in":   return <Shuffle     className={cn(cls, "text-blue-400")} />;
    case "transfer_out":  return <Shuffle     className={cn(cls, "text-muted-foreground")} />;
    default:              return <ArrowDown   className={cls} />;
  }
}

function moveLabel(type: string) {
  return type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ── sub-components ────────────────────────────────────────────────────────────

function EmptyReport({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Boxes className="h-8 w-8 text-muted-foreground/40 mb-3" />
      <p className="text-[13px] text-muted-foreground">{message}</p>
    </div>
  );
}

function StockPositionTable({ rows, loading }: { rows: StockPositionRow[]; loading: boolean }) {
  if (loading) return <div className="h-52 m-4 rounded-lg skeleton" />;
  if (rows.length === 0) return <EmptyReport message="No items match your search." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            {["SKU","Product","Stock","Reorder Pt","Reorder Qty","Unit Cost","Value","Location","Last Move","Status"].map(h => (
              <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-b border-border/30 hover:bg-accent/20 transition-colors">
              <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground whitespace-nowrap">{r.sku}</td>
              <td className="px-3 py-2.5 text-[12px] font-medium text-foreground max-w-[160px] truncate">{r.product_name}</td>
              <td className="px-3 py-2.5 text-[13px] font-bold tabular-nums text-foreground text-right">{formatCount(r.current_stock)}</td>
              <td className="px-3 py-2.5 text-[12px] tabular-nums text-muted-foreground text-right">{r.reorder_point > 0 ? formatCount(r.reorder_point) : "—"}</td>
              <td className="px-3 py-2.5 text-[12px] tabular-nums text-muted-foreground text-right">{r.reorder_qty > 0 ? formatCount(r.reorder_qty) : "—"}</td>
              <td className="px-3 py-2.5 text-[12px] tabular-nums text-muted-foreground text-right">{r.unit_cost_inr ? formatINR(r.unit_cost_inr, false) : "—"}</td>
              <td className="px-3 py-2.5 text-[12px] tabular-nums text-foreground text-right">{r.stock_value_inr ? formatINR(r.stock_value_inr) : "—"}</td>
              <td className="px-3 py-2.5 text-[11px] text-muted-foreground">{r.location ?? "—"}</td>
              <td className="px-3 py-2.5 text-[11px] text-muted-foreground whitespace-nowrap">
                {r.last_movement_at ? formatDate(r.last_movement_at) : "—"}
              </td>
              <td className="px-3 py-2.5">
                <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border", STATUS_STYLES[r.status])}>
                  {STATUS_LABEL[r.status]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StockMovementTable({ rows, loading }: { rows: StockMovementRow[]; loading: boolean }) {
  if (loading) return <div className="h-52 m-4 rounded-lg skeleton" />;
  if (rows.length === 0) return <EmptyReport message="No movements recorded yet. Movements appear here once opening stock is added." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            {["Date","SKU","Product","Type","In","Out","Balance","Reference","Notes"].map(h => (
              <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const isIn = MOVE_IN.has(r.movement_type);
            return (
              <tr key={r.id} className="border-b border-border/30 hover:bg-accent/20 transition-colors">
                <td className="px-3 py-2.5 text-[11px] text-muted-foreground whitespace-nowrap">{formatDate(r.moved_at)}</td>
                <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground whitespace-nowrap">{r.sku}</td>
                <td className="px-3 py-2.5 text-[12px] text-foreground max-w-[140px] truncate">{r.product_name}</td>
                <td className="px-3 py-2.5">
                  <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground whitespace-nowrap">
                    {moveIcon(r.movement_type)}
                    {moveLabel(r.movement_type)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right text-[12px] font-semibold tabular-nums text-emerald-500">
                  {isIn ? `+${formatCount(r.quantity)}` : "—"}
                </td>
                <td className="px-3 py-2.5 text-right text-[12px] font-semibold tabular-nums text-red-400">
                  {!isIn ? `−${formatCount(r.quantity)}` : "—"}
                </td>
                <td className="px-3 py-2.5 text-right text-[12px] font-bold tabular-nums text-foreground">
                  {formatCount(r.stock_after)}
                </td>
                <td className="px-3 py-2.5 text-[11px] text-muted-foreground">
                  {r.reference_type ? `${r.reference_type}${r.reference_id ? ` #${r.reference_id}` : ""}` : "—"}
                </td>
                <td className="px-3 py-2.5 text-[11px] text-muted-foreground max-w-[160px] truncate">{r.notes ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StockAgeingTable({ rows, loading }: { rows: StockAgeingRow[]; loading: boolean }) {
  if (loading) return <div className="h-52 m-4 rounded-lg skeleton" />;
  if (rows.length === 0) return <EmptyReport message="No stock to age. Add opening stock to see ageing analysis." />;

  const buckets = ["fresh","watch","slow","dead"] as const;
  const counts = Object.fromEntries(buckets.map(b => [b, rows.filter(r => r.age_bucket === b).length]));
  const values = Object.fromEntries(buckets.map(b => [b, rows.filter(r => r.age_bucket === b).reduce((a,r) => a + (r.stock_value_inr ?? 0), 0)]));

  return (
    <div className="space-y-0">
      {/* summary strips */}
      <div className="grid grid-cols-4 gap-0 border-b border-border">
        {buckets.map(b => (
          <div key={b} className={cn("px-5 py-3 border-r border-border last:border-r-0", b === "dead" ? "bg-red-500/[0.03]" : b === "slow" ? "bg-orange-500/[0.03]" : b === "watch" ? "bg-amber-400/[0.03]" : "bg-emerald-500/[0.03]")}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{AGE_LABEL[b]}</p>
            <p className="text-[20px] font-bold tabular-nums mt-0.5">{counts[b]} <span className="text-[12px] font-normal text-muted-foreground">SKUs</span></p>
            <p className="text-[11px] text-muted-foreground">{formatINR(values[b])}</p>
          </div>
        ))}
      </div>
      {/* table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {["SKU","Product","Stock","Days in Stock","Age Bucket","Value","Last Inflow"].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b border-border/30 hover:bg-accent/20 transition-colors">
                <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground whitespace-nowrap">{r.sku}</td>
                <td className="px-3 py-2.5 text-[12px] font-medium text-foreground max-w-[160px] truncate">{r.product_name}</td>
                <td className="px-3 py-2.5 text-[13px] font-bold tabular-nums text-foreground text-right">{formatCount(r.current_stock)}</td>
                <td className="px-3 py-2.5 text-[13px] font-bold tabular-nums text-right">
                  <span className={cn(
                    r.age_bucket === "dead" ? "text-red-400" :
                    r.age_bucket === "slow" ? "text-orange-400" :
                    r.age_bucket === "watch" ? "text-amber-400" : "text-emerald-500"
                  )}>{r.days_in_stock}d</span>
                </td>
                <td className="px-3 py-2.5">
                  <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border", AGE_STYLES[r.age_bucket])}>
                    {AGE_LABEL[r.age_bucket]}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-[12px] tabular-nums text-foreground text-right">{formatINR(r.stock_value_inr ?? 0)}</td>
                <td className="px-3 py-2.5 text-[11px] text-muted-foreground whitespace-nowrap">
                  {r.last_inflow_at ? formatDate(r.last_inflow_at) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReorderTable({ rows, loading }: { rows: ReorderRow[]; loading: boolean }) {
  if (loading) return <div className="h-52 m-4 rounded-lg skeleton" />;
  if (rows.length === 0) return <EmptyReport message="No SKUs at or below reorder point. All stock levels are healthy." />;

  const totalOrderValue = rows.reduce((a, r) => a + (r.suggested_order_value_inr ?? 0), 0);

  return (
    <div className="space-y-0">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between bg-amber-400/[0.03]">
        <p className="text-[12px] text-amber-400 font-semibold">
          {rows.length} SKU{rows.length !== 1 ? "s" : ""} need restocking
        </p>
        <p className="text-[12px] text-muted-foreground">
          Suggested order value: <span className="text-foreground font-semibold">{formatINR(totalOrderValue)}</span>
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {["SKU","Product","Current Stock","Reorder Pt","Reorder Qty","Unit Cost","Order Value","Days Since Inflow","Priority"].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const isOut = r.current_stock === 0;
              const urgency = isOut ? "red" : "amber";
              return (
                <tr key={r.id} className="border-b border-border/30 hover:bg-accent/20 transition-colors">
                  <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground whitespace-nowrap">{r.sku}</td>
                  <td className="px-3 py-2.5 text-[12px] font-medium text-foreground max-w-[160px] truncate">{r.product_name}</td>
                  <td className={cn("px-3 py-2.5 text-[13px] font-bold tabular-nums text-right", isOut ? "text-red-400" : "text-amber-400")}>
                    {formatCount(r.current_stock)}
                  </td>
                  <td className="px-3 py-2.5 text-[12px] tabular-nums text-muted-foreground text-right">{r.reorder_point > 0 ? formatCount(r.reorder_point) : "—"}</td>
                  <td className="px-3 py-2.5 text-[12px] tabular-nums text-foreground text-right font-semibold">{r.reorder_qty > 0 ? formatCount(r.reorder_qty) : "—"}</td>
                  <td className="px-3 py-2.5 text-[12px] tabular-nums text-muted-foreground text-right">{r.unit_cost_inr ? formatINR(r.unit_cost_inr, false) : "—"}</td>
                  <td className="px-3 py-2.5 text-[12px] tabular-nums text-foreground text-right font-semibold">{r.suggested_order_value_inr ? formatINR(r.suggested_order_value_inr) : "—"}</td>
                  <td className="px-3 py-2.5 text-[12px] tabular-nums text-muted-foreground text-right">
                    {r.days_since_last_inflow != null ? `${r.days_since_last_inflow}d` : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border",
                      urgency === "red"
                        ? "bg-red-500/10 text-red-400 border-red-500/20"
                        : "bg-amber-400/10 text-amber-400 border-amber-400/20"
                    )}>
                      {isOut ? "Out of Stock" : "Low Stock"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── True Demand table ─────────────────────────────────────────────────────────

function TrueDemandTable({ rows, loading }: { rows: TrueConsumptionRow[]; loading: boolean }) {
  if (loading) return <div className="h-52 m-4 rounded-lg skeleton" />;
  if (rows.length === 0) return <EmptyReport message="BOM data not yet populated. Run the BOM backfill migration to enable true demand." />;

  const bras     = rows.filter(r => r.product_type === "sports_bra");
  const leggings = rows.filter(r => r.product_type === "leggings");

  function ProductSection({ items, label }: { items: TrueConsumptionRow[]; label: string }) {
    return (
      <>
        <tr className="bg-muted/30 border-b border-border">
          <td colSpan={9} className="px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {label}
          </td>
        </tr>
        {items.map(r => {
          const setPct = r.total_units > 0 ? Math.round((r.set_units / r.total_units) * 100) : 0;
          const daysClass =
            r.days_of_stock == null ? "text-muted-foreground" :
            r.days_of_stock < 30   ? "text-red-400 font-bold" :
            r.days_of_stock < 60   ? "text-amber-400 font-semibold" :
                                     "text-emerald-500";
          return (
            <tr key={r.product_id} className="border-b border-border/30 hover:bg-accent/20 transition-colors">
              <td className="px-3 py-2.5 text-[12px] font-medium text-foreground">{r.product_name}</td>
              <td className="px-3 py-2.5 text-[12px] tabular-nums text-right text-muted-foreground">{formatCount(r.direct_units)}</td>
              <td className="px-3 py-2.5 text-[12px] tabular-nums text-right text-violet-400">{formatCount(r.set_units)}</td>
              <td className="px-3 py-2.5 text-[13px] tabular-nums text-right font-bold text-foreground">{formatCount(r.total_units)}</td>
              <td className="px-3 py-2.5 text-[12px] tabular-nums text-right text-muted-foreground">{setPct}%</td>
              <td className="px-3 py-2.5 text-[12px] tabular-nums text-right text-muted-foreground">{formatINR(r.total_revenue_inr)}</td>
              <td className="px-3 py-2.5 text-[12px] tabular-nums text-right text-muted-foreground">{r.avg_monthly_velocity}/mo</td>
              <td className="px-3 py-2.5 text-[12px] tabular-nums text-right text-foreground font-semibold">{formatCount(r.current_stock_units)}</td>
              <td className={cn("px-3 py-2.5 text-[12px] tabular-nums text-right", daysClass)}>
                {r.days_of_stock != null ? `${r.days_of_stock}d` : "—"}
              </td>
            </tr>
          );
        })}
      </>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            {["Product","Direct Units","Via Sets","Total Units","Set %","Total Revenue","Avg Monthly","In Stock","Days of Stock"].map(h => (
              <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <ProductSection items={bras}     label="Sports Bras" />
          <ProductSection items={leggings} label="Leggings" />
        </tbody>
      </table>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string }[] = [
  { id: "position",    label: "Stock Position" },
  { id: "movement",    label: "Stock Movement" },
  { id: "ageing",      label: "Stock Ageing" },
  { id: "reorder",     label: "Reorder" },
  { id: "true-demand", label: "True Demand" },
];

export default function InventoryPage() {
  const [tab, setTab] = useState<Tab>("position");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const { data: kpis, isLoading: kpisLoading, refetch: refetchKpis } = useInventoryKpis();
  const { data: position = [], isLoading: positionLoading, refetch: refetchPosition } = useStockPosition(search || null);
  const { data: movements = [], isLoading: movementsLoading } = useStockMovements();
  const { data: ageing = [], isLoading: ageingLoading } = useStockAgeing();
  const { data: reorder = [], isLoading: reorderLoading } = useReorderReport();
  const { data: trueDemand = [], isLoading: trueDemandLoading } = useTrueConsumption();

  const isEmpty = !kpisLoading && (kpis?.total_skus ?? 0) === 0;

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
  }

  function handleRefresh() {
    refetchKpis();
    refetchPosition();
  }

  return (
    <div className="min-h-full p-4 sm:p-6 space-y-6">
      <PageHeader
        title="Inventory"
        subtitle="Stock position, movement, ageing and reorder intelligence"
      >
        <button
          onClick={handleRefresh}
          className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </PageHeader>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          label="Total SKUs"
          value={kpisLoading ? undefined : formatCount(kpis?.total_skus ?? 0)}
        />
        <KpiCard
          label="Active SKUs"
          value={kpisLoading ? undefined : formatCount(kpis?.active_skus ?? 0)}
        />
        <KpiCard
          label="Total Units"
          value={kpisLoading ? undefined : formatCount(kpis?.total_units ?? 0)}
        />
        <KpiCard
          label="Stock Value"
          value={kpisLoading ? undefined : formatINR(kpis?.stock_value_inr ?? 0)}
        />
        <KpiCard
          label="Low Stock"
          value={kpisLoading ? undefined : formatCount(kpis?.low_stock_count ?? 0)}
          alert={(kpis?.low_stock_count ?? 0) > 0 ? "amber" : undefined}
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
        />
        <KpiCard
          label="Out of Stock"
          value={kpisLoading ? undefined : formatCount(kpis?.out_of_stock_count ?? 0)}
          alert={(kpis?.out_of_stock_count ?? 0) > 0 ? "red" : undefined}
          icon={<XCircle className="h-3.5 w-3.5" />}
        />
      </div>

      {/* Empty state */}
      {isEmpty ? (
        <div className="rounded-xl border border-border bg-card flex flex-col items-center justify-center py-20 text-center px-6">
          <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <Boxes className="h-7 w-7 text-muted-foreground/50" />
          </div>
          <p className="text-[16px] font-semibold text-foreground mb-2">
            Awaiting opening stock / inventory seed
          </p>
          <p className="text-[13px] text-muted-foreground max-w-md leading-relaxed">
            No inventory items found. Add SKUs with opening stock quantities to unlock
            all four reports — Stock Position, Movement, Ageing, and Reorder.
          </p>
          <div className="mt-6 rounded-lg border border-border bg-muted/30 px-5 py-4 text-left max-w-sm w-full">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">How to get started</p>
            <ol className="space-y-1.5 text-[12px] text-muted-foreground list-decimal list-inside">
              <li>Run the migration SQL in Supabase SQL Editor</li>
              <li>Insert SKUs into <code className="text-violet-400 text-[11px]">inventory_items</code></li>
              <li>Set <code className="text-violet-400 text-[11px]">current_stock</code>, <code className="text-violet-400 text-[11px]">reorder_point</code>, and <code className="text-violet-400 text-[11px]">unit_cost_inr</code></li>
              <li>This page will populate automatically</li>
            </ol>
          </div>
        </div>
      ) : (
        <>
          {/* Tab bar + search */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex gap-1 p-1 rounded-lg bg-muted/50 border border-border">
              {TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-[13px] font-medium transition-all",
                    tab === t.id
                      ? "bg-card text-foreground shadow-sm border border-border"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t.label}
                  {t.id === "reorder" && reorder.length > 0 && (
                    <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-amber-400/20 text-amber-400 text-[10px] font-bold">
                      {reorder.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {tab === "position" && (
              <form onSubmit={handleSearch} className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                    placeholder="Search SKU or product…"
                    className="h-8 pl-8 pr-3 rounded-md border border-border bg-background text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-violet-500 w-52"
                  />
                </div>
                <button
                  type="submit"
                  className="h-8 px-3 rounded-md bg-violet-600 hover:bg-violet-500 text-white text-[12px] font-semibold transition-colors"
                >
                  Search
                </button>
                {search && (
                  <button
                    type="button"
                    onClick={() => { setSearch(""); setSearchInput(""); }}
                    className="h-8 px-3 rounded-md border border-border text-[12px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Clear
                  </button>
                )}
              </form>
            )}
          </div>

          {/* Report panels */}
          {tab === "position" && (
            <div className="rounded-xl border border-border bg-card">
              <div className="px-5 py-3 border-b border-border">
                <p className="text-[13px] font-semibold text-foreground">Stock Position</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Current stock levels for all active SKUs, ordered by urgency.
                </p>
              </div>
              <StockPositionTable rows={position} loading={positionLoading} />
            </div>
          )}

          {tab === "movement" && (
            <div className="rounded-xl border border-border bg-card">
              <div className="px-5 py-3 border-b border-border">
                <p className="text-[13px] font-semibold text-foreground">Stock Movement</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Full audit trail of every stock change — purchases, sales, returns and adjustments.
                </p>
              </div>
              <StockMovementTable rows={movements} loading={movementsLoading} />
            </div>
          )}

          {tab === "ageing" && (
            <div className="rounded-xl border border-border bg-card">
              <div className="px-5 py-3 border-b border-border">
                <p className="text-[13px] font-semibold text-foreground">Stock Ageing</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  How long current stock has been held. Dead stock (&gt;90 days) ties up capital.
                </p>
              </div>
              <StockAgeingTable rows={ageing} loading={ageingLoading} />
            </div>
          )}

          {tab === "reorder" && (
            <div className="rounded-xl border border-border bg-card">
              <div className="px-5 py-3 border-b border-border">
                <p className="text-[13px] font-semibold text-foreground">Reorder Report</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  SKUs at or below their reorder point. Suggested order quantity × unit cost shown.
                </p>
              </div>
              <ReorderTable rows={reorder} loading={reorderLoading} />
            </div>
          )}

          {tab === "true-demand" && (
            <div className="rounded-xl border border-border bg-card">
              <div className="px-5 py-3 border-b border-border">
                <p className="text-[13px] font-semibold text-foreground">True Demand</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  BOM-adjusted consumption per component product — direct standalone sales + units hidden inside Sets.
                  Days of stock uses trailing-90d velocity.
                </p>
              </div>
              <TrueDemandTable rows={trueDemand} loading={trueDemandLoading} />
            </div>
          )}

          {/* Ageing legend note */}
          {tab === "ageing" && (
            <div className="rounded-xl border border-border bg-card/50 p-4 flex items-start gap-2.5">
              <TrendingDown className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <p className="text-[12px] text-muted-foreground leading-relaxed">
                Age is calculated from the date of the most recent inflow (purchase / opening stock).
                Items with no movements use their setup date as the reference.
                Dead stock ties up working capital — consider markdowns or liquidation for items over 90 days.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
