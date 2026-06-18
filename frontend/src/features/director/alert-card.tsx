import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils/format";
import type { SystemAlert } from "@/types/kpi";
import { AlertTriangle, AlertCircle, CheckCircle2 } from "lucide-react";

const severityConfig = {
  RED: {
    icon: AlertTriangle,
    iconClass: "text-red-400",
    badgeClass: "bg-red-500/15 text-red-400 border-red-500/20",
    borderClass: "border-l-red-500",
  },
  AMBER: {
    icon: AlertCircle,
    iconClass: "text-amber-400",
    badgeClass: "bg-amber-400/15 text-amber-400 border-amber-400/20",
    borderClass: "border-l-amber-400",
  },
  GREEN: {
    icon: CheckCircle2,
    iconClass: "text-emerald-400",
    badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    borderClass: "border-l-emerald-500",
  },
};

const typeLabels: Record<string, string> = {
  import_error: "IMPORT",
  negative_cashflow: "FINANCE",
  cod_overdue: "COD",
  high_return_rate: "RETURNS",
  shipment_linkage: "SHIPMENTS",
  settlement_gap: "SETTLEMENTS",
  system_healthy: "SYSTEM",
};

export function AlertCard({ alert }: { alert: SystemAlert }) {
  const cfg = severityConfig[alert.severity];
  const Icon = cfg.icon;

  return (
    <div className={cn(
      "flex items-start gap-3 px-4 py-3 rounded-lg border border-border border-l-[3px]",
      cfg.borderClass,
      "bg-card hover:bg-accent/20 transition-colors"
    )}>
      <Icon className={cn("h-4 w-4 mt-0.5 flex-shrink-0", cfg.iconClass)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn(
            "text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border",
            cfg.badgeClass
          )}>
            {typeLabels[alert.alert_type] ?? alert.alert_type}
          </span>
          <p className="text-[13px] font-semibold text-foreground">{alert.title}</p>
        </div>
        {alert.detail && (
          <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">{alert.detail}</p>
        )}
      </div>
      <span className="text-[11px] text-muted-foreground/50 flex-shrink-0 mt-0.5 font-medium">
        {timeAgo(alert.raised_at)}
      </span>
    </div>
  );
}

export function AlertCardSkeleton() {
  return (
    <div className="flex items-start gap-3 px-4 py-3 rounded-lg border border-border border-l-[3px] border-l-muted bg-card">
      <div className="h-4 w-4 rounded skeleton mt-0.5" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-48 rounded skeleton" />
        <div className="h-3 w-64 rounded skeleton" />
      </div>
    </div>
  );
}
