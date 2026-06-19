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
        "relative rounded-xl border bg-card p-5 sm:p-6 flex flex-col overflow-hidden card-hover",
        alert === "red" && "border-red-500/30 bg-red-500/[0.03]",
        alert === "amber" && "border-amber-400/30 bg-amber-400/[0.03]",
        alert === "green" && "border-emerald-500/20",
        !alert && "border-border",
        className
      )}
    >
      {/* Alert accent bar */}
      {alert === "red" && <div className="absolute inset-x-0 top-0 h-[3px] bg-red-500 rounded-t-xl" />}
      {alert === "amber" && <div className="absolute inset-x-0 top-0 h-[3px] bg-amber-400 rounded-t-xl" />}
      {alert === "green" && <div className="absolute inset-x-0 top-0 h-[3px] bg-emerald-500 rounded-t-xl" />}

      {/* Top row: label + icon */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px] font-semibold text-muted-foreground leading-none">
          {label}
        </p>
        {icon && (
          <span className={cn(
            "h-7 w-7 rounded-lg flex items-center justify-center",
            alert === "red"   ? "bg-red-500/10 text-red-400" :
            alert === "amber" ? "bg-amber-400/10 text-amber-400" :
            alert === "green" ? "bg-emerald-500/10 text-emerald-400" :
            "bg-muted text-muted-foreground/60"
          )}>
            {icon}
          </span>
        )}
      </div>

      {/* Main value */}
      <p className={cn(
        "text-[36px] sm:text-[44px] font-bold tracking-tight tabular-nums leading-none text-foreground mb-3",
        alert === "red"   && "text-red-400",
        alert === "amber" && "text-amber-400",
        alert === "green" && "text-emerald-400",
      )}>
        {value ?? "—"}
      </p>

      {/* Delta row */}
      {(delta != null || subValue) && (
        <div className="flex items-center gap-2 mt-auto">
          {delta != null && !isNeutral && (
            <span className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-semibold",
              isPositive
                ? "bg-emerald-500/10 text-emerald-500"
                : "bg-red-500/10 text-red-400",
            )}>
              {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {Math.abs(delta).toFixed(1)}%
            </span>
          )}
          {delta === 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[12px] font-semibold bg-muted text-muted-foreground">
              0.0%
            </span>
          )}
          {(deltaLabel || subValue) && (
            <span className="text-[12px] text-muted-foreground truncate">
              {deltaLabel ?? subValue}
            </span>
          )}
        </div>
      )}

      {subValue && !delta && (
        <p className="text-[12px] text-muted-foreground mt-auto">{subValue}</p>
      )}

      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

export function KpiCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-5 sm:p-6 flex flex-col gap-3", className)}>
      <div className="h-3.5 w-28 rounded skeleton" />
      <div className="h-10 w-32 rounded skeleton" />
      <div className="h-5 w-24 rounded-full skeleton" />
    </div>
  );
}
