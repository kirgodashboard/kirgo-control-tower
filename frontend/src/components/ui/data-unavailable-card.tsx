import { cn } from "@/lib/utils";
import { AlertCircle } from "lucide-react";

interface DataUnavailableCardProps {
  title: string;
  reason: string;
  action?: string;
  className?: string;
}

export function DataUnavailableCard({
  title,
  reason,
  action,
  className,
}: DataUnavailableCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-border bg-muted/30 p-6",
        "flex flex-col items-center justify-center text-center gap-2",
        className
      )}
    >
      <AlertCircle className="h-6 w-6 text-muted-foreground/50" />
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <p className="text-xs text-muted-foreground/70">{reason}</p>
      {action && (
        <p className="text-xs text-muted-foreground/50 mt-1 font-mono">
          {action}
        </p>
      )}
    </div>
  );
}
