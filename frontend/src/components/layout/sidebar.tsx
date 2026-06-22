"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Radio,
  TrendingUp,
  Users,
  Package,
  Landmark,
  ChartNoAxesCombined,
  ChevronRight,
  Receipt,
  FilePlus,
  CreditCard,
  X,
  Tags,
  Wallet,
  Boxes,
  ShieldCheck,
  LineChart,
  SlidersHorizontal,
  Building2,
  Rss,
  Globe,
} from "lucide-react";
import { useState } from "react";

function LogoMark() {
  const [imgError, setImgError] = useState(false);
  if (imgError) {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 flex-shrink-0">
        <span className="text-[11px] font-black text-white tracking-tight leading-none">K</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/kirgo-logo.svg"
      alt="Kirgo"
      className="h-8 w-8 rounded-full object-cover flex-shrink-0"
      onError={() => setImgError(true)}
    />
  );
}

const navGroups = [
  {
    label: "Analytics",
    items: [
      { href: "/dashboard",               label: "Command Center", icon: Radio,              exact: true },
      { href: "/dashboard/executive",     label: "Executive",      icon: TrendingUp },
      { href: "/dashboard/forecasting",   label: "Forecasting",    icon: LineChart },
      { href: "/dashboard/profitability", label: "Profitability",  icon: ChartNoAxesCombined },
      { href: "/dashboard/customers",     label: "Customers",      icon: Users },
      { href: "/dashboard/operations",    label: "Operations",     icon: Package },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/dashboard/finance",     label: "Finance",     icon: Landmark },
      { href: "/dashboard/bank",        label: "Bank Feed",   icon: Building2 },
      { href: "/dashboard/expenses",    label: "Expenses",    icon: Receipt },
      { href: "/dashboard/receivables", label: "Receivables", icon: Wallet },
    ],
  },
  {
    label: "Manage",
    items: [
      { href: "/dashboard/bank-classification",  label: "Bank Classification",  icon: CreditCard },
      { href: "/dashboard/order-classification", label: "Order Classification", icon: Tags },
      { href: "/dashboard/expense-entry",        label: "New Expense",          icon: FilePlus },
      { href: "/dashboard/inventory",            label: "Inventory",            icon: Boxes },
    ],
  },
  {
    label: "Settings",
    items: [
      { href: "/settings/company",      label: "Company",      icon: Globe },
      { href: "/settings/integrations", label: "Integrations", icon: SlidersHorizontal },
      { href: "/settings/bank-feeds",   label: "Bank Feeds",   icon: Rss },
      { href: "/dashboard/data-quality",label: "Data Quality", icon: ShieldCheck },
    ],
  },
];

interface SidebarProps {
  className?: string;
  onClose?: () => void;
}

export function Sidebar({ className, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "w-[220px] flex-shrink-0 flex flex-col h-full",
        "bg-[hsl(var(--sidebar))] border-r border-[hsl(var(--sidebar-border))]",
        className,
      )}
    >
      {/* Logo */}
      <div className="h-14 flex items-center gap-3 px-4 border-b border-[hsl(var(--sidebar-border))] flex-shrink-0">
        <LogoMark />
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[13px] font-bold text-foreground tracking-tight leading-none">Kirgo</span>
          <span className="text-[10px] text-[hsl(var(--muted-foreground))] leading-none mt-0.5 font-medium">Control Tower</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="px-2 mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      "group flex items-center gap-3 px-2.5 py-2 rounded-md text-sm transition-all duration-100 relative",
                      active
                        ? "bg-[hsl(var(--sidebar-accent))] text-foreground font-medium"
                        : "text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent)/0.6)] hover:text-foreground"
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full bg-violet-500" />
                    )}
                    <item.icon
                      className={cn(
                        "h-[15px] w-[15px] flex-shrink-0 transition-colors",
                        active ? "text-violet-500" : "text-[hsl(var(--muted-foreground))] group-hover:text-foreground"
                      )}
                    />
                    <span className="flex-1 text-[14px]">{item.label}</span>
                    {active && <ChevronRight className="h-3 w-3 text-[hsl(var(--muted-foreground))]" />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-[hsl(var(--sidebar-border))] flex-shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-[hsl(var(--muted-foreground))]">v1.0 · 2026</span>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] text-emerald-500 font-medium">Live</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
