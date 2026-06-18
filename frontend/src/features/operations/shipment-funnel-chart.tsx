"use client";

import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { useShipmentFunnel } from "@/lib/hooks/use-operations";

export function ShipmentFunnelChart() {
  const { data = [], isLoading } = useShipmentFunnel();

  const chartData = data
    .filter((r) => Number(r.total_orders) > 0)
    .map((r) => ({
      month: new Date(r.month).toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
      Delivered: Number(r.delivered),
      "In Transit": Number(r.in_transit),
      RTO: Number(r.rto),
      Pending: Number(r.pending),
    }));

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">
        Monthly Shipment Outcomes
      </p>
      {isLoading ? (
        <div className="h-52 bg-muted animate-pulse rounded" />
      ) : chartData.length === 0 ? (
        <div className="h-52 flex items-center justify-center text-xs text-muted-foreground">No data</div>
      ) : (
        <ResponsiveContainer width="100%" height={208}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              width={32}
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
            <Bar dataKey="Delivered" stackId="a" fill="#10b981" isAnimationActive={false} />
            <Bar dataKey="In Transit" stackId="a" fill="#06b6d4" isAnimationActive={false} />
            <Bar dataKey="RTO" stackId="a" fill="#ef4444" isAnimationActive={false} />
            <Bar dataKey="Pending" stackId="a" fill="#6b7280" radius={[2, 2, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
