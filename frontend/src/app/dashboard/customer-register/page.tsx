"use client";

import { useState, useMemo } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { useCustomerRegister } from "@/lib/hooks/use-registers";
import { formatINR, formatCount } from "@/lib/utils/format";
import { exportToCsv, exportToExcel } from "@/lib/utils/export";
import { getPeriodDates } from "@/lib/utils/date-ranges";
import { Loader2, Download, FileSpreadsheet, RefreshCw, Users, TrendingUp, Repeat2, Star } from "lucide-react";
import { CustomerOrderDrawer } from "@/features/customers/customer-order-drawer";
import type { CustomerRegisterRow } from "@/types/registers";

const PERIODS = [
  { label: "Last 30 Days", value: "30d" },
  { label: "Last 90 Days", value: "90d" },
  { label: "Last 6 Months", value: "6m" },
  { label: "Last 1 Year", value: "1y" },
  { label: "All Time", value: "all" },
] as const;

type PeriodValue = (typeof PERIODS)[number]["value"];

function segmentBadge(segment: string, isRepeat: boolean) {
  if (segment === "high_value")
    return <span className="inline-flex rounded border border-violet-500/20 bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-violet-400">High Value</span>;
  if (isRepeat)
    return <span className="inline-flex rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">Repeat</span>;
  return <span className="inline-flex rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">New</span>;
}

function recencyBadge(days: number | null) {
  if (days === null) return <span className="text-muted-foreground">—</span>;
  const cls = days <= 30 ? "text-emerald-400" : days <= 90 ? "text-amber-400" : "text-red-400";
  return <span className={`tabular-nums ${cls}`}>{days}d ago</span>;
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
}

export default function CustomerRegisterPage() {
  const [period, setPeriod] = useState<PeriodValue>("all");
  const [segment, setSegment] = useState("");
  const [city, setCity] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRegisterRow | null>(null);

  const dateRange = getPeriodDates(period);

  const { data, isLoading, isFetching, refetch } = useCustomerRegister({
    start: period === "all" ? undefined : dateRange.start,
    end:   period === "all" ? undefined : dateRange.end,
    segment: segment || undefined,
    city:    city    || undefined,
  });

  const rows = data ?? [];

  const totals = useMemo(() => {
    const repeat     = rows.filter((r) => r.is_repeat);
    const highValue  = rows.filter((r) => r.segment === "high_value");
    const totalRev   = rows.reduce((s, r) => s + Number(r.total_revenue_inr), 0);
    const avgLTV     = rows.length > 0 ? totalRev / rows.length : 0;
    return { total: rows.length, repeat: repeat.length, highValue: highValue.length, totalRev, avgLTV };
  }, [rows]);

  const selectCls = "h-8 px-2 rounded-md border border-border bg-card text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500";

  const toExportRows = (rows: CustomerRegisterRow[]) =>
    rows.map((r) => ({
      "Customer ID":      r.customer_id,
      "Name":             r.customer_name,
      "Email":            r.email ?? "",
      "Phone":            r.phone ?? "",
      "City":             r.city ?? "",
      "State":            r.state ?? "",
      "Source":           r.acquisition_source ?? "",
      "First Order":      fmtDate(r.first_order_at),
      "Last Order":       fmtDate(r.last_order_at),
      "Days Since Last":  r.days_since_last_order ?? "",
      "Total Orders":     r.total_orders,
      "Total Revenue (₹)": r.total_revenue_inr,
      "Avg Order (₹)":    r.avg_order_value_inr,
      "Payment Pref":     r.payment_preference ?? "",
      "Segment":          r.segment,
      "Repeat":           r.is_repeat ? "Yes" : "No",
    }));

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader
          title="Customer Register"
          subtitle="All customers with lifetime value, order history, and segment classification"
        />
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground hover:border-primary/40 transition-colors disabled:opacity-60"
          >
            {isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          </button>
          <button
            onClick={() => exportToCsv(`customers-${dateRange.start}-${dateRange.end}`, toExportRows(rows))}
            disabled={!rows.length}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground hover:border-violet-500/40 transition-colors disabled:opacity-40"
          >
            <Download className="h-3 w-3" /> CSV
          </button>
          <button
            onClick={() => exportToExcel(`customers-${dateRange.start}-${dateRange.end}`, toExportRows(rows), "Customer Register")}
            disabled={!rows.length}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground hover:border-violet-500/40 transition-colors disabled:opacity-40"
          >
            <FileSpreadsheet className="h-3 w-3" /> Excel
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
        <select value={period} onChange={(e) => setPeriod(e.target.value as PeriodValue)} className={selectCls}>
          {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <select value={segment} onChange={(e) => setSegment(e.target.value)} className={selectCls}>
          <option value="">All Segments</option>
          <option value="new">New</option>
          <option value="repeat">Repeat</option>
          <option value="high_value">High Value</option>
        </select>
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Filter by city…"
          className="h-8 px-3 rounded-md border border-border bg-card text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet-500 w-36"
        />
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { icon: <Users className="h-4 w-4" />, label: "Total Customers", value: formatCount(totals.total), dot: "bg-emerald-500" },
          { icon: <Repeat2 className="h-4 w-4" />, label: "Repeat Customers", value: `${formatCount(totals.repeat)} (${totals.total > 0 ? Math.round((totals.repeat / totals.total) * 100) : 0}%)`, dot: "bg-violet-500" },
          { icon: <Star className="h-4 w-4" />, label: "High Value", value: formatCount(totals.highValue), dot: "bg-amber-500" },
          { icon: <TrendingUp className="h-4 w-4" />, label: "Avg LTV", value: formatINR(totals.avgLTV), dot: "bg-emerald-500" },
        ].map(({ icon, label, value, dot }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground/60">{icon}</span>
              <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
            <p className="text-lg font-bold tabular-nums text-foreground leading-tight">{value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="text-[13px] font-semibold text-foreground">
            {isLoading ? "Loading…" : `${formatCount(rows.length)} customers`}
            <span className="ml-2 text-[11px] text-muted-foreground font-normal">sorted by lifetime revenue</span>
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">No customers found for the selected filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="border-b border-border bg-muted/30">
                <tr>
                  {["Customer", "City", "Segment", "First Order", "Last Order", "Recency", "Orders", "Total Revenue", "Avg Order", "Payment Pref", "Source"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.customer_id}
                    className="border-b border-border/40 hover:bg-violet-500/[0.04] last:border-0 cursor-pointer"
                    onClick={() => setSelectedCustomer(row)}
                  >
                    <td className="px-3 py-2 max-w-[140px]">
                      <p className="font-medium truncate">{row.customer_name || <span className="text-muted-foreground italic">Unknown</span>}</p>
                      {row.email && <p className="text-[10px] text-muted-foreground truncate">{row.email}</p>}
                      {row.phone && <p className="text-[10px] text-muted-foreground">{row.phone}</p>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {row.city || <span className="text-muted-foreground">—</span>}
                      {row.state && <span className="text-muted-foreground ml-1 text-[10px]">{row.state}</span>}
                    </td>
                    <td className="px-3 py-2">{segmentBadge(row.segment, row.is_repeat)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{fmtDate(row.first_order_at)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{fmtDate(row.last_order_at)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{recencyBadge(row.days_since_last_order)}</td>
                    <td className="px-3 py-2 text-center tabular-nums font-medium">{row.total_orders}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{formatINR(row.total_revenue_inr)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatINR(row.avg_order_value_inr)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground capitalize">{row.payment_preference ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground text-[11px]">{row.acquisition_source ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CustomerOrderDrawer
        customer={selectedCustomer}
        onClose={() => setSelectedCustomer(null)}
      />
    </div>
  );
}
