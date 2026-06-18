"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  TrendingUp,
  Users,
  Truck,
  Banknote,
} from "lucide-react";

const navItems = [
  {
    href: "/dashboard",
    label: "Command Center",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    href: "/dashboard/executive",
    label: "Executive Overview",
    icon: TrendingUp,
  },
  {
    href: "/dashboard/customers",
    label: "Customer Intelligence",
    icon: Users,
  },
  {
    href: "/dashboard/operations",
    label: "Operations",
    icon: Truck,
  },
  {
    href: "/dashboard/finance",
    label: "Finance & Cash",
    icon: Banknote,
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 flex-shrink-0 border-r border-border bg-sidebar flex flex-col">
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-border">
        <span className="text-sm font-bold tracking-widest uppercase text-foreground">
          KIRGO
        </span>
        <span className="ml-2 text-xs text-muted-foreground font-medium">
          Control Tower
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 space-y-0.5 px-2">
        {navItems.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                active
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="h-12 px-4 border-t border-border flex items-center">
        <span className="text-xs text-muted-foreground">v1.0 · 2026</span>
      </div>
    </aside>
  );
}
