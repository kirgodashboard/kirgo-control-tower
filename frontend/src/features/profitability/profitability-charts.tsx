"use client";

import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis,
  CartesianGrid, Tooltip,
  ReferenceLine, Cell, Legend,
} from "recharts";
import { formatINR } from "@/lib/utils/format";
import {
  useProfitabilityTrend,
  useProductPl,
} from "@/lib/hooks/use-profitability";

// ── Shared tooltip shell ──────────────────────────────────────────────────────

function TooltipShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-xl text-[12px] space-y-1">
      {children}
    </div>
  );
}

function NoData({ height }: { height: number }) {
  return (
    <div
      className="flex items-center justify-center text-[12px] text-muted-foreground"
      style={{ height }}
    >
      No data for this period
    </div>
  );
}

function ChartSkeleton({ height }: { height: number }) {
  return <div className="rounded-lg skeleton" style={{ height }} />;
}

function periodLabel(v: string) {
  const d = new Date(v);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// ── Revenue vs Cost ───────────────────────────────────────────────────────────

export function RevenueCostChart({ start, end }: { start: string; end: string }) {
  const { data = [], isLoading } = useProfitabilityTrend(start, end);
  const height = 220;

  if (isLoading) return <ChartSkeleton height={height} />;
  if (!data.length) return <NoData height={height} />;

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) => {
    if (!active || !payload?.length) return null;
    return (
      <TooltipShell>
        <p className="text-muted-foreground mb-1">{periodLabel(label ?? "")}</p>
        {payload.map((p) => (
          <p key={p.name} style={{ color: p.color }} className="tabular-nums font-medium">
            {p.name}: {formatINR(p.value)}
          </p>
        ))}
      </TooltipShell>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 0 }} barGap={2}>
        <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="period"
          tickFormatter={periodLabel}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false} tickLine={false} tickMargin={8}
        />
        <YAxis
          tickFormatter={(v) => formatINR(v)}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false} tickLine={false} width={58}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--accent))" }} />
        <Legend
          iconType="square" iconSize={8}
          wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
        />
        <Bar dataKey="revenue_inr" name="Revenue" fill="#8b5cf6" radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false} fillOpacity={0.9} />
        <Bar dataKey="cogs_inr"    name="COGS"    fill="#f97316" radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false} fillOpacity={0.85} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Margin Trend ──────────────────────────────────────────────────────────────

export function MarginTrendChart({ start, end }: { start: string; end: string }) {
  const { data = [], isLoading } = useProfitabilityTrend(start, end);
  const height = 220;

  if (isLoading) return <ChartSkeleton height={height} />;
  if (!data.length) return <NoData height={height} />;

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
    if (!active || !payload?.length) return null;
    return (
      <TooltipShell>
        <p className="text-muted-foreground mb-1">{periodLabel(label ?? "")}</p>
        <p className="font-semibold tabular-nums text-emerald-400">{payload[0].value.toFixed(1)}% margin</p>
      </TooltipShell>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="period"
          tickFormatter={periodLabel}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false} tickLine={false} tickMargin={8}
        />
        <YAxis
          tickFormatter={(v) => `${v}%`}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false} tickLine={false} width={40}
          domain={[0, 'auto']}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1.5 }} />
        <ReferenceLine y={35} stroke="#4ade80" strokeDasharray="4 2" strokeWidth={1.5} label={{ value: "35% target", position: "right", fill: "#4ade80", fontSize: 10 }} />
        <Line
          type="monotone"
          dataKey="gross_margin_pct"
          stroke="#4ade80"
          strokeWidth={2}
          dot={{ r: 3, fill: "#4ade80", strokeWidth: 0 }}
          activeDot={{ r: 5 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Top Profit Products ───────────────────────────────────────────────────────

export function TopProfitProductsChart({ start, end }: { start: string; end: string }) {
  const { data = [], isLoading } = useProductPl(start, end);
  const height = 200;

  if (isLoading) return <ChartSkeleton height={height} />;

  const top5 = [...data]
    .sort((a, b) => b.gross_profit_inr - a.gross_profit_inr)
    .slice(0, 5);

  if (!top5.length) return <NoData height={height} />;

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { value: number; payload: { product_name: string } }[] }) => {
    if (!active || !payload?.length) return null;
    return (
      <TooltipShell>
        <p className="text-foreground font-medium">{payload[0].payload.product_name}</p>
        <p className="text-emerald-400 tabular-nums">Profit: {formatINR(payload[0].value)}</p>
      </TooltipShell>
    );
  };

  const COLORS = ["#8b5cf6", "#7c3aed", "#6d28d9", "#5b21b6", "#4c1d95"];

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={top5} layout="vertical" margin={{ top: 2, right: 16, bottom: 2, left: 0 }}>
        <XAxis
          type="number"
          tickFormatter={(v) => formatINR(v)}
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false} tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="product_name"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false} tickLine={false} width={110}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--accent))" }} />
        <Bar dataKey="gross_profit_inr" radius={[0, 3, 3, 0]} isAnimationActive={false} maxBarSize={16}>
          {top5.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.9} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Lowest Margin Products ────────────────────────────────────────────────────

export function LowestMarginProductsChart({ start, end }: { start: string; end: string }) {
  const { data = [], isLoading } = useProductPl(start, end);
  const height = 200;

  if (isLoading) return <ChartSkeleton height={height} />;

  const bottom5 = [...data]
    .filter((r) => r.revenue_inr > 0)
    .sort((a, b) => a.gross_margin_pct - b.gross_margin_pct)
    .slice(0, 5);

  if (!bottom5.length) return <NoData height={height} />;

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { value: number; payload: { product_name: string } }[] }) => {
    if (!active || !payload?.length) return null;
    return (
      <TooltipShell>
        <p className="text-foreground font-medium">{payload[0].payload.product_name}</p>
        <p className="text-amber-400 tabular-nums">Margin: {payload[0].value.toFixed(1)}%</p>
      </TooltipShell>
    );
  };

  const barColor = (pct: number) =>
    pct < 20 ? "#f87171" : pct < 35 ? "#fb923c" : "#4ade80";

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={bottom5} layout="vertical" margin={{ top: 2, right: 16, bottom: 2, left: 0 }}>
        <XAxis
          type="number"
          tickFormatter={(v) => `${v}%`}
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false} tickLine={false}
          domain={[0, 60]}
        />
        <YAxis
          type="category"
          dataKey="product_name"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false} tickLine={false} width={110}
        />
        <ReferenceLine x={35} stroke="#4ade80" strokeDasharray="4 2" strokeWidth={1} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--accent))" }} />
        <Bar dataKey="gross_margin_pct" radius={[0, 3, 3, 0]} isAnimationActive={false} maxBarSize={16}>
          {bottom5.map((row, i) => (
            <Cell key={i} fill={barColor(row.gross_margin_pct)} fillOpacity={0.9} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
