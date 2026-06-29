"use client";

import Link from "next/link";
import { useDataQuality } from "@/lib/hooks/use-data-quality";
import { PageHeader } from "@/components/ui/page-header";
import { formatINR } from "@/lib/utils/format";
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  CreditCard,
  ShoppingCart,
  Package,
  RefreshCw,
  Clock,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Traffic-light helpers ───────────────────────────────────────────────────

type Rag = "green" | "amber" | "red";

function ragColor(rag: Rag) {
  return {
    green: {
      badge: "bg-emerald-500/10 border-emerald-500/20 text-emerald-500",
      dot: "bg-emerald-500",
      icon: "text-emerald-500",
    },
    amber: {
      badge: "bg-amber-500/10 border-amber-500/20 text-amber-500",
      dot: "bg-amber-500",
      icon: "text-amber-500",
    },
    red: {
      badge: "bg-red-500/10 border-red-500/20 text-red-500",
      dot: "bg-red-500",
      icon: "text-red-500",
    },
  }[rag];
}

function RagIcon({ rag }: { rag: Rag }) {
  const c = ragColor(rag);
  if (rag === "green") return <CheckCircle2 className={cn("h-4 w-4", c.icon)} />;
  if (rag === "amber") return <AlertTriangle className={cn("h-4 w-4", c.icon)} />;
  return <XCircle className={cn("h-4 w-4", c.icon)} />;
}

// ── Sub-components ──────────────────────────────────────────────────────────

interface CheckRowProps {
  label: string;
  value: string | number;
  rag: Rag;
  detail?: string;
  actionHref?: string;
  actionLabel?: string;
}

function CheckRow({ label, value, rag, detail, actionHref, actionLabel }: CheckRowProps) {
  const c = ragColor(rag);
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <RagIcon rag={rag} />
        <div className="min-w-0">
          <p className="text-sm text-foreground">{label}</p>
          {detail && <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>}
          {actionHref && rag !== "green" && (
            <Link
              href={actionHref}
              className="inline-flex items-center gap-1 text-[11px] text-violet-400 hover:text-violet-300 mt-0.5"
            >
              {actionLabel ?? "Fix →"}
              <ArrowRight className="h-2.5 w-2.5" />
            </Link>
          )}
        </div>
      </div>
      <span
        className={cn(
          "ml-4 flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-md border",
          c.badge,
        )}
      >
        {value}
      </span>
    </div>
  );
}

interface DomainCardProps {
  title: string;
  icon: React.ReactNode;
  rag: Rag;
  children: React.ReactNode;
}

function DomainCard({ title, icon, rag, children }: DomainCardProps) {
  const c = ragColor(rag);
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{icon}</span>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        </div>
        <span className={cn("h-2 w-2 rounded-full flex-shrink-0", c.dot)} />
      </div>
      <div>{children}</div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function domainRag(checks: Rag[]): Rag {
  if (checks.includes("red")) return "red";
  if (checks.includes("amber")) return "amber";
  return "green";
}

function lastSyncLabel(ts: string | null): string {
  if (!ts) return "Never";
  const diff = Date.now() - new Date(ts).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "< 1 hour ago";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function lastSyncRag(ts: string | null): Rag {
  if (!ts) return "red";
  const h = (Date.now() - new Date(ts).getTime()) / 3_600_000;
  if (h < 25) return "green";
  if (h < 72) return "amber";
  return "red";
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function DataQualityPage() {
  const { data, isLoading, error, refetch } = useDataQuality();

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-6">
        <PageHeader title="Data Quality" subtitle="Health checks across all data domains" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5 h-48 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 sm:p-6 space-y-6">
        <PageHeader title="Data Quality" subtitle="Health checks across all data domains" />
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5 text-center">
          <XCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
          <p className="text-sm text-red-500 font-medium">
            {error ? (error as Error).message : "Failed to load quality data"}
          </p>
          <button
            onClick={() => refetch()}
            className="mt-3 text-xs text-muted-foreground hover:text-foreground underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── Bank domain ───────────────────────────────────────────────────────────
  const bankUnclassifiedRag: Rag =
    data.unclassified_bank_count === 0 ? "green" :
    data.unclassified_bank_count <= 10 ? "amber" : "red";

  const bankMissingExpenseRag: Rag =
    data.missing_expense_count === 0 ? "green" :
    data.missing_expense_count <= 5 ? "amber" : "red";

  // cod_variance_inr now = cod_receivable_inr() = COD outstanding (0 when settled)
  const codVarianceRag: Rag =
    data.cod_variance_inr === 0 ? "green" :
    data.cod_variance_inr < 10000 ? "amber" : "red";

  const bankDomainRag = domainRag([bankUnclassifiedRag, bankMissingExpenseRag, codVarianceRag]);

  // ── Orders domain ─────────────────────────────────────────────────────────
  const unclassifiedOrderRag: Rag =
    data.unclassified_order_count === 0 ? "green" :
    data.unclassified_order_count <= 20 ? "amber" : "red";

  const unmappedLinesRag: Rag =
    data.unmapped_lines_count === 0 ? "green" :
    data.unmapped_lines_count <= 5 ? "amber" : "red";

  const ordersDomainRag = domainRag([unclassifiedOrderRag, unmappedLinesRag]);

  // ── Inventory domain ──────────────────────────────────────────────────────
  const outOfStockRag: Rag =
    data.out_of_stock_count === 0 ? "green" :
    data.out_of_stock_count <= 2 ? "amber" : "red";

  const lowStockRag: Rag =
    data.low_stock_count === 0 ? "green" :
    data.low_stock_count <= 3 ? "amber" : "red";

  const skusNoInvRag: Rag =
    data.skus_no_inventory_count === 0 ? "green" :
    data.skus_no_inventory_count <= 5 ? "amber" : "red";

  const inventoryDomainRag = domainRag([outOfStockRag, lowStockRag, skusNoInvRag]);

  // ── Sync domain ───────────────────────────────────────────────────────────
  const syncErrorRag: Rag =
    data.unresolved_errors_count === 0 ? "green" :
    data.unresolved_errors_count <= 3 ? "amber" : "red";

  const syncFailuresRag: Rag =
    data.sync_failures_7d === 0 ? "green" :
    data.sync_failures_7d <= 2 ? "amber" : "red";

  const syncDomainRag = domainRag([syncErrorRag, syncFailuresRag, lastSyncRag(data.last_sync_at)]);

  // ── Overall status ────────────────────────────────────────────────────────
  const overallRag = domainRag([bankDomainRag, ordersDomainRag, inventoryDomainRag, syncDomainRag]);

  const overallLabels: Record<Rag, string> = {
    green: "All Systems Healthy",
    amber: "Attention Required",
    red: "Action Required",
  };

  const overallColors = ragColor(overallRag);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <PageHeader
        title="Data Quality"
        subtitle="Health checks across bank, orders, inventory, and sync"
      >
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </PageHeader>

      {/* Overall status banner */}
      <div
        className={cn(
          "rounded-xl border p-4 flex items-center gap-3",
          overallColors.badge,
        )}
      >
        <RagIcon rag={overallRag} />
        <div className="flex-1">
          <p className="text-sm font-semibold">{overallLabels[overallRag]}</p>
          <p className="text-xs opacity-80 mt-0.5">
            {overallRag === "green"
              ? "No issues detected across any data domain."
              : overallRag === "amber"
              ? "Some items need review — no critical failures."
              : "One or more domains have critical data gaps."}
          </p>
        </div>
      </div>

      {/* Domain grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Bank */}
        <DomainCard
          title="Bank Transactions"
          icon={<CreditCard className="h-4 w-4" />}
          rag={bankDomainRag}
        >
          <CheckRow
            label="Unclassified debits"
            value={data.unclassified_bank_count === 0 ? "None" : data.unclassified_bank_count}
            rag={bankUnclassifiedRag}
            detail="Bank withdrawals not yet categorised"
            actionHref="/dashboard/bank-classification"
            actionLabel="Classify now"
          />
          <CheckRow
            label="Missing expense records"
            value={data.missing_expense_count === 0 ? "None" : data.missing_expense_count}
            rag={bankMissingExpenseRag}
            detail="Debits ≥ ₹500 with no linked expense entry"
            actionHref="/dashboard/bank-classification"
            actionLabel="Link expenses"
          />
          <CheckRow
            label="COD outstanding"
            value={data.cod_variance_inr === 0 ? "Settled" : formatINR(data.cod_variance_inr)}
            rag={codVarianceRag}
            detail="Pending Shiprocket COD remittance (from Operations)"
          />
        </DomainCard>

        {/* Orders */}
        <DomainCard
          title="Orders"
          icon={<ShoppingCart className="h-4 w-4" />}
          rag={ordersDomainRag}
        >
          <CheckRow
            label="Unclassified orders"
            value={data.unclassified_order_count === 0 ? "None" : data.unclassified_order_count}
            rag={unclassifiedOrderRag}
            detail="Orders with no classification record"
          />
          <CheckRow
            label="Unmapped order lines"
            value={data.unmapped_lines_count === 0 ? "None" : data.unmapped_lines_count}
            rag={unmappedLinesRag}
            detail="Lines where variant_id is null (SKU unresolved)"
          />
        </DomainCard>

        {/* Inventory */}
        <DomainCard
          title="Inventory"
          icon={<Package className="h-4 w-4" />}
          rag={inventoryDomainRag}
        >
          <CheckRow
            label="Out of stock"
            value={data.out_of_stock_count === 0 ? "None" : `${data.out_of_stock_count} SKUs`}
            rag={outOfStockRag}
            detail="Active SKUs with current_stock = 0 (were stocked)"
          />
          <CheckRow
            label="Low stock"
            value={data.low_stock_count === 0 ? "None" : `${data.low_stock_count} SKUs`}
            rag={lowStockRag}
            detail="At or below reorder point"
          />
          <CheckRow
            label="SKUs without inventory records"
            value={data.skus_no_inventory_count === 0 ? "None" : data.skus_no_inventory_count}
            rag={skusNoInvRag}
            detail="product_variants with no inventory_item row"
          />
        </DomainCard>

        {/* Sync */}
        <DomainCard
          title="Sync & Imports"
          icon={<RefreshCw className="h-4 w-4" />}
          rag={syncDomainRag}
        >
          <CheckRow
            label="Unresolved import errors"
            value={data.unresolved_errors_count === 0 ? "None" : data.unresolved_errors_count}
            rag={syncErrorRag}
            detail="Severity = error, resolution_status = unresolved"
          />
          <CheckRow
            label="Failed sync runs (7 days)"
            value={data.sync_failures_7d === 0 ? "None" : data.sync_failures_7d}
            rag={syncFailuresRag}
            detail="import_runs with status = failed"
          />
          <CheckRow
            label="Last successful sync"
            value={lastSyncLabel(data.last_sync_at)}
            rag={lastSyncRag(data.last_sync_at)}
            detail={
              data.last_sync_at
                ? new Date(data.last_sync_at).toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                : "No completed runs recorded"
            }
          />
        </DomainCard>
      </div>

      {/* Footer legend */}
      <div className="flex items-center gap-5 text-xs text-muted-foreground pt-1">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          <span>Green — no action needed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          <span>Amber — review soon</span>
        </div>
        <div className="flex items-center gap-1.5">
          <XCircle className="h-3.5 w-3.5 text-red-500" />
          <span>Red — action required</span>
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <Clock className="h-3.5 w-3.5" />
          <span>Refreshes every 60s</span>
        </div>
      </div>
    </div>
  );
}
