import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

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
  children?: React.ReactNode;
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
  const isPositive = delta != null ? (invertDelta ? delta < 0 : delta > 0) : null;
  const isNeutral = delta === 0;

  return (
    <div
      className={cn(
        "relative rounded-xl border bg-card p-5 flex flex-col gap-1 overflow-hidden card-hover",
        alert === "red" && "border-red-500/30 bg-red-500/[0.03]",
        alert === "amber" && "border-amber-400/30 bg-amber-400/[0.03]",
        alert === "green" && "border-emerald-500/20",
        !alert && "border-border",
        className
      )}
    >
      {/* Top row: label + icon */}
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
        {icon && (
          <span className={cn(
            "text-muted-foreground/50",
            alert === "red" && "text-red-400/60",
            alert === "amber" && "text-amber-400/60",
            alert === "green" && "text-emerald-400/60",
          )}>
            {icon}
          </span>
        )}
      </div>

      {/* Main value */}
      <p className={cn(
        "text-[28px] font-bold tracking-tight tabular-nums leading-none text-foreground",
        alert === "red" && "text-red-400",
        alert === "amber" && "text-amber-400",
      )}>
        {value ?? "—"}
      </p>

      {/* Delta row */}
      {(delta != null || subValue) && (
        <div className="flex items-center gap-2 mt-1.5">
          {delta != null && !isNeutral && (
            <span className={cn(
              "inline-flex items-center gap-0.5 text-[11px] font-semibold",
              isPositive ? "text-emerald-500" : "text-red-400",
            )}>
              {isPositive
                ? <TrendingUp className="h-3 w-3" />
                : <TrendingDown className="h-3 w-3" />
              }
              {Math.abs(delta).toFixed(1)}%
            </span>
          )}
          {delta === 0 && (
            <span className="text-[11px] font-semibold text-muted-foreground">0.0%</span>
          )}
          {(deltaLabel || subValue) && (
            <span className="text-[11px] text-muted-foreground">
              {deltaLabel ?? subValue}
            </span>
          )}
        </div>
      )}

      {subValue && !delta && (
        <p className="text-[11px] text-muted-foreground mt-0.5">{subValue}</p>
      )}

      {children && <div className="mt-2">{children}</div>}

      {/* Alert accent bar */}
      {alert === "red" && (
        <div className="absolute inset-x-0 top-0 h-[2px] bg-red-500 rounded-t-xl" />
      )}
      {alert === "amber" && (
        <div className="absolute inset-x-0 top-0 h-[2px] bg-amber-400 rounded-t-xl" />
      )}
    </div>
  );
}

export function KpiCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-5 flex flex-col gap-3", className)}>
      <div className="h-3 w-24 rounded skeleton" />
      <div className="h-8 w-28 rounded skeleton" />
      <div className="h-3 w-16 rounded skeleton" />
    </div>
  );
}
