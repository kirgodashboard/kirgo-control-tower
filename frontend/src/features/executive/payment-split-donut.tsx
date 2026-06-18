"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useExecutiveKpis } from "@/lib/hooks/use-executive";

interface Props {
  start: string;
  end: string;
}

export function PaymentSplitDonut({ start, end }: Props) {
  const { data: kpis, isLoading } = useExecutiveKpis(start, end);

  const codPct = kpis?.cod_pct ?? 0;
  const prepaidPct = Math.max(0, 100 - codPct);

  const chartData = [
    { name: "COD", value: Math.round(codPct * 10) / 10, fill: "#f59e0b" },
    { name: "Prepaid", value: Math.round(prepaidPct * 10) / 10, fill: "#8b5cf6" },
  ];

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">Payment Split</p>
        <div className="h-44 flex items-center justify-center">
          <div className="h-32 w-32 rounded-full bg-muted animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Payment Split</p>
      <p className="text-xs text-muted-foreground mb-4">COD vs Prepaid for period</p>
      <ResponsiveContainer width="100%" height={176}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={52}
            outerRadius={72}
            paddingAngle={3}
            dataKey="value"
            isAnimationActive={false}
          >
            {chartData.map((entry) => (
              <Cell key={entry.name} fill={entry.fill} stroke="transparent" />
            ))}
          </Pie>
          <Tooltip
            formatter={(v) => [`${v as number}%`, ""]}
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "6px",
              fontSize: 12,
            }}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            formatter={(value) => (
              <span className="text-xs text-muted-foreground">{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
