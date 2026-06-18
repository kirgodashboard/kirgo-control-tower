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
}

export function RevenueAreaChart({
  data,
  height = 200,
  compact = false,
}: RevenueAreaChartProps) {
  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-xs text-muted-foreground"
        style={{ height }}
      >
        No data
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: compact ? 0 : 8 }}>
        <defs>
          <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
          </linearGradient>
        </defs>
        {!compact && (
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        )}
        {!compact && (
          <XAxis
            dataKey="period"
            tickFormatter={(v) => {
              const d = new Date(v);
              return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
            }}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
          />
        )}
        {!compact && (
          <YAxis
            tickFormatter={(v) => formatINR(v)}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
        )}
        <Tooltip
          formatter={(v) => [formatINR(v as number, false), "Revenue"]}
          labelFormatter={(l) => formatDate(l)}
          contentStyle={{
            background: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "6px",
            fontSize: 12,
          }}
        />
        <Area
          type="monotone"
          dataKey="revenue_inr"
          stroke="#8b5cf6"
          strokeWidth={2}
          fill="url(#revenueGrad)"
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
