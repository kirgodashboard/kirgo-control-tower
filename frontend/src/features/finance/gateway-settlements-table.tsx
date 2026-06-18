"use client";

import { useGatewaySettlements } from "@/lib/hooks/use-finance";
import { formatINR, formatCount } from "@/lib/utils/format";

const GATEWAY_LABELS: Record<string, string> = {
  easebuzz: "EaseBuzz",
  shiprocket_cod: "ShiprocketCOD",
  razorpay: "Razorpay",
  paytm: "Paytm",
  phonepe: "PhonePe",
};

export function GatewaySettlementsTable() {
  const { data = [], isLoading } = useGatewaySettlements();

  // Group by gateway with totals
  const byGateway = (data as { gateway: string; month: string; settlement_count: number; orders_settled: number | null; amount_inr: number }[])
    .reduce((acc, row) => {
      const key = row.gateway;
      if (!acc[key]) acc[key] = { gateway: key, settlement_count: 0, amount_inr: 0 };
      acc[key].settlement_count += Number(row.settlement_count);
      acc[key].amount_inr += Number(row.amount_inr);
      return acc;
    }, {} as Record<string, { gateway: string; settlement_count: number; amount_inr: number }>);

  const rows = Object.values(byGateway).sort((a, b) => b.amount_inr - a.amount_inr);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">
        Gateway Settlements
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-xs text-muted-foreground font-medium pb-2 pr-4">Gateway</th>
              <th className="text-right text-xs text-muted-foreground font-medium pb-2 pr-4">Settlements</th>
              <th className="text-right text-xs text-muted-foreground font-medium pb-2">Amount Settled</th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b border-border/50">
                  {Array.from({ length: 3 }).map((_, j) => (
                    <td key={j} className="py-3 pr-4">
                      <div className="h-3 rounded skeleton" style={{ width: "80px" }} />
                    </td>
                  ))}
                </tr>
              ))}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={3} className="py-6 text-center text-xs text-muted-foreground">No settlement data</td>
              </tr>
            )}
            {!isLoading &&
              rows.map((row) => (
                <tr key={row.gateway} className="border-b border-border/30 hover:bg-accent/30 transition-colors">
                  <td className="py-3 pr-4 font-medium text-foreground">
                    {GATEWAY_LABELS[row.gateway] ?? row.gateway}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums text-muted-foreground">
                    {formatCount(row.settlement_count)}
                  </td>
                  <td className="py-3 text-right tabular-nums">{formatINR(row.amount_inr)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
