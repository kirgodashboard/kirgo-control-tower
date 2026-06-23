"use client";

import { useEffect } from "react";
import { X, ExternalLink, Package, Truck, User, CreditCard, Tag, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useOrderDetail } from "@/lib/hooks/use-registers";
import { formatINR } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import type { OrderDetail } from "@/types/registers";

interface Props {
  orderId: number | null;
  onClose: () => void;
  wcStoreUrl?: string;
}

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtDateShort(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
}

function ClassBadge({ cls }: { cls: string }) {
  const map: Record<string, string> = {
    paid_sale:           "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    influencer_promotion:"bg-violet-500/10 text-violet-400 border-violet-500/20",
    brand_seeding:       "bg-blue-500/10 text-blue-400 border-blue-500/20",
    internal_use:        "bg-muted text-muted-foreground border-border",
    replacement:         "bg-amber-500/10 text-amber-400 border-amber-500/20",
    unclassified:        "bg-orange-500/10 text-orange-400 border-orange-500/20",
  };
  return (
    <span className={cn("inline-flex rounded border px-2 py-0.5 text-[11px] font-semibold", map[cls] ?? "bg-muted text-muted-foreground border-border")}>
      {cls.replace(/_/g, " ")}
    </span>
  );
}

function ShipmentBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground text-xs">No shipment</span>;
  const color = status === "DELIVERED" ? "text-emerald-400" : status.includes("RTO") || status === "LOST" ? "text-red-400" : "text-amber-400";
  return <span className={cn("text-xs font-medium", color)}>{status}</span>;
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-muted-foreground/60">{icon}</span>
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs text-foreground text-right">{value ?? "—"}</span>
    </div>
  );
}

function DrawerContent({ order, wcStoreUrl }: { order: OrderDetail; wcStoreUrl?: string }) {
  const wcUrl = wcStoreUrl
    ? `${wcStoreUrl.replace(/\/$/, "")}/wp-admin/post.php?post=${order.wc_order_id}&action=edit`
    : null;

  const lineTotal = order.line_items.reduce((s, l) => s + (l.line_total ?? 0), 0);

  return (
    <div className="flex flex-col gap-6 p-5 overflow-y-auto flex-1">

      {/* Header summary */}
      <div className="rounded-xl border border-border bg-muted/30 p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-base font-bold text-foreground">#{order.order_number}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{fmtDate(order.ordered_at)}</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold tabular-nums text-foreground">{formatINR(order.order_total_inr)}</p>
            <div className="flex items-center gap-1.5 justify-end mt-1">
              <ClassBadge cls={order.classification} />
              <ShipmentBadge status={order.shipment_status} />
            </div>
          </div>
        </div>
        {/* Revenue recognized bar */}
        <div className={cn("flex items-center gap-1.5 text-[11px] mt-1", order.revenue_recognized ? "text-emerald-400" : "text-muted-foreground")}>
          {order.revenue_recognized
            ? <><CheckCircle2 className="h-3.5 w-3.5" /> Revenue recognized</>
            : <><XCircle className="h-3.5 w-3.5" /> Not yet recognized</>}
          {order.delivered_at && <span className="ml-1">— delivered {fmtDateShort(order.delivered_at)}</span>}
        </div>
      </div>

      {/* Line items */}
      <Section icon={<Package className="h-3.5 w-3.5" />} title="Line Items">
        {order.line_items.length === 0 ? (
          <p className="text-xs text-muted-foreground">No line items synced yet.</p>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/30 border-b border-border">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Product</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">SKU</th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Qty</th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Unit</th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody>
                {order.line_items.map((li) => (
                  <tr key={li.line_item_id} className="border-b border-border/40 last:border-0">
                    <td className="px-3 py-2 max-w-[160px]">
                      <p className="truncate font-medium">{li.product_name || "—"}</p>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground font-mono">{li.sku || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{li.quantity}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatINR(li.unit_price_inr)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{formatINR(li.line_total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-border bg-muted/20">
                <tr>
                  <td colSpan={4} className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Lines Total</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-foreground">{formatINR(lineTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Section>

      {/* Amounts */}
      <Section icon={<CreditCard className="h-3.5 w-3.5" />} title="Amounts">
        <div className="rounded-lg border border-border p-3">
          <Row label="Subtotal" value={formatINR(order.subtotal_inr)} />
          {order.discount_inr > 0 && <Row label="Discount" value={<span className="text-red-400">−{formatINR(order.discount_inr)}</span>} />}
          {order.shipping_inr > 0 && <Row label="Shipping" value={formatINR(order.shipping_inr)} />}
          <Row label="Order Total" value={<span className="font-bold">{formatINR(order.order_total_inr)}</span>} />
          <Row label="Payment Method" value={order.payment_method} />
          {order.transaction_id && <Row label="Transaction ID" value={<span className="font-mono text-[11px]">{order.transaction_id}</span>} />}
        </div>
      </Section>

      {/* Shipment */}
      <Section icon={<Truck className="h-3.5 w-3.5" />} title="Shipment">
        <div className="rounded-lg border border-border p-3">
          <Row label="Status" value={<ShipmentBadge status={order.shipment_status} />} />
          <Row label="Delivered" value={fmtDateShort(order.delivered_at)} />
          {order.freight_inr != null && <Row label="Freight" value={formatINR(order.freight_inr)} />}
          {order.cod_payable_inr != null && <Row label="COD Payable" value={formatINR(order.cod_payable_inr)} />}
          {order.cod_remittance_date && <Row label="COD Remitted" value={fmtDateShort(order.cod_remittance_date)} />}
        </div>
      </Section>

      {/* Customer */}
      <Section icon={<User className="h-3.5 w-3.5" />} title="Customer">
        <div className="rounded-lg border border-border p-3">
          <Row label="Name" value={order.customer_name || "Guest"} />
          <Row label="Email" value={order.customer_email} />
          <Row label="Phone" value={order.customer_phone} />
          <Row label="City" value={[order.billing_city, order.billing_state, order.billing_pincode].filter(Boolean).join(", ") || null} />
        </div>
      </Section>

      {/* Attribution */}
      {(order.attribution_source || order.attribution_medium || order.attribution_campaign) && (
        <Section icon={<Tag className="h-3.5 w-3.5" />} title="Attribution">
          <div className="rounded-lg border border-border p-3">
            <Row label="Source" value={order.attribution_source} />
            <Row label="Medium" value={order.attribution_medium} />
            <Row label="Campaign" value={order.attribution_campaign} />
          </div>
        </Section>
      )}

      {/* Source record link */}
      <div className="border-t border-border pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Source Records</p>
        {wcUrl ? (
          <a
            href={wcUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            WooCommerce Order #{order.wc_order_id}
          </a>
        ) : (
          <p className="text-xs text-muted-foreground">WC Order ID: <span className="font-mono">{order.wc_order_id}</span></p>
        )}
      </div>
    </div>
  );
}

export function OrderDetailDrawer({ orderId, onClose, wcStoreUrl }: Props) {
  const { data: order, isLoading } = useOrderDetail(orderId);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const isOpen = orderId !== null;

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          "fixed top-0 right-0 z-50 h-full w-full max-w-[480px] bg-card border-l border-border shadow-2xl flex flex-col transition-transform duration-250 ease-out",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <p className="text-sm font-semibold text-foreground">Order Detail</p>
            {order && <p className="text-[11px] text-muted-foreground">#{order.order_number}</p>}
          </div>
          <button
            onClick={onClose}
            className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {isLoading && (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && order && <DrawerContent order={order} wcStoreUrl={wcStoreUrl} />}
        {!isLoading && !order && orderId && (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Order not found.
          </div>
        )}
      </div>
    </>
  );
}
