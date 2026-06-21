"use client";

import { useState } from "react";
import {
  useRevenueForecast,
  useCashFlowForecast,
  useCustomerForecast,
  useForecastChartData,
} from "@/lib/hooks/use-forecasting";
import { PageHeader } from "@/components/ui/page-header";
import { formatINR, formatCount } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import {
  ComposedChart,
  Area,
  Line,
  BarChart,
  Bar,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Package, Info } from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────────────────────

type Scenario = "conservative" | "expected" | "optimistic";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtMonth(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${MONTHS[d.getMonth()]} '${String(d.getFullYear()).slice(-2)}`;
}

function fmtK(v: number): string {
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(0)}K`;
  return `₹${v}`;
}

// ── Scenario toggle ───────────────────────────────────────────────────────────

const SCENARIOS: { key: Scenario; label: string; color: string; bg: string }[] = [
  { key: "conservative", label: "Conservative", color: "text-muted-foreground", bg: "bg-muted border-border" },
  { key: "expected",     label: "Expected",     color: "text-violet-400",       bg: "bg-violet-500/10 border-violet-500/30" },
  { key: "optimistic",   label: "Optimistic",   color: "text-emerald-400",      bg: "bg-emerald-500/10 border-emerald-500/30" },
];

// ── Chart tooltip ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RevTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-foreground mb-1.5">{label}</p>
      {payload.map((p: { name: string; value: number; color: string }, i: number) => (
        p.value != null && (
          <div key={i} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
            <span className="text-muted-foreground capitalize">{p.name}:</span>
            <span className="font-medium text-foreground">{fmtK(p.value)}</span>
          </div>
        )
      ))}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CashTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-foreground mb-1.5">{label} — Expected</p>
      {payload.map((p: { name: string; value: number; color: string }, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
          <span className="text-muted-foreground capitalize">{p.name}:</span>
          <span className="font-medium text-foreground">{fmtK(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-foreground mb-1.5">{label}</p>
      {payload.map((p: { name: string; value: number; color: string }, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
          <span className="text-muted-foreground capitalize">{p.name}:</span>
          <span className="font-medium text-foreground">{formatCount(p.value)} new</span>
        </div>
      ))}
    </div>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function CardSkeleton() {
  return <div className="rounded-xl border border-border bg-card p-5 h-28 animate-pulse" />;
}

function ChartSkeleton({ h = 220 }: { h?: number }) {
  return <div className={`rounded-xl border border-border bg-card p-5 animate-pulse`} style={{ height: h }} />;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ForecastingPage() {
  const [scenario, setScenario] = useState<Scenario>("expected");

  const { data: revenue, isLoading: revLoading } = useRevenueForecast();
  const { data: cashFlow, isLoading: cashLoading } = useCashFlowForecast();
  const { data: customers, isLoading: custLoading } = useCustomerForecast();
  const { data: chartData, isLoading: chartLoading } = useForecastChartData();

  // ── Transform chart data ──────────────────────────────────────────────────

  const revenueChartData = (chartData ?? []).map((p) => ({
    month: fmtMonth(p.month),
    actual: p.actual_inr ?? undefined,
    conservative: !p.is_actual ? (p.conservative_inr ?? undefined) : undefined,
    expected: !p.is_actual ? (p.expected_inr ?? undefined) : undefined,
    optimistic: !p.is_actual ? (p.optimistic_inr ?? undefined) : undefined,
  }));

  // Connect last actual to first projection
  const lastActualIdx = revenueChartData.findLastIndex((p) => p.actual !== undefined);
  if (lastActualIdx >= 0 && lastActualIdx + 1 < revenueChartData.length) {
    const lastVal = revenueChartData[lastActualIdx].actual;
    revenueChartData[lastActualIdx + 1] = {
      ...revenueChartData[lastActualIdx + 1],
      conservative: lastVal,
      expected: lastVal,
      optimistic: lastVal,
    };
  }

  const cashChartData = cashFlow
    ? [
        {
          label: "30 Days",
          inflows: cashFlow.horizon_30d.expected.inflows_inr,
          outflows: cashFlow.horizon_30d.expected.outflows_inr,
          net: cashFlow.horizon_30d.expected.net_inr,
        },
        {
          label: "90 Days",
          inflows: cashFlow.horizon_90d.expected.inflows_inr,
          outflows: cashFlow.horizon_90d.expected.outflows_inr,
          net: cashFlow.horizon_90d.expected.net_inr,
        },
        {
          label: "6 Months",
          inflows: cashFlow.horizon_180d.expected.inflows_inr,
          outflows: cashFlow.horizon_180d.expected.outflows_inr,
          net: cashFlow.horizon_180d.expected.net_inr,
        },
      ]
    : [];

  const custChartData = (customers ?? []).map((p) => ({
    month: fmtMonth(p.month),
    conservative: p.new_customers_conservative,
    expected: p.new_customers_expected,
    optimistic: p.new_customers_optimistic,
  }));

  // ── KPI values for selected scenario ─────────────────────────────────────

  const rev30 = revenue
    ? scenario === "conservative"
      ? revenue.horizon_30d.conservative_inr
      : scenario === "expected"
      ? revenue.horizon_30d.expected_inr
      : revenue.horizon_30d.optimistic_inr
    : null;

  const rev90 = revenue
    ? scenario === "conservative"
      ? revenue.horizon_90d.conservative_inr
      : scenario === "expected"
      ? revenue.horizon_90d.expected_inr
      : revenue.horizon_90d.optimistic_inr
    : null;

  const rev180 = revenue
    ? scenario === "conservative"
      ? revenue.horizon_180d.conservative_inr
      : scenario === "expected"
      ? revenue.horizon_180d.expected_inr
      : revenue.horizon_180d.optimistic_inr
    : null;

  const HORIZONS = ["30 Days", "90 Days", "6 Months"] as const;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Forecasting"
        subtitle={
          revenue
            ? `Based on ${revenue.months_of_data} months of historical data · ${revenue.growth_rate_pct > 0 ? "+" : ""}${revenue.growth_rate_pct}% observed monthly growth`
            : "Forward-looking projections from historical trends"
        }
      />

      {/* ── Scenario selector ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground font-medium mr-1">Scenario:</span>
        {SCENARIOS.map((s) => (
          <button
            key={s.key}
            onClick={() => setScenario(s.key)}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors",
              scenario === s.key ? s.bg + " " + s.color : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* ── KPI cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {revLoading ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : (
          <>
            {[
              { label: "Next 30 Days Revenue", value: rev30, sub: "1 month projection" },
              { label: "Next 90 Days Revenue", value: rev90, sub: "3 month projection" },
              { label: "Next 6 Months Revenue", value: rev180, sub: "6 month projection" },
            ].map(({ label, value, sub }) => (
              <div key={label} className="rounded-xl border border-border bg-card p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
                <p className="text-3xl font-bold tabular-nums text-foreground mt-2">
                  {value != null ? formatINR(value) : "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{sub} · {SCENARIOS.find(s => s.key === scenario)?.label}</p>
              </div>
            ))}
          </>
        )}
      </div>

      {/* ── Revenue Forecast Chart ─────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-1">
          <p className="text-sm font-semibold text-foreground">Revenue Forecast</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Historical actuals (solid) + 6-month projection (dashed) · baseline ₹{(revenue?.baseline_monthly_inr ?? 0).toLocaleString("en-IN")}/month
          </p>
        </div>

        {chartLoading ? (
          <div className="h-56 animate-pulse rounded-lg bg-muted mt-4" />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={revenueChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval={1} />
              <YAxis tickFormatter={(v) => fmtK(v)} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={52} />
              <Tooltip content={(props) => <RevTooltip {...props} />} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Area dataKey="actual" name="actual" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.15} strokeWidth={2} dot={false} connectNulls />
              <Line dataKey="conservative" name="conservative" stroke="#6b7280" strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls />
              <Line dataKey="expected" name="expected" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="6 3" dot={false} connectNulls />
              <Line dataKey="optimistic" name="optimistic" stroke="#10b981" strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Scenario comparison table ──────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-sm font-semibold text-foreground mb-4">Scenario Analysis — Revenue</p>
        {revLoading ? (
          <div className="h-32 animate-pulse rounded-lg bg-muted" />
        ) : revenue ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Horizon</th>
                <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Conservative</th>
                <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider text-violet-400">Expected</th>
                <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">Optimistic</th>
              </tr>
            </thead>
            <tbody>
              {[
                { horizon: "30 Days", h: revenue.horizon_30d },
                { horizon: "90 Days", h: revenue.horizon_90d },
                { horizon: "6 Months", h: revenue.horizon_180d },
              ].map(({ horizon, h }) => (
                <tr key={horizon} className="border-b border-border/50 last:border-0">
                  <td className="py-3 font-medium text-foreground">{horizon}</td>
                  <td className="py-3 text-right tabular-nums text-muted-foreground">{formatINR(h.conservative_inr)}</td>
                  <td className="py-3 text-right tabular-nums text-violet-400 font-semibold">{formatINR(h.expected_inr)}</td>
                  <td className="py-3 text-right tabular-nums text-emerald-400">{formatINR(h.optimistic_inr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {revenue && (
          <p className="text-[11px] text-muted-foreground mt-3">
            Conservative = flat baseline. Expected = +{revenue.growth_rate_pct}% MoM (regression over {revenue.months_of_data} months). Optimistic = +{Math.round(revenue.growth_rate_pct * 1.5 * 10) / 10}% MoM.
          </p>
        )}
      </div>

      {/* ── Cash Flow Forecast ────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-1">
          <p className="text-sm font-semibold text-foreground">Cash Flow Forecast</p>
          <p className="text-xs text-muted-foreground mt-0.5">Expected scenario · inflows, outflows, net</p>
        </div>

        {cashLoading ? (
          <div className="h-56 animate-pulse rounded-lg bg-muted mt-4" />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={cashChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={(v) => fmtK(v)} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={52} />
              <Tooltip content={(props) => <CashTooltip {...props} />} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Bar dataKey="inflows" name="inflows" fill="#8b5cf6" fillOpacity={0.8} radius={[3, 3, 0, 0]} />
              <Bar dataKey="outflows" name="outflows" fill="#f43f5e" fillOpacity={0.7} radius={[3, 3, 0, 0]} />
              <Bar dataKey="net" name="net" fill="#10b981" fillOpacity={0.8} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}

        {cashFlow && (
          <div className="mt-4 p-3 rounded-lg bg-muted/40 border border-border/50 text-[11px] text-muted-foreground space-y-1">
            <p className="font-medium text-foreground text-xs">Cost Assumptions</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
              <div><span className="block font-medium">{cashFlow.cogs_pct}%</span>COGS (landed cost)</div>
              <div><span className="block font-medium">{cashFlow.shipping_pct}%</span>Shipping</div>
              <div><span className="block font-medium">{cashFlow.return_rate_pct}%</span>Returns</div>
              <div><span className="block font-medium">{cashFlow.total_outflow_pct}%</span>Total outflow</div>
            </div>
            <p className="flex items-start gap-1 mt-2">
              <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
              {cashFlow.note}
            </p>
          </div>
        )}

        {/* Cash flow scenario table */}
        {!cashLoading && cashFlow && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Net Cash by Scenario</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Horizon</th>
                  <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Conservative</th>
                  <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider text-violet-400">Expected</th>
                  <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">Optimistic</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "30 Days", h: cashFlow.horizon_30d },
                  { label: "90 Days", h: cashFlow.horizon_90d },
                  { label: "6 Months", h: cashFlow.horizon_180d },
                ].map(({ label, h }) => (
                  <tr key={label} className="border-b border-border/50 last:border-0">
                    <td className="py-3 font-medium text-foreground">{label}</td>
                    <td className="py-3 text-right tabular-nums text-muted-foreground">{formatINR(h.conservative.net_inr)}</td>
                    <td className="py-3 text-right tabular-nums text-violet-400 font-semibold">{formatINR(h.expected.net_inr)}</td>
                    <td className="py-3 text-right tabular-nums text-emerald-400">{formatINR(h.optimistic.net_inr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Two-column: Customer + Inventory ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Customer Forecast */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-1">
            <p className="text-sm font-semibold text-foreground">Customer Growth Forecast</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              New customers / month · {customers?.[0]?.repeat_rate_pct ?? "—"}% historical repeat rate
            </p>
          </div>

          {custLoading ? (
            <div className="h-48 animate-pulse rounded-lg bg-muted mt-4" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={custChartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <Tooltip content={(props) => <CustTooltip {...props} />} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                <Line dataKey="conservative" name="conservative" stroke="#6b7280" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                <Line dataKey="expected" name="expected" stroke="#8b5cf6" strokeWidth={2} dot={{ fill: "#8b5cf6", r: 3 }} />
                <Line dataKey="optimistic" name="optimistic" stroke="#10b981" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}

          {customers && customers.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg bg-muted/40 p-2.5">
                <span className="text-muted-foreground block">Projected new (6M total)</span>
                <span className="text-foreground font-semibold text-sm">
                  ~{customers.reduce((s, p) => s + p.new_customers_expected, 0)}
                </span>
              </div>
              <div className="rounded-lg bg-muted/40 p-2.5">
                <span className="text-muted-foreground block">Cumulative customers (6M)</span>
                <span className="text-foreground font-semibold text-sm">
                  ~{customers[customers.length - 1]?.cumulative_expected ?? "—"}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Inventory placeholder */}
        <div className="rounded-xl border border-border bg-card p-5 flex flex-col">
          <div className="mb-1">
            <p className="text-sm font-semibold text-foreground">Inventory Forecast</p>
            <p className="text-xs text-muted-foreground mt-0.5">SKU-level demand projection</p>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center text-center py-10 gap-3">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <Package className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Inventory forecast pending seed data</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[240px]">
                SKU-level demand projections will appear once inventory movement history is populated.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Methodology note ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border/50 bg-muted/30 p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Methodology</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          All projections use real historical order data only — no numbers are fabricated.
          Baseline = trailing 3-month average of commercial orders (BR-201 exclusions applied).
          Growth rate = linear regression slope over the last 6 complete calendar months, capped at −5% to +20% MoM.
          Conservative = 0% growth. Expected = observed trend. Optimistic = 1.5× trend, capped at 25% MoM.
          See <code className="font-mono">docs/FORECASTING_METHOD.md</code> for full methodology.
        </p>
      </div>
    </div>
  );
}
