import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/utils/format";
import type { SystemAlert } from "@/types/kpi";

const severityConfig = {
  RED: {
    dot: "bg-red-500",
    badge: "bg-red-500/15 text-red-400 border-red-500/20",
    border: "border-l-red-500",
  },
  AMBER: {
    dot: "bg-amber-400",
    badge: "bg-amber-400/15 text-amber-400 border-amber-400/20",
    border: "border-l-amber-400",
  },
  GREEN: {
    dot: "bg-emerald-500",
    badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    border: "border-l-emerald-500",
  },
};

const typeLabels: Record<string, string> = {
  import_error: "Import",
  negative_cashflow: "Finance",
  cod_overdue: "COD",
  high_return_rate: "Returns",
  shipment_linkage: "Shipments",
  settlement_gap: "Settlements",
  system_healthy: "System",
};

interface AlertCardProps {
  alert: SystemAlert;
}

export function AlertCard({ alert }: AlertCardProps) {
  const cfg = severityConfig[alert.severity];
  return (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-3 border-l-2",
        cfg.border,
        "bg-card/50 rounded-r-md"
      )}
    >
      {/* Severity dot */}
      <span className={cn("mt-1 h-2 w-2 rounded-full flex-shrink-0", cfg.dot)} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={cn(
              "text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border",
              cfg.badge
            )}
          >
            {typeLabels[alert.alert_type] ?? alert.alert_type}
          </span>
          <p className="text-sm font-medium text-foreground truncate">
            {alert.title}
          </p>
        </div>
        {alert.detail && (
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            {alert.detail}
          </p>
        )}
      </div>

      {/* Timestamp */}
      <span className="text-[10px] text-muted-foreground/60 flex-shrink-0 mt-0.5">
        {formatDateTime(alert.raised_at)}
      </span>
    </div>
  );
}

export function AlertCardSkeleton() {
  return (
    <div className="flex items-start gap-3 px-4 py-3 border-l-2 border-muted bg-card/50 rounded-r-md animate-pulse">
      <span className="mt-1 h-2 w-2 rounded-full bg-muted flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-48 rounded bg-muted" />
        <div className="h-3 w-64 rounded bg-muted" />
      </div>
    </div>
  );
}
