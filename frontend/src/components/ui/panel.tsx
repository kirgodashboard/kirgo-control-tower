import { cn } from "@/lib/utils";

interface PanelProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  headerRight?: React.ReactNode;
}

export function Panel({ title, description, children, className, headerRight }: PanelProps) {
  return (
    <div className={cn("rounded-xl border border-border bg-card", className)}>
      {(title || headerRight) && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {title}
            </p>
            {description && (
              <p className="text-[12px] text-muted-foreground mt-0.5">{description}</p>
            )}
          </div>
          {headerRight}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}
