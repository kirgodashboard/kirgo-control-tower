"use client";

import { useState } from "react";
import {
  RefreshCw, DollarSign, Clock, AlertCircle, TrendingDown,
  CheckCircle, Banknote, Percent,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { useQueryClient } from "@tanstack/react-query";
import {
  useReceivablesKpis,
  useCustomerReceivables,
  useCodReceivables,
  useSettlementPending,
  useReceivablesTrend,
  useReceivablesAgeing,
  useCollectionPerformance,
} from "@/lib/hooks/use-receivables";
import { useClassificationSummary } from "@/lib/hooks/use-orders";
import { formatINR, formatCount, formatPct } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import type {
  CustomerReceivablesRow,
  CodReceivablesRow,
  SettlementPendingRow,
  ReceivablesAgeingBucket,
} from "@/types/kpi";

// ── Tooltip shell ─────────────────────────────────────────────────────────────

function TooltipShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-xl text-[12px] space-y-1">
      {children}
    </div>
  );
}

function ChartEmpty({ height }: { height: number }) {
  return (
    <div className="flex items-center justify-center text-[12px] text-muted-foreground" style={{ height }}>
      No data available
    </div>
  );
}

// ── Age badge ─────────────────────────────────────────────────────────────────

function AgeBadge({ days }: { days: number }) {
  const cls =
    days > 60 ? "bg-red-500/10 text-red-400 border-red-500/20" :
    days > 30 ? "bg-amber-400/10 text-amber-400 border-amber-400/20" :
                "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border", cls)}>
      {days}d
    </span>
  );
}

// ── Ageing bucket card ────────────────────────────────────────────────────────

const BUCKET_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  current:   { text: "text-emerald-400", bg: "bg-emerald-500/[0.04]", border: "border-emerald-500/20" },
  "0_30":    { text: "text-sky-400",     bg: "bg-sky-500/[0.04]",     border: "border-sky-500/20"     },
  "31_60":   { text: "text-amber-400",   bg: "bg-amber-400/[0.04]",   border: "border-amber-400/20"   },
  "61_90":   { text: "text-orange-400",  bg: "bg-orange-400/[0.04]",  border: "border-orange-400/20"  },
  "90_plus": { text: "text-red-400",     bg: "bg-red-500/[0.04]",     border: "border-red-500/20"     },
};

function AgeingBucket({ bucket }: { bucket: ReceivablesAgeingBucket }) {
  const c = BUCKET_COLORS[bucket.bucket] ?? BUCKET_COLORS["0_30"];
  return (
    <div className={cn("rounded-lg border p-3 text-center", c.bg, c.border)}>
      <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
        {bucket.bucket_label}
      </p>
      <p className={cn("text-[17px] font-bold tabular-nums", c.text)}>
        {formatCount(bucket.order_count)}
      </p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{formatINR(bucket.amount_inr)}</p>
    </div>
  );
}

// ── Shared table head ─────────────────────────────────────────────────────────

function TableHead({ cols }: { cols: string[] }) {
  return (
    <thead>
      <tr className="border-b border-border">
        {cols.map((col) => (
          <th
            key={col}
            className={cn(
              "px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
              col === "Amount" || col === "COD Amount" ? "text-right" : "text-left",
            )}
          >
            {col}
          </th>
        ))}
      </tr>
    </thead>
  );
}

// ── Row components ────────────────────────────────────────────────────────────

function CustomerRow({ item }: { item: CustomerReceivablesRow }) {
  return (
    <tr className="border-b border-border/30 hover:bg-accent/20 transition-colors">
      <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">#{item.woocommerce_order_id}</td>
      <td className="px-3 py-2.5 text-[12px] text-foreground font-medium">{item.customer_name}</td>
      <td className="px-3 py-2.5 text-[12px] text-muted-foreground whitespace-nowrap">{item.ordered_at}</td>
      <td className="px-3 py-2.5 text-right text-[13px] font-semibold tabular-nums">{formatINR(item.amount_inr)}</td>
      <td className="px-3 py-2.5 text-[11px] text-muted-foreground capitalize">{item.status.replace(/-/g, " ")}</td>
      <td className="px-3 py-2.5"><AgeBadge days={item.days_outstanding} /></td>
    </tr>
  );
}

const SHIPMENT_LABELS: Record<string, string> = {
  delivered: "Delivered", in_transit: "In Transit",
  out_for_delivery: "Out for Delivery", rto: "RTO", no_shipment: "Not Shipped",
};

function CodRow({ item }: { item: CodReceivablesRow }) {
  const delivered = item.shipment_status === "delivered";
  return (
    <tr className="border-b border-border/30 hover:bg-accent/20 transition-colors">
      <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">#{item.woocommerce_order_id}</td>
      <td className="px-3 py-2.5 text-[12px] text-foreground font-medium">{item.customer_name}</td>
      <td className="px-3 py-2.5">
        <span className={cn(
          "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border",
          delivered
            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
            : "bg-amber-400/10 text-amber-400 border-amber-400/20",
        )}>
          {SHIPMENT_LABELS[item.shipment_status] ?? item.shipment_status.replace(/_/g, " ")}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right text-[13px] font-semibold tabular-nums">{formatINR(item.cod_amount_inr)}</td>
      <td className="px-3 py-2.5 text-[12px] text-muted-foreground">{item.expected_settlement_date ?? "—"}</td>
    </tr>
  );
}

const GATEWAY_LABELS: Record<string, string> = {
  easebuzz: "EaseBuzz", infibeam: "Infibeam",
  shiprocket_cod: "Shiprocket COD", gokwik: "GoKwik", razorpay: "Razorpay",
};

function SettlementRow({ item }: { item: SettlementPendingRow }) {
  return (
    <tr className="border-b border-border/30 hover:bg-accent/20 transition-colors">
      <td className="px-3 py-2.5 text-[12px] text-foreground font-medium">{GATEWAY_LABELS[item.gateway] ?? item.gateway}</td>
      <td className="px-3 py-2.5 font-mono text-[10px] text-muted-foreground">{item.settlement_reference ?? "—"}</td>
      <td className="px-3 py-2.5 text-[12px] text-muted-foreground text-center">{item.order_count ?? "—"}</td>
      <td className="px-3 py-2.5 text-right text-[13px] font-semibold tabular-nums">{formatINR(item.amount_inr)}</td>
      <td className="px-3 py-2.5 text-[12px] text-muted-foreground">{item.settled_at ?? "Pending"}</td>
      <td className="px-3 py-2.5"><AgeBadge days={item.age_days} /></td>
    </tr>
  );
}

// ── Ageing bar fill colors ────────────────────────────────────────────────────

const AGEING_FILL: Record<string, string> = {
  current:   "hsl(142 71% 45%)",
  "0_30":    "hsl(199 89% 60%)",
  "31_60":   "hsl(38 92% 50%)",
  "61_90":   "hsl(25 95% 53%)",
  "90_plus": "hsl(0 72% 51%)",
};

// ── Main page ─────────────────────────────────────────────────────────────────

type TableTab = "customer" | "cod" | "settlement";

export default function ReceivablesPage() {
  const [activeTab, setActiveTab] = useState<TableTab>("customer");
  const qc = useQueryClient();

  const { data: kpis,         isLoading: kpisLoad } = useReceivablesKpis();
  const { data: customerRows = [], isLoading: custLoad } = useCustomerReceivables();
  const { data: codRows = [],      isLoading: codLoad  } = useCodReceivables();
  const { data: settleRows = [],   isLoading: settLoad } = useSettlementPending();
  const { data: trend = [] }       = useReceivablesTrend(90);
  const { data: ageing = [] }      = useReceivablesAgeing();
  const { data: performance = [] } = useCollectionPerformance();
  const { data: classSummary = [] }= useClassificationSummary();

  const promoCount = classSummary
    .filter((s) => ["influencer_promotion","brand_seeding","internal_use","replacement","warranty"].includes(s.classification))
    .reduce((a, s) => a + Number(s.order_count), 0);
  const promoValue = classSummary
    .filter((s) => ["influencer_promotion","brand_seeding","internal_use","replacement","warranty"].includes(s.classification))
    .reduce((a, s) => a + Number(s.total_value_inr), 0);

  const refreshAll = () => qc.invalidateQueries({ queryKey: ["receivables"] });

  const H = 200;

  return (
    <div className="min-h-full p-4 sm:p-6 space-y-6">
      {/* Header */}
      <PageHeader
        title="Receivables"
        subtitle="COD collections and gateway settlements pending reconciliation — promotional orders excluded"
      >
        <button
          onClick={refreshAll}
          className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </PageHeader>

      {/* ── 6 KPI cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiCard
          label="Total Receivables"
          value={kpisLoad ? undefined : formatINR(kpis?.total_receivables_inr ?? 0)}
          icon={<DollarSign className="h-3.5 w-3.5" />}
          subValue="COD + settlement pending"
          alert={
            (kpis?.total_receivables_inr ?? 0) > 2_00_000 ? "red" :
            (kpis?.total_receivables_inr ?? 0) > 50_000   ? "amber" : undefined
          }
        />
        <KpiCard
          label="COD Pending"
          value={kpisLoad ? undefined : formatINR(kpis?.cod_pending_inr ?? 0)}
          icon={<Banknote className="h-3.5 w-3.5" />}
          subValue={kpis ? `${formatCount(kpis.cod_pending_count)} orders` : undefined}
          alert={
            (kpis?.cod_pending_inr ?? 0) > 1_00_000 ? "red" :
            (kpis?.cod_pending_inr ?? 0) > 30_000   ? "amber" : undefined
          }
        />
        <KpiCard
          label="Settlement Pending"
          value={kpisLoad ? undefined : formatINR(kpis?.settlement_pending_inr ?? 0)}
          icon={<Clock className="h-3.5 w-3.5" />}
          subValue={kpis ? `${formatCount(kpis.settlement_pending_count)} batches` : undefined}
          alert={
            (kpis?.settlement_pending_inr ?? 0) > 50_000 ? "amber" : undefined
          }
        />
        <KpiCard
          label="Avg Collection Days"
          value={kpisLoad ? undefined : `${kpis?.avg_collection_days?.toFixed(1) ?? "—"}d`}
          icon={<TrendingDown className="h-3.5 w-3.5" />}
          alert={
            (kpis?.avg_collection_days ?? 0) > 30 ? "red" :
            (kpis?.avg_collection_days ?? 0) > 15 ? "amber" : undefined
          }
        />
        <KpiCard
          label="Overdue Amount"
          value={kpisLoad ? undefined : formatINR(kpis?.overdue_inr ?? 0)}
          icon={<AlertCircle className="h-3.5 w-3.5" />}
          subValue={kpis ? `${formatCount(kpis.overdue_count)} orders >30d` : undefined}
          alert={
            (kpis?.overdue_inr ?? 0) > 50_000 ? "red" :
            (kpis?.overdue_inr ?? 0) > 10_000 ? "amber" : undefined
          }
        />
        <KpiCard
          label="Collection Efficiency"
          value={kpisLoad ? undefined : formatPct(kpis?.collection_efficiency_pct ?? 0)}
          icon={<Percent className="h-3.5 w-3.5" />}
          subValue="Gateway settlement rate"
          alert={
            (kpis?.collection_efficiency_pct ?? 100) < 80 ? "red"   :
            (kpis?.collection_efficiency_pct ?? 100) < 95 ? "amber" :
            kpis !== undefined                            ? "green" : undefined
          }
        />
      </div>

      {/* ── Ageing buckets ───────────────────────────────────────────── */}
      {ageing.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            Receivables Ageing
          </p>
          <div className="grid grid-cols-5 gap-2">
            {ageing.map((b) => <AgeingBucket key={b.bucket} bucket={b} />)}
          </div>
        </div>
      )}

      {/* ── Charts ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Receivables Trend */}
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-4">
            Receivables Trend (90 days)
          </p>
          {trend.length === 0 ? <ChartEmpty height={H} /> : (
            <ResponsiveContainer width="100%" height={H}>
              <AreaChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="rcvGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="period"
                  tickFormatter={(v: string) => new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false} tickLine={false} tickMargin={6}
                />
                <YAxis
                  tickFormatter={(v: number) => formatINR(v)}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false} tickLine={false} width={52}
                />
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  content={({ active, payload, label }: any) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <TooltipShell>
                        <p className="text-muted-foreground mb-1">
                          {new Date(label ?? "").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </p>
                        <p className="tabular-nums font-medium text-foreground">
                          {formatINR(payload[0]?.value)} · {payload[0]?.payload?.order_count} orders
                        </p>
                      </TooltipShell>
                    );
                  }}
                />
                <Area type="monotone" dataKey="new_receivables_inr"
                  stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#rcvGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Ageing bar chart */}
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-4">
            Ageing by Value
          </p>
          {ageing.length === 0 ? <ChartEmpty height={H} /> : (
            <ResponsiveContainer width="100%" height={H}>
              <BarChart data={ageing} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barSize={28}>
                <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="bucket_label"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false} tickLine={false} tickMargin={6}
                />
                <YAxis
                  tickFormatter={(v: number) => formatINR(v)}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false} tickLine={false} width={52}
                />
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  content={({ active, payload }: any) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]?.payload as ReceivablesAgeingBucket;
                    return (
                      <TooltipShell>
                        <p className="text-muted-foreground mb-1">{d.bucket_label}</p>
                        <p className="tabular-nums font-medium text-foreground">
                          {formatINR(d.amount_inr)} · {formatCount(d.order_count)} orders
                        </p>
                      </TooltipShell>
                    );
                  }}
                />
                <Bar dataKey="amount_inr" radius={[4, 4, 0, 0]}>
                  {ageing.map((b) => (
                    <Cell key={b.bucket} fill={AGEING_FILL[b.bucket] ?? "hsl(var(--primary))"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Collection performance */}
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-4">
          Collection Performance — Gateway Settlement Efficiency
        </p>
        {performance.length === 0 ? <ChartEmpty height={H} /> : (
          <ResponsiveContainer width="100%" height={H}>
            <LineChart data={performance} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="period"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false} tickLine={false} tickMargin={6}
              />
              <YAxis
                tickFormatter={(v: number) => `${v}%`}
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false} tickLine={false} width={40}
              />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                content={({ active, payload, label }: any) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <TooltipShell>
                      <p className="text-muted-foreground mb-1">{label}</p>
                      <p className="tabular-nums font-medium text-emerald-400">Efficiency: {payload[0]?.value}%</p>
                    </TooltipShell>
                  );
                }}
              />
              <Line type="monotone" dataKey="efficiency_pct"
                stroke="hsl(142 71% 45%)" strokeWidth={2}
                dot={{ r: 3, fill: "hsl(142 71% 45%)", strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Tables with tab strip ─────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card">
        <div className="px-5 py-3 border-b border-border flex items-center gap-1 flex-wrap">
          {(
            [
              { id: "customer",   label: "Customer Receivables", count: customerRows.length },
              { id: "cod",        label: "COD Receivables",      count: codRows.length      },
              { id: "settlement", label: "Settlement Pending",   count: settleRows.length   },
            ] as { id: TableTab; label: string; count: number }[]
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
              )}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Customer Receivables */}
        {activeTab === "customer" && (
          custLoad ? (
            <div className="h-40 m-4 rounded-lg skeleton" />
          ) : customerRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <CheckCircle className="h-7 w-7 text-emerald-400 mb-2" />
              <p className="text-[14px] font-semibold text-foreground">No COD orders outstanding</p>
              <p className="text-[12px] text-muted-foreground mt-1">All commercial orders have been paid or classified.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <TableHead cols={["Order", "Customer", "Order Date", "Amount", "Status", "Age"]} />
                <tbody>
                  {customerRows.map((r) => <CustomerRow key={r.order_id} item={r} />)}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* COD Receivables */}
        {activeTab === "cod" && (
          codLoad ? (
            <div className="h-40 m-4 rounded-lg skeleton" />
          ) : codRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <CheckCircle className="h-7 w-7 text-emerald-400 mb-2" />
              <p className="text-[14px] font-semibold text-foreground">No COD receivables</p>
              <p className="text-[12px] text-muted-foreground mt-1">All COD orders have been remitted.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <TableHead cols={["Order", "Customer", "Shipment Status", "COD Amount", "Expected Settlement"]} />
                <tbody>
                  {codRows.map((r) => <CodRow key={r.order_id} item={r} />)}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* Settlement Pending */}
        {activeTab === "settlement" && (
          settLoad ? (
            <div className="h-40 m-4 rounded-lg skeleton" />
          ) : settleRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <CheckCircle className="h-7 w-7 text-emerald-400 mb-2" />
              <p className="text-[14px] font-semibold text-foreground">All settlements reconciled</p>
              <p className="text-[12px] text-muted-foreground mt-1">All gateway settlements have matching bank entries.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <TableHead cols={["Gateway", "Reference", "Order Count", "Amount", "Settlement Date", "Age"]} />
                <tbody>
                  {settleRows.map((r, i) => <SettlementRow key={i} item={r} />)}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* Exclusion note */}
      {promoCount > 0 && (
        <div className="rounded-xl border border-border bg-card/50 p-4">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              <span className="text-foreground font-semibold">{promoCount} non-commercial orders</span> worth{" "}
              <span className="text-foreground font-semibold">{formatINR(promoValue)}</span> are excluded
              (influencer promotion, brand seeding, internal use, replacement, warranty — BR-201 + REC-001).
              To review them, go to{" "}
              <a href="/dashboard/order-classification" className="text-violet-400 underline">Order Classification</a>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
