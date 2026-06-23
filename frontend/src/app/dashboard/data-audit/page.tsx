"use client";

import { PageHeader } from "@/components/ui/page-header";
import { formatINR, formatCount } from "@/lib/utils/format";
import {
  useAuditRevenue, useAuditOrders, useAuditShipments,
  useAuditCod, useAuditInfluencerOrders, useAuditSetProducts,
  useAuditRecognitionHealth,
} from "@/lib/hooks/use-audit";
import { useWcSyncStatus } from "@/lib/hooks/use-registers";
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw, Loader2, Clock, AlertOctagon } from "lucide-react";
import { useQueryClient, useIsFetching } from "@tanstack/react-query";

// ─── Traffic light helpers ───────────────────────────────────────────────────

type Light = "green" | "amber" | "red";

function TrafficLight({ status, label }: { status: Light; label: string }) {
  const cfg: Record<Light, { icon: React.ReactNode; cls: string }> = {
    green: {
      icon: <CheckCircle2 className="h-4 w-4" />,
      cls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    },
    amber: {
      icon: <AlertTriangle className="h-4 w-4" />,
      cls: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    },
    red: {
      icon: <XCircle className="h-4 w-4" />,
      cls: "bg-red-500/10 text-red-500 border-red-500/20",
    },
  };
  const { icon, cls } = cfg[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${cls}`}>
      {icon}{label}
    </span>
  );
}

function SectionHeader({ title, status, subtitle }: { title: string; status: Light; subtitle?: string }) {
  return (
    <div className="flex items-start justify-between border-b border-border px-5 py-3">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <TrafficLight status={status} label={status === "green" ? "Healthy" : status === "amber" ? "Review" : "Action Required"} />
    </div>
  );
}

function KV({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div className="grid grid-cols-[200px_1fr] items-baseline gap-4 border-b border-border py-2.5 last:border-0">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`font-mono text-sm ${highlight ? "font-bold text-foreground" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <section className="rounded-xl border border-border bg-card">{children}</section>;
}

function Loading() {
  return <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>;
}

function Err({ msg }: { msg: string }) {
  return <div className="px-5 py-4 text-sm text-red-500">Error: {msg}</div>;
}

// ─── Section 1: Revenue Reconciliation ───────────────────────────────────────

function RevenueSection() {
  const { data, isLoading, error } = useAuditRevenue();
  if (isLoading) return <Panel><Loading /></Panel>;
  if (error || !data) return <Panel><Err msg={String(error)} /></Panel>;

  const varPct = data.gross_rev_orders_inr > 0
    ? Math.abs(data.line_order_variance_inr / data.gross_rev_orders_inr * 100)
    : 0;
  const status: Light =
    data.unclassified_orders === 0 && varPct < 1 ? "green"
    : data.unclassified_orders > 50 || varPct > 5 ? "red"
    : "amber";

  const fmtDate = (s: string | null) =>
    s ? new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

  return (
    <Panel>
      <SectionHeader
        title="Revenue Reconciliation"
        status={status}
        subtitle="WooCommerce order data vs Supabase — line-level vs order-level totals"
      />
      <div className="px-5 py-1">
        <KV label="Total orders in DB"         value={formatCount(data.total_orders)} highlight />
        <KV label="Gross revenue (order_total)" value={formatINR(data.gross_rev_orders_inr)} />
        <KV label="Gross revenue (line_total)"  value={formatINR(data.gross_rev_lines_inr)} />
        <KV
          label="Line ↔ Order variance"
          value={
            <span className={Math.abs(data.line_order_variance_inr) > 1000 ? "text-amber-500" : "text-emerald-500"}>
              {formatINR(data.line_order_variance_inr)} ({varPct.toFixed(1)}%)
            </span>
          }
        />
        <KV label="Commercial orders (BR-201)"  value={`${formatCount(data.commercial_orders)} — ${formatINR(data.commercial_rev_inr)}`} />
        <KV label="Non-commercial orders"       value={`${formatCount(data.non_commercial_orders)} — ${formatINR(data.promo_value_inr)} promo value`} />
        <KV
          label="Unclassified orders"
          value={
            <span className={data.unclassified_orders > 0 ? "text-amber-500" : "text-emerald-500"}>
              {formatCount(data.unclassified_orders)}
            </span>
          }
        />
        <KV label="Delivered orders"           value={formatCount(data.delivered_orders)} />
        <KV label="Recognized revenue (P&L)"   value={formatINR(data.recognized_rev_inr)} highlight />
        <KV label="Date range"                 value={`${fmtDate(data.first_order_at)} → ${fmtDate(data.last_order_at)}`} />
      </div>
      <div className="border-t border-border px-5 py-1">
        <p className="pb-1 pt-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">WooCommerce Sync Runs</p>
        <KV label="Records fetched"  value={formatCount(data.wc_fetched)} />
        <KV label="Records inserted" value={formatCount(data.wc_inserted)} />
        <KV label="Records updated"  value={formatCount(data.wc_updated)} />
        <KV label="Failed runs"      value={<span className={data.wc_failed_runs > 0 ? "text-red-500" : "text-emerald-500"}>{data.wc_failed_runs}</span>} />
        <KV label="Last sync"        value={data.wc_last_sync_at ? new Date(data.wc_last_sync_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false }) + " IST" : "Never"} />
      </div>
    </Panel>
  );
}

// ─── Section 2: Order Reconciliation ─────────────────────────────────────────

function OrderSection() {
  const { data, isLoading, error } = useAuditOrders();
  if (isLoading) return <Panel><Loading /></Panel>;
  if (error || !data) return <Panel><Err msg={String(error)} /></Panel>;

  const ov = data.overview;
  const status: Light =
    ov.completed_no_shipment === 0 && ov.unclassified === 0 ? "green"
    : ov.completed_no_shipment > 20 || ov.unclassified > 100 ? "red"
    : "amber";

  return (
    <Panel>
      <SectionHeader
        title="Order Reconciliation"
        status={status}
        subtitle="WooCommerce order statuses, shipment coverage, and data completeness"
      />
      <div className="px-5 py-1">
        <KV label="Total orders"               value={formatCount(ov.total_orders)} highlight />
        <KV label="With shipment"              value={formatCount(ov.has_shipment)} />
        <KV label="Completed — no shipment"    value={<span className={ov.completed_no_shipment > 0 ? "text-amber-500" : "text-emerald-500"}>{formatCount(ov.completed_no_shipment)}</span>} />
        <KV label="Linked to customer"         value={formatCount(ov.linked_customer)} />
        <KV label="No customer record"         value={<span className={ov.no_customer > 0 ? "text-amber-500" : "text-emerald-500"}>{formatCount(ov.no_customer)}</span>} />
        <KV label="Missing payment method"     value={<span className={ov.no_payment_method > 0 ? "text-amber-500" : "text-emerald-500"}>{formatCount(ov.no_payment_method)}</span>} />
        <KV label="Unclassified orders"        value={<span className={ov.unclassified > 0 ? "text-amber-500" : "text-emerald-500"}>{formatCount(ov.unclassified)}</span>} />
        <KV label="Months of data"             value={ov.months_covered} />
      </div>
      <div className="border-t border-border px-5 pb-4 pt-2">
        <p className="pb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">By Status</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="pb-1.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
              <th className="pb-1.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Orders</th>
              <th className="pb-1.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {data.by_status?.map((row) => (
              <tr key={row.status} className="border-b border-border/50 last:border-0">
                <td className="py-1.5 font-mono text-xs">{row.status}</td>
                <td className="py-1.5 text-right font-mono text-xs">{formatCount(row.cnt)}</td>
                <td className="py-1.5 text-right font-mono text-xs">{formatINR(row.revenue_inr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// ─── Section 3: Shipment Reconciliation ──────────────────────────────────────

function ShipmentSection() {
  const { data, isLoading, error } = useAuditShipments();
  if (isLoading) return <Panel><Loading /></Panel>;
  if (error || !data) return <Panel><Err msg={String(error)} /></Panel>;

  const s = data.shipments, r = data.returns, sy = data.sync;
  const deliverRate = s.total_rows > 0 ? ((s.delivered_ok / s.total_rows) * 100).toFixed(1) : "0.0";
  const rtoRate     = s.total_rows > 0 ? ((s.rto_returned  / s.total_rows) * 100).toFixed(1) : "0.0";

  const status: Light =
    s.orphaned_rows === 0 && s.delivered_no_date === 0 ? "green"
    : s.orphaned_rows > 20 || s.delivered_no_date > 10 ? "red"
    : "amber";

  const fmtTs = (v: string | null) =>
    v ? new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

  return (
    <Panel>
      <SectionHeader
        title="Shipment Reconciliation"
        status={status}
        subtitle="Shiprocket rows vs matched WooCommerce orders — delivery coverage and returns"
      />
      <div className="grid grid-cols-2 divide-x divide-border">
        <div className="px-5 py-1">
          <p className="pb-1 pt-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Shipments</p>
          <KV label="Total rows (Shiprocket)"   value={formatCount(s.total_rows)} highlight />
          <KV label="Unique SR orders"           value={formatCount(s.unique_sr_orders)} />
          <KV label="Linked to WC orders"        value={formatCount(s.linked_wc_orders)} />
          <KV label="Orphaned (no WC match)"     value={<span className={s.orphaned_rows > 0 ? "text-red-500" : "text-emerald-500"}>{formatCount(s.orphaned_rows)}</span>} />
          <KV label="Delivered (with date)"      value={formatCount(s.delivered_ok)} />
          <KV label="Delivered — missing date"   value={<span className={s.delivered_no_date > 0 ? "text-red-500" : "text-emerald-500"}>{formatCount(s.delivered_no_date)}</span>} />
          <KV label="RTO / Returned"             value={formatCount(s.rto_returned)} />
          <KV label="In transit / other"         value={formatCount(s.in_transit)} />
          <KV label="Delivery rate"              value={`${deliverRate}%`} />
          <KV label="RTO rate"                   value={`${rtoRate}%`} />
          <KV label="COD shipments"              value={formatCount(s.cod_rows)} />
          <KV label="Prepaid shipments"          value={formatCount(s.prepaid_rows)} />
          <KV label="Total freight"              value={formatINR(s.total_freight_inr)} />
          <KV label="Total COD payable"          value={formatINR(s.total_cod_payable_inr)} />
          <KV label="Last delivery"              value={fmtTs(s.last_delivery_at)} />
        </div>
        <div className="px-5 py-1">
          <p className="pb-1 pt-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Returns</p>
          <KV label="Total return records"   value={formatCount(r.total_returns)} highlight />
          <KV label="Customer returns"       value={formatCount(r.customer_returns)} />
          <KV label="RTO (courier return)"   value={formatCount(r.rto_returns)} />
          <KV label="QC pass (restockable)"  value={<span className="text-emerald-500">{formatCount(r.qc_pass)}</span>} />
          <KV label="QC fail (write-off)"    value={<span className={r.qc_fail > 0 ? "text-red-500" : "text-muted-foreground"}>{formatCount(r.qc_fail)}</span>} />
          <KV label="QC pending"             value={<span className={r.qc_pending > 0 ? "text-amber-500" : "text-muted-foreground"}>{formatCount(r.qc_pending)}</span>} />
          <KV label="Total refunds"          value={formatINR(r.total_refunds_inr)} />
          <p className="pb-1 pt-4 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Shiprocket Sync</p>
          <KV label="Records fetched"  value={formatCount(sy.total_fetched)} />
          <KV label="Records inserted" value={formatCount(sy.total_inserted)} />
          <KV label="Failed runs"      value={<span className={sy.failed_runs > 0 ? "text-red-500" : "text-emerald-500"}>{sy.failed_runs}</span>} />
          <KV label="Last sync"        value={sy.last_sync_at ? new Date(sy.last_sync_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false }) + " IST" : "Never"} />
        </div>
      </div>
    </Panel>
  );
}

// ─── Section 4: COD Reconciliation ───────────────────────────────────────────

function CodSection() {
  const { data, isLoading, error } = useAuditCod();
  if (isLoading) return <Panel><Loading /></Panel>;
  if (error || !data) return <Panel><Err msg={String(error)} /></Panel>;

  const status: Light =
    Math.abs(data.variance_pct) < 1 ? "green"
    : Math.abs(data.variance_pct) > 5 ? "red"
    : "amber";

  return (
    <Panel>
      <SectionHeader
        title="COD Reconciliation"
        status={status}
        subtitle="Shiprocket COD payable vs bank remittances received"
      />
      <div className="px-5 py-1">
        <KV label="COD deliveries"            value={formatCount(data.cod_deliveries)} highlight />
        <KV label="COD payable (Shiprocket)"  value={formatINR(data.cod_payable_inr)} />
        <KV label="COD charges collected"     value={formatINR(data.cod_charges_inr)} />
        <KV label="Remitted in Shiprocket"    value={formatINR(data.remitted_in_sr_inr)} />
        <KV label="Remittance-dated rows"     value={formatCount(data.remittance_dated_rows)} />
        <KV label="Bank entries (type=cod_remittance)" value={formatCount(data.bank_entries)} />
        <KV label="Bank COD received"         value={formatINR(data.bank_cod_received_inr)} />
        <KV
          label="Variance (payable − bank)"
          value={
            <span className={Math.abs(data.variance_pct) > 1 ? "text-amber-500 font-bold" : "text-emerald-500"}>
              {formatINR(data.variance_inr)} ({data.variance_pct > 0 ? "+" : ""}{data.variance_pct}%)
            </span>
          }
          highlight
        />
      </div>
      <div className="border-t border-border px-5 py-3">
        <p className="text-xs text-muted-foreground">
          A positive variance means COD was payable but bank entry not yet recorded. Likely timing gap — check bank statement for pending remittances.
        </p>
      </div>
    </Panel>
  );
}

// ─── Section 5: Influencer Orders ────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  "INFLUENCER":              "bg-violet-500/10 text-violet-400",
  "PROMOTIONAL":             "bg-blue-500/10 text-blue-400",
  "INTERNAL":                "bg-muted text-muted-foreground",
  "REPLACEMENT":             "bg-amber-500/10 text-amber-500",
  "WARRANTY":                "bg-amber-500/10 text-amber-400",
  "CANCELLED":               "bg-red-500/10 text-red-400",
  "SUSPECTED INFLUENCER":    "bg-orange-500/10 text-orange-400",
  "SUSPECTED PROMOTIONAL":   "bg-orange-500/10 text-orange-400",
  "REVIEW":                  "bg-red-500/10 text-red-400",
};

function InfluencerSection() {
  const { data, isLoading, error } = useAuditInfluencerOrders();
  if (isLoading) return <Panel><Loading /></Panel>;
  if (error || !data) return <Panel><Err msg={String(error)} /></Panel>;

  const suspected = data.filter((r) => r.suggested_category.startsWith("SUSPECTED") || r.suggested_category === "REVIEW");
  const status: Light = suspected.length === 0 ? "green" : suspected.length > 10 ? "red" : "amber";

  const fmtDate = (s: string) =>
    new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });

  return (
    <Panel>
      <SectionHeader
        title="Influencer / Promotional Orders"
        status={status}
        subtitle={`${data.length} flagged orders — ${suspected.length} unclassified / needing review`}
      />
      {data.length === 0 ? (
        <div className="px-5 py-6 text-center text-sm text-emerald-500">No non-commercial or suspect orders found.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-border">
              <tr>
                {["WC Order", "Date", "Total", "Payment", "Classification", "Category", "Shipment", "Delivered"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium uppercase tracking-wider text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.order_id} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                  <td className="px-3 py-2 font-mono">#{row.wc_order_id}</td>
                  <td className="px-3 py-2">{fmtDate(row.ordered_at)}</td>
                  <td className="px-3 py-2 font-mono">{formatINR(row.order_total_inr)}</td>
                  <td className="px-3 py-2">{row.payment_method ?? <span className="text-amber-500">null</span>}</td>
                  <td className="px-3 py-2 font-mono">{row.classification}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold ${CATEGORY_COLORS[row.suggested_category] ?? "bg-muted text-muted-foreground"}`}>
                      {row.suggested_category}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={row.has_shipment ? "text-emerald-500" : "text-muted-foreground"}>
                      {row.has_shipment ? (row.shipment_status ?? "yes") : "none"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {row.delivered_at ? fmtDate(row.delivered_at) : <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

// ─── Section 6: Set Products ──────────────────────────────────────────────────

function SetProductSection() {
  const { data, isLoading, error } = useAuditSetProducts();
  if (isLoading) return <Panel><Loading /></Panel>;
  if (error || !data) return <Panel><Err msg={String(error)} /></Panel>;

  const invalidBom = data.filter((s) => !s.bom_valid);
  const lowCoverage = data.filter((s) => s.explosion_coverage_pct < 95 && s.units_sold > 0);
  const status: Light = invalidBom.length > 0 ? "red" : lowCoverage.length > 0 ? "amber" : "green";

  return (
    <Panel>
      <SectionHeader
        title="Set Product BOM Validation"
        status={status}
        subtitle="Classic / Summer / Core Set — BOM components, units sold, and explosion coverage"
      />
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="border-b border-border">
            <tr>
              {["Set", "Price", "BOM", "Bra", "Leggings", "SSP sum", "Orders", "Units", "Explosions", "Coverage"].map((h) => (
                <th key={h} className="px-3 py-2 text-left font-medium uppercase tracking-wider text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.product_id} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                <td className="px-3 py-2 font-medium text-foreground">{row.set_name}</td>
                <td className="px-3 py-2 font-mono">{formatINR(row.set_price_inr)}</td>
                <td className="px-3 py-2">
                  <span className={row.bom_valid ? "text-emerald-500" : "text-red-500"}>
                    {row.bom_valid ? "✓ Valid" : "✗ Invalid"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span className={row.has_bra ? "text-emerald-500" : "text-red-500"}>{row.has_bra ? "✓" : "✗"}</span>
                </td>
                <td className="px-3 py-2">
                  <span className={row.has_leggings ? "text-emerald-500" : "text-red-500"}>{row.has_leggings ? "✓" : "✗"}</span>
                </td>
                <td className="px-3 py-2 font-mono">
                  <span className={row.ssp_vs_price_ok ? "text-foreground" : "text-amber-500"}>
                    {formatINR(row.total_ssp_inr)}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono">{formatCount(row.orders_count)}</td>
                <td className="px-3 py-2 font-mono">{formatCount(row.units_sold)}</td>
                <td className="px-3 py-2 font-mono">{formatCount(row.explosion_lines)}</td>
                <td className="px-3 py-2">
                  <span className={row.explosion_coverage_pct >= 95 ? "text-emerald-500" : row.explosion_coverage_pct >= 80 ? "text-amber-500" : "text-red-500"}>
                    {row.explosion_coverage_pct}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// ─── Section 7: Revenue Recognition Health ───────────────────────────────────

function RecognitionSection() {
  const { data, isLoading, error } = useAuditRecognitionHealth();
  if (isLoading) return <Panel><Loading /></Panel>;
  if (error || !data) return <Panel><Err msg={String(error)} /></Panel>;

  const sh = data.shipment_health, rm = data.revenue_mismatch;
  const lh = data.line_health, ch = data.classification_health;
  const missingDatePct = sh.total_delivered > 0
    ? (sh.delivered_missing_date / sh.total_delivered * 100) : 0;

  const status: Light =
    sh.delivered_missing_date === 0 && lh.unmapped_lines === 0 && rm.orders_mismatched === 0 ? "green"
    : sh.delivered_missing_date > 20 || missingDatePct > 5 ? "red"
    : "amber";

  return (
    <Panel>
      <SectionHeader
        title="Revenue Recognition Health"
        status={status}
        subtitle="Verifies all P&L RPCs follow DELIVERED + delivered_at IS NOT NULL rule (BR-001)"
      />
      <div className="grid grid-cols-2 divide-x divide-border">
        <div className="px-5 py-1">
          <p className="pb-1 pt-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Shipment Delivery Dates</p>
          <KV label="Total DELIVERED rows"         value={formatCount(sh.total_delivered)} />
          <KV label="With delivered_at (P&L eligible)" value={<span className="text-emerald-500">{formatCount(sh.delivered_with_date)}</span>} />
          <KV label="Missing delivered_at (BR-001 gap)"
            value={
              <span className={sh.delivered_missing_date > 0 ? "text-red-500 font-bold" : "text-emerald-500"}>
                {formatCount(sh.delivered_missing_date)}{sh.delivered_missing_date > 0 ? ` (${missingDatePct.toFixed(1)}%)` : ""}
              </span>
            }
          />
          <KV label="Non-DELIVERED with date (anomaly)"
            value={<span className={sh.non_delivered_has_date > 0 ? "text-amber-500" : "text-muted-foreground"}>{formatCount(sh.non_delivered_has_date)}</span>}
          />
          <p className="pb-1 pt-4 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Revenue Mismatch</p>
          <KV label="Orders: order_total ≠ line sum"
            value={<span className={rm.orders_mismatched > 0 ? "text-amber-500" : "text-emerald-500"}>{formatCount(rm.orders_mismatched)}</span>}
          />
          <KV label="Total mismatch amount"
            value={<span className={rm.total_mismatch_inr > 1000 ? "text-amber-500" : "text-muted-foreground"}>{formatINR(rm.total_mismatch_inr)}</span>}
          />
        </div>
        <div className="px-5 py-1">
          <p className="pb-1 pt-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Order Line Mapping</p>
          <KV label="Total order lines"          value={formatCount(lh.total_lines)} />
          <KV label="Mapped to variant"          value={<span className="text-emerald-500">{formatCount(lh.mapped_lines)}</span>} />
          <KV label="Unmapped (SKU not resolved)"
            value={<span className={lh.unmapped_lines > 0 ? "text-red-500 font-bold" : "text-emerald-500"}>{formatCount(lh.unmapped_lines)}</span>}
          />
          <KV label="Zero-revenue lines"
            value={<span className={lh.zero_rev_lines > 0 ? "text-amber-500" : "text-muted-foreground"}>{formatCount(lh.zero_rev_lines)}</span>}
          />
          <p className="pb-1 pt-4 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Order Classification</p>
          <KV label="Total orders"         value={formatCount(ch.total_orders)} />
          <KV label="Classified"           value={<span className="text-emerald-500">{formatCount(ch.classified)}</span>} />
          <KV label="Unclassified"
            value={<span className={ch.unclassified > 0 ? "text-amber-500" : "text-emerald-500"}>{formatCount(ch.unclassified)}</span>}
          />
          <KV label="Manually classified"  value={formatCount(ch.manually_classified)} />
        </div>
      </div>
    </Panel>
  );
}

// ─── Section 8: WC Sync Status ───────────────────────────────────────────────

function WcSyncSection() {
  const { data, isLoading, error } = useWcSyncStatus();
  if (isLoading) return <Panel><Loading /></Panel>;
  if (error || !data) return <Panel><Err msg={String(error)} /></Panel>;

  const lagH = data.sync_lag_hours ?? 9999;
  const status: Light =
    lagH < 24 && data.failed_sync_runs_24h === 0 ? "green"
    : lagH > 72 || data.failed_sync_runs_24h > 2 ? "red"
    : "amber";

  const fmtTs = (v: string | null) =>
    v ? new Date(v).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) + " IST" : "Never synced";

  return (
    <Panel>
      <SectionHeader
        title="WooCommerce Sync Status"
        status={status}
        subtitle="Order sync lag, missing orders, and recent errors"
      />
      <div className="px-5 py-1">
        <KV label="Latest order in DB (ordered_at)"   value={fmtTs(data.latest_order_in_db)} highlight />
        <KV label="Latest WC order ID in DB"          value={data.latest_wc_order_id ? `#${data.latest_wc_order_id}` : "—"} />
        <KV label="Total orders in DB"                value={formatCount(data.total_orders_in_db)} />
        <KV label="Orders last 30 days"               value={formatCount(data.orders_last_30_days)} />
        <KV label="Orders last 7 days"                value={formatCount(data.orders_last_7_days)} />
        <KV label="Last successful sync"              value={fmtTs(data.last_sync_at)} />
        <KV label="Sync lag"
          value={
            <span className={lagH > 48 ? "text-red-500 font-bold" : lagH > 24 ? "text-amber-500" : "text-emerald-500"}>
              {lagH < 9999 ? `${lagH.toFixed(1)}h ago` : "No sync completed"}
            </span>
          }
        />
        <KV label="Last run status"
          value={
            <span className={data.last_sync_run_status === "success" ? "text-emerald-500" : data.last_sync_run_status === "error" ? "text-red-500" : "text-muted-foreground"}>
              {data.last_sync_run_status ?? "—"}
            </span>
          }
        />
        <KV label="Last sync fetched / inserted"      value={`${formatCount(data.last_sync_fetched ?? 0)} / ${formatCount(data.last_sync_inserted ?? 0)}`} />
        <KV label="Failed runs last 24h"
          value={
            <span className={data.failed_sync_runs_24h > 0 ? "text-red-500 font-bold" : "text-emerald-500"}>
              {data.failed_sync_runs_24h}
            </span>
          }
        />
      </div>
      {data.recent_sync_errors && data.recent_sync_errors.length > 0 && (
        <div className="border-t border-border px-5 py-3">
          <p className="pb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <AlertOctagon className="h-3 w-3 text-red-400" />
            Recent Sync Errors (last 7 days)
          </p>
          <div className="space-y-1.5">
            {data.recent_sync_errors.map((e, i) => (
              <div key={i} className="flex items-start gap-3 rounded-md bg-red-500/5 border border-red-500/10 px-3 py-2">
                <span className="font-mono text-[11px] text-red-400 flex-shrink-0">{e.error_code}</span>
                <span className="text-[11px] text-muted-foreground flex-1">{e.message}</span>
                <span className="text-[10px] text-muted-foreground flex-shrink-0">
                  {new Date(e.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-md bg-amber-500/5 border border-amber-500/10 px-3 py-2">
            <p className="text-[11px] text-amber-400 flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              <span className="font-semibold">Root cause:</span> WC sync has known bugs — BATCH_ERROR constraint + missing woocommerce_customer_id column.
              Fix is ready but not yet deployed. Orders placed after the last successful sync will not appear in the dashboard.
            </p>
          </div>
        </div>
      )}
    </Panel>
  );
}

// ─── Summary strip ────────────────────────────────────────────────────────────

function SummaryBadge({ label, hook }: { label: string; hook: () => { isLoading: boolean; error: unknown; data: unknown } }) {
  const { isLoading, error } = hook();
  if (isLoading) return (
    <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2">
      <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
  if (error) return (
    <div className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
      <XCircle className="h-3 w-3 text-red-500" />
      <span className="text-xs text-red-500">{label}</span>
    </div>
  );
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
      <span className="text-xs text-emerald-500">{label}</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DataAuditPage() {
  const qc = useQueryClient();
  const auditFetching = useIsFetching({ queryKey: ["audit"] });
  const refreshAll = () => qc.invalidateQueries({ queryKey: ["audit"] });

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-start justify-between">
        <PageHeader
          title="Data Audit"
          subtitle="Post-integration validation — WooCommerce + Shiprocket vs Supabase. Read-only. No production data is modified."
        />
        <button
          onClick={refreshAll}
          disabled={auditFetching > 0}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/40 transition-colors disabled:opacity-60"
        >
          {auditFetching > 0
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <RefreshCw className="h-3.5 w-3.5" />
          }
          {auditFetching > 0 ? "Refreshing…" : "Refresh All"}
        </button>
      </div>

      {/* Quick status strip */}
      <div className="flex flex-wrap gap-2">
        {([
          ["Revenue",     useAuditRevenue],
          ["Orders",      useAuditOrders],
          ["Shipments",   useAuditShipments],
          ["COD",         useAuditCod],
          ["Influencer",  useAuditInfluencerOrders],
          ["Sets",        useAuditSetProducts],
          ["Recognition", useAuditRecognitionHealth],
        ] as [string, typeof useAuditRevenue][]).map(([label, hook]) => (
          <SummaryBadge key={label} label={label} hook={hook} />
        ))}
      </div>

      <WcSyncSection />
      <RevenueSection />
      <OrderSection />
      <ShipmentSection />
      <CodSection />
      <InfluencerSection />
      <SetProductSection />
      <RecognitionSection />
    </div>
  );
}
