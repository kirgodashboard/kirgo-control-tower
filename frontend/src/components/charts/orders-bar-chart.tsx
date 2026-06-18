"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { formatDate } from "@/lib/utils/format";

interface OrdersBarChartProps {
  data: Array<{ period: string; orders_count: number }>;
  height?: number;
  compact?: boolean;
}

export function OrdersBarChart({
  data,
  height = 200,
  compact = false,
}: OrdersBarChartProps) {
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
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: compact ? 0 : 8 }}>
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
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
            width={32}
          />
        )}
        <Tooltip
          formatter={(v) => [v as number, "Orders"]}
          labelFormatter={(l) => formatDate(l)}
          contentStyle={{
            background: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "6px",
            fontSize: 12,
          }}
        />
        <Bar
          dataKey="orders_count"
          fill="#06b6d4"
          radius={[2, 2, 0, 0]}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
