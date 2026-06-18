"use client";

import { useTopCities } from "@/lib/hooks/use-customers";
import { formatINR, formatCount } from "@/lib/utils/format";

export function TopCitiesTable() {
  const { data = [], isLoading } = useTopCities();

  const maxRevenue = data.length > 0 ? Math.max(...data.map((r) => Number(r.revenue_inr))) : 1;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">
        Top Cities by Revenue
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-xs text-muted-foreground font-medium pb-2 pr-4">#</th>
              <th className="text-left text-xs text-muted-foreground font-medium pb-2 pr-4">City</th>
              <th className="text-left text-xs text-muted-foreground font-medium pb-2 pr-8">Revenue share</th>
              <th className="text-right text-xs text-muted-foreground font-medium pb-2 pr-4">Revenue</th>
              <th className="text-right text-xs text-muted-foreground font-medium pb-2 pr-4">Orders</th>
              <th className="text-right text-xs text-muted-foreground font-medium pb-2">Customers</th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border/50">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="py-3 pr-4">
                      <div className="h-3 rounded skeleton" style={{ width: j === 2 ? "100px" : "60px" }} />
                    </td>
                  ))}
                </tr>
              ))}
            {!isLoading && data.map((row, idx) => {
              const pct = (Number(row.revenue_inr) / maxRevenue) * 100;
              return (
                <tr key={`${row.city}-${row.state}`} className="border-b border-border/30 hover:bg-accent/30 transition-colors">
                  <td className="py-3 pr-4 text-muted-foreground text-xs">{idx + 1}</td>
                  <td className="py-3 pr-4">
                    <span className="font-medium text-foreground">{row.city}</span>
                    <span className="text-muted-foreground ml-1 text-xs">{row.state}</span>
                  </td>
                  <td className="py-3 pr-8">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 bg-muted rounded-full flex-1 max-w-24">
                        <div className="h-1.5 bg-violet-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground w-8">{Math.round(pct)}%</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">{formatINR(Number(row.revenue_inr))}</td>
                  <td className="py-3 pr-4 text-right tabular-nums text-muted-foreground">{formatCount(row.order_count)}</td>
                  <td className="py-3 text-right tabular-nums text-muted-foreground">{formatCount(row.customer_count)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
