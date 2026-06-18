"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { formatINR, formatDate } from "@/lib/utils/format";

interface CashFlowEntry {
  transaction_date: string;
  inflow_inr: number;
  outflow_inr: number;
  net_inr: number;
}

interface TooltipPayloadEntry {
  name: string;
  value: number;
  color: string;
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2.5 shadow-xl text-[12px]">
      <p className="text-muted-foreground mb-1.5 font-medium">{label ? formatDate(label) : ""}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <span style={{ color: p.color }} className="font-medium">{p.name}</span>
          <span className="tabular-nums text-foreground">{formatINR(p.value, false)}</span>
        </div>
      ))}
    </div>
  );
}

export function CashFlowAreaChart({ data, height = 220 }: { data: CashFlowEntry[]; height?: number }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center text-[12px] text-muted-foreground" style={{ height }}>
        No cash flow data for this period
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 6, right: 2, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="inflowGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="transaction_date"
          tickFormatter={(v) => new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          tickMargin={8}
        />
        <YAxis
          tickFormatter={(v) => formatINR(v)}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          width={56}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1.5 }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
        <Area
          type="monotone"
          dataKey="inflow_inr"
          name="Inflow"
          stroke="#10b981"
          strokeWidth={2}
          fill="url(#inflowGrad)"
          isAnimationActive={false}
          dot={false}
        />
        <Bar
          dataKey="outflow_inr"
          name="Outflow"
          fill="#ef4444"
          fillOpacity={0.55}
          radius={[2, 2, 0, 0]}
          maxBarSize={16}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
