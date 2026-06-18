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

interface CashFlowAreaChartProps {
  data: CashFlowEntry[];
  height?: number;
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
    <div
      style={{
        background: "hsl(var(--popover))",
        border: "1px solid hsl(var(--border))",
        borderRadius: 6,
        padding: "8px 12px",
        fontSize: 12,
      }}
    >
      <p className="font-medium mb-1">{label ? formatDate(label) : ""}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {formatINR(p.value, false)}
        </p>
      ))}
    </div>
  );
}

export function CashFlowAreaChart({ data, height = 200 }: CashFlowAreaChartProps) {
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
      <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id="inflowGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="transaction_date"
          tickFormatter={(v) => {
            const d = new Date(v);
            return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
          }}
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v) => formatINR(v)}
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          width={52}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="inflow_inr"
          name="Inflow"
          stroke="#10b981"
          strokeWidth={1.5}
          fill="url(#inflowGrad)"
          isAnimationActive={false}
        />
        <Bar
          dataKey="outflow_inr"
          name="Outflow"
          fill="#ef4444"
          opacity={0.6}
          radius={[2, 2, 0, 0]}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
