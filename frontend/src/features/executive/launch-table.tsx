"use client";

import { useLaunchPerformance } from "@/lib/hooks/use-executive";
import { formatINR, formatCount, formatDate } from "@/lib/utils/format";

export function LaunchTable() {
  const { data = [], isLoading } = useLaunchPerformance();

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">
        Launch Performance
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-xs text-muted-foreground font-medium pb-2 pr-4">Launch</th>
              <th className="text-left text-xs text-muted-foreground font-medium pb-2 pr-4">Live Date</th>
              <th className="text-right text-xs text-muted-foreground font-medium pb-2 pr-4">Revenue</th>
              <th className="text-right text-xs text-muted-foreground font-medium pb-2 pr-4">Orders</th>
              <th className="text-right text-xs text-muted-foreground font-medium pb-2">AOV</th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-border/50">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <td key={j} className="py-3 pr-4">
                      <div className="h-3 rounded skeleton" style={{ width: j === 0 ? "120px" : "60px" }} />
                    </td>
                  ))}
                </tr>
              ))}
            {!isLoading && data.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-xs text-muted-foreground">
                  No launch data available
                </td>
              </tr>
            )}
            {!isLoading &&
              data.map((row) => (
                <tr key={row.launch_id} className="border-b border-border/30 hover:bg-accent/30 transition-colors">
                  <td className="py-3 pr-4 font-medium text-foreground">{row.launch_name}</td>
                  <td className="py-3 pr-4 text-muted-foreground text-xs">{formatDate(row.live_date)}</td>
                  <td className="py-3 pr-4 text-right tabular-nums">{formatINR(row.revenue_inr)}</td>
                  <td className="py-3 pr-4 text-right tabular-nums text-muted-foreground">{formatCount(row.orders_count)}</td>
                  <td className="py-3 text-right tabular-nums text-muted-foreground">{formatINR(row.aov_inr)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
