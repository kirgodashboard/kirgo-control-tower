"use client";

import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { useCustomerGrowth } from "@/lib/hooks/use-customers";

export function CustomerGrowthChart() {
  const { data = [], isLoading } = useCustomerGrowth();

  const chartData = data.map((row) => ({
    month: new Date(row.cohort_month).toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
    new_customers: Number(row.new_customers),
    cumulative: Number(row.cumulative_customers),
  }));

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">
        Customer Growth
      </p>
      {isLoading ? (
        <div className="h-52 rounded-lg skeleton" />
      ) : chartData.length === 0 ? (
        <div className="h-52 flex items-center justify-center text-xs text-muted-foreground">No data</div>
      ) : (
        <ResponsiveContainer width="100%" height={208}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="new"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              width={32}
            />
            <YAxis
              yAxisId="cum"
              orientation="right"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "6px",
                fontSize: 12,
              }}
            />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="new" dataKey="new_customers" name="New" fill="#06b6d4" radius={[2, 2, 0, 0]} isAnimationActive={false} />
            <Line yAxisId="cum" dataKey="cumulative" name="Cumulative" stroke="#8b5cf6" strokeWidth={2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
