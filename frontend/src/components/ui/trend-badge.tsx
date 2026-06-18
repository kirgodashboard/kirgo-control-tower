import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface TrendBadgeProps {
  value: number | null | undefined;
  suffix?: string;
  invertColour?: boolean; // for metrics where higher is bad (e.g. return rate)
  className?: string;
}

export function TrendBadge({
  value,
  suffix = "%",
  invertColour = false,
  className,
}: TrendBadgeProps) {
  if (value == null) return null;

  const isPositive = value > 0;
  const isNeutral = value === 0;

  const good = invertColour ? !isPositive : isPositive;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
        isNeutral && "text-muted-foreground",
        !isNeutral && good && "text-emerald-500",
        !isNeutral && !good && "text-red-500",
        className
      )}
    >
      {isNeutral ? (
        <Minus className="h-3 w-3" />
      ) : isPositive ? (
        <TrendingUp className="h-3 w-3" />
      ) : (
        <TrendingDown className="h-3 w-3" />
      )}
      {isPositive ? "+" : ""}
      {value.toFixed(1)}
      {suffix}
    </span>
  );
}
