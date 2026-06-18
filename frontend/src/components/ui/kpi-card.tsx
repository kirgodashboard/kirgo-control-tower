import { cn } from "@/lib/utils";
import { TrendBadge } from "./trend-badge";

interface KpiCardProps {
  label: string;
  value: string | null | undefined;
  delta?: number | null;
  deltaLabel?: string;
  invertDelta?: boolean;
  subValue?: string;
  icon?: React.ReactNode;
  alert?: "red" | "amber" | "green";
  className?: string;
  children?: React.ReactNode; // sparkline slot
}

export function KpiCard({
  label,
  value,
  delta,
  deltaLabel,
  invertDelta = false,
  subValue,
  icon,
  alert,
  className,
  children,
}: KpiCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-4 flex flex-col gap-3",
        alert === "red" && "border-red-500/50 bg-red-500/5",
        alert === "amber" && "border-amber-400/50 bg-amber-400/5",
        alert === "green" && "border-emerald-500/50",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </p>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>

      <div className="flex items-end justify-between gap-2">
        <p className="text-2xl font-bold tabular-nums text-foreground leading-none">
          {value ?? "—"}
        </p>
        <div className="flex flex-col items-end gap-0.5 pb-0.5">
          {delta != null && (
            <TrendBadge value={delta} invertColour={invertDelta} />
          )}
          {deltaLabel && (
            <span className="text-xs text-muted-foreground">{deltaLabel}</span>
          )}
        </div>
      </div>

      {subValue && (
        <p className="text-xs text-muted-foreground">{subValue}</p>
      )}

      {children && <div className="mt-1">{children}</div>}
    </div>
  );
}

export function KpiCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-4 flex flex-col gap-3 animate-pulse",
        className
      )}
    >
      <div className="h-3 w-24 rounded bg-muted" />
      <div className="h-8 w-32 rounded bg-muted" />
      <div className="h-3 w-16 rounded bg-muted" />
    </div>
  );
}
