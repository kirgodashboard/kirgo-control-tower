"use client";

import { useCodReconciliation } from "@/lib/hooks/use-operations";
import { formatINR } from "@/lib/utils/format";
import { CheckCircle, XCircle } from "lucide-react";

export function CodTable() {
  const { data = [], isLoading } = useCodReconciliation();

  const outstanding = (data as {
    awb_code: string;
    order_total_inr: number;
    cod_payable_inr: number;
    customer_name: string;
    delivered_at: string;
    days_outstanding: number;
    cod_crf_id: string | null;
    is_reconciled: boolean;
  }[]).filter((r) => !r.is_reconciled);

  const totalOutstanding = outstanding.reduce((s, r) => s + Number(r.order_total_inr), 0);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[17px] font-semibold text-foreground">
          COD Reconciliation
        </p>
        {!isLoading && outstanding.length > 0 && (
          <span className="text-[13px] text-amber-400 font-medium">
            {outstanding.length} unreconciled · {formatINR(totalOutstanding)} pending
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground pb-3 pr-4">AWB</th>
              <th className="text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground pb-3 pr-4">Customer</th>
              <th className="text-right text-[11px] font-semibold uppercase tracking-widest text-muted-foreground pb-3 pr-4">Order Value</th>
              <th className="text-right text-[11px] font-semibold uppercase tracking-widest text-muted-foreground pb-3 pr-4">Days Out</th>
              <th className="text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground pb-3 pr-4">CRF ID</th>
              <th className="text-center text-[11px] font-semibold uppercase tracking-widest text-muted-foreground pb-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border/50">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <td key={j} className="py-4 pr-4">
                      <div className="h-4 rounded skeleton" style={{ width: "60px" }} />
                    </td>
                  ))}
                </tr>
              ))}
            {!isLoading && outstanding.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-[14px] text-emerald-500">
                  All COD reconciled
                </td>
              </tr>
            )}
            {!isLoading &&
              outstanding.slice(0, 20).map((row) => (
                <tr key={row.awb_code} className="border-b border-border/30 hover:bg-accent/30 transition-colors">
                  <td className="py-4 pr-4 font-mono text-[13px] text-foreground">
                    <span className="block">{row.awb_code}</span>
                    <span className="text-[11px] text-muted-foreground">{row.customer_name}</span>
                  </td>
                  <td className="py-4 pr-4 text-right text-[15px] tabular-nums font-medium">{formatINR(row.order_total_inr, false)}</td>
                  <td className={`py-4 pr-4 text-right text-[15px] tabular-nums font-semibold ${Number(row.days_outstanding) > 30 ? "text-red-400" : Number(row.days_outstanding) > 14 ? "text-amber-400" : "text-muted-foreground"}`}>
                    {Math.floor(row.days_outstanding)}d
                  </td>
                  <td className="py-4 pr-4 text-[14px] text-muted-foreground">{row.cod_crf_id ?? "—"}</td>
                  <td className="py-4 text-center">
                    {row.is_reconciled
                      ? <CheckCircle className="h-4 w-4 text-emerald-500 mx-auto" />
                      : <XCircle className="h-4 w-4 text-red-400 mx-auto" />
                    }
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
