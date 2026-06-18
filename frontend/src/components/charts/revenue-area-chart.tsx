"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { formatINR, formatDate } from "@/lib/utils/format";

interface RevenueAreaChartProps {
  data: Array<{ period: string; revenue_inr: number }>;
  height?: number;
  compact?: boolean;
  color?: string;
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-xl text-[12px]">
      <p className="text-muted-foreground mb-1">{formatDate(label ?? "")}</p>
      <p className="font-semibold text-foreground tabular-nums">{formatINR(payload[0].value, false)}</p>
    </div>
  );
};

export function RevenueAreaChart({
  data,
  height = 220,
  compact = false,
  color = "#8b5cf6",
}: RevenueAreaChartProps) {
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
      <AreaChart data={data} margin={{ top: 6, right: 2, bottom: 0, left: compact ? -20 : 0 }}>
        <defs>
          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
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
            tickFormatter={(v) => formatINR(v)}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))", fontWeight: 400 }}
            axisLine={false}
            tickLine={false}
            width={56}
          />
        )}
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1.5 }} />
        <Area
          type="monotone"
          dataKey="revenue_inr"
          stroke={color}
          strokeWidth={2}
          fill="url(#revGrad)"
          isAnimationActive={false}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
