"use client";

import { useEffect, useState } from "react";
import { X, Loader2, CheckCircle2, XCircle, ChevronRight, Mail, Phone, MapPin } from "lucide-react";
import { useCustomerOrders } from "@/lib/hooks/use-registers";
import { formatINR, formatCount } from "@/lib/utils/format";
import { OrderDetailDrawer } from "@/features/sales/order-detail-drawer";
import type { CustomerRegisterRow } from "@/types/registers";

interface Props {
  customer: CustomerRegisterRow | null;
  onClose: () => void;
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
}

function statusColor(status: string) {
  const s = status.toLowerCase();
  if (s === "completed") return "text-emerald-400";
  if (s === "cancelled" || s === "refunded" || s === "failed") return "text-red-400";
  return "text-amber-400";
}

function shipmentColor(status: string | null) {
  if (!status) return "text-muted-foreground";
  const s = status.toUpperCase();
  if (s === "DELIVERED") return "text-emerald-400";
  if (s.startsWith("RTO") || s === "LOST") return "text-red-400";
  return "text-amber-400";
}

function segmentLabel(segment: string) {
  if (segment === "high_value") return { label: "High Value", cls: "border-violet-500/20 bg-violet-500/10 text-violet-400" };
  if (segment === "repeat")     return { label: "Repeat",     cls: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400" };
  return                               { label: "New",        cls: "border-border bg-muted text-muted-foreground" };
}

export function CustomerOrderDrawer({ customer, onClose }: Props) {
  const customerId = customer?.customer_id ?? null;
  const { data: orders, isLoading } = useCustomerOrders(customerId);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  useEffect(() => {
    if (!customer) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && !selectedOrderId) onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [customer, selectedOrderId, onClose]);

  if (!customer) return null;

  const rows = orders ?? [];
  const seg = segmentLabel(customer.segment);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 w-full max-w-xl bg-card border-l border-border z-50 flex flex-col overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-[15px] font-bold text-foreground truncate">
                  {customer.customer_name || "Unknown Customer"}
                </p>
                <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold ${seg.cls}`}>
                  {seg.label}
                </span>
              </div>
              <div className="flex flex-wrap gap-3 mt-1.5 text-[11px] text-muted-foreground">
                {customer.email && (
                  <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{customer.email}</span>
                )}
                {customer.phone && (
                  <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{customer.phone}</span>
                )}
                {customer.city && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />{customer.city}{customer.state ? `, ${customer.state}` : ""}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="h-8 w-8 flex-shrink-0 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* LTV strip */}
        <div className="grid grid-cols-4 border-b border-border bg-muted/20 flex-shrink-0">
          {[
            { label: "Orders",     value: formatCount(customer.total_orders) },
            { label: "Revenue",    value: formatINR(customer.total_revenue_inr) },
            { label: "Avg Order",  value: formatINR(customer.avg_order_value_inr) },
            { label: "Last Order", value: customer.days_since_last_order != null ? `${customer.days_since_last_order}d ago` : "—" },
          ].map(({ label, value }) => (
            <div key={label} className="px-4 py-3 border-r border-border last:border-0">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
              <p className="text-sm font-bold tabular-nums mt-0.5">{value}</p>
            </div>
          ))}
        </div>

        {/* Order list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">No orders found.</div>
          ) : (
            <table className="w-full text-[12px]">
              <thead className="border-b border-border bg-muted/30 sticky top-0">
                <tr>
                  {["Date", "Order #", "Status", "Shipment", "Amount", "✓", ""].map((h) => (
                    <th key={h} className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.order_id}
                    className="border-b border-border/40 hover:bg-violet-500/[0.04] last:border-0 cursor-pointer"
                    onClick={() => setSelectedOrderId(row.order_id)}
                  >
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{fmtDate(row.ordered_at)}</td>
                    <td className="px-4 py-2.5 font-mono whitespace-nowrap">#{row.order_number}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className={`capitalize ${statusColor(row.order_status)}`}>{row.order_status}</span>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className={`text-[11px] ${shipmentColor(row.shipment_status)}`}>
                        {row.shipment_status ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">{formatINR(row.order_total_inr)}</td>
                    <td className="px-4 py-2.5 text-center">
                      {row.revenue_recognized
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 inline" />
                        : <XCircle className="h-3.5 w-3.5 text-muted-foreground/40 inline" />}
                    </td>
                    <td className="px-4 py-2.5">
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <OrderDetailDrawer
        orderId={selectedOrderId}
        onClose={() => setSelectedOrderId(null)}
      />
    </>
  );
}
