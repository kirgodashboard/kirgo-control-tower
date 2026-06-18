import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  children?: React.ReactNode; // right slot (period selector, actions)
  className?: string;
}

export function PageHeader({ title, subtitle, children, className }: PageHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between flex-wrap gap-3 pb-1", className)}>
      <div>
        <h1 className="text-[17px] font-bold text-foreground tracking-tight leading-snug">{title}</h1>
        {subtitle && (
          <p className="text-[12px] text-muted-foreground mt-0.5">{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  );
}

interface PeriodTabsProps {
  value: string;
  options: { key: string; label: string }[];
  onChange: (key: string) => void;
}

export function PeriodTabs({ value, options, onChange }: PeriodTabsProps) {
  return (
    <div className="flex items-center gap-0.5 p-1 rounded-lg bg-muted/60">
      {options.map((opt) => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          className={cn(
            "px-3 py-1.5 text-[12px] font-medium rounded-md transition-all",
            value === opt.key
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-background/50"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

interface SectionLabelProps {
  title: string;
  description?: string;
  className?: string;
}

export function SectionLabel({ title, description, className }: SectionLabelProps) {
  return (
    <div className={cn("mb-3", className)}>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </p>
      {description && (
        <p className="text-[12px] text-muted-foreground mt-0.5">{description}</p>
      )}
    </div>
  );
}
