"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { formatDate } from "@/lib/utils/format";

interface OrdersBarChartProps {
  data: Array<{ period: string; orders_count: number }>;
  height?: number;
  compact?: boolean;
  color?: string;
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-xl text-[12px]">
      <p className="text-muted-foreground mb-1">{formatDate(label ?? "")}</p>
      <p className="font-semibold text-foreground tabular-nums">{payload[0].value} orders</p>
    </div>
  );
};

export function OrdersBarChart({
  data,
  height = 220,
  compact = false,
  color = "#06b6d4",
}: OrdersBarChartProps) {
  if (!data || data.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 text-muted-foreground"
        style={{ height }}
      >
        <p className="text-[12px]">No data for this period</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 6, right: 2, bottom: 0, left: compact ? -20 : 0 }}>
        {!compact && (
          <CartesianGrid
            strokeDasharray="4 4"
            stroke="hsl(var(--border))"
            vertical={false}
          />
        )}
        {!compact && (
          <XAxis
            dataKey="period"
            tickFormatter={(v) => new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))", fontWeight: 400 }}
            axisLine={false}
            tickLine={false}
            tickMargin={8}
          />
        )}
        {!compact && (
          <YAxis
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))", fontWeight: 400 }}
            axisLine={false}
            tickLine={false}
            width={32}
          />
        )}
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--accent))" }} />
        <Bar dataKey="orders_count" radius={[3, 3, 0, 0]} isAnimationActive={false} maxBarSize={24}>
          {data.map((_, i) => (
            <Cell key={i} fill={color} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
