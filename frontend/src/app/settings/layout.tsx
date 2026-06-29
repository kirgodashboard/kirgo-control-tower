"use client";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Building2, Users, Bell, Plug, HeartPulse,
} from "lucide-react";

const NAV = [
  { href: "/settings/company",              label: "Company",              icon: Building2  },
  { href: "/settings/integrations",         label: "Integrations",         icon: Plug       },
  { href: "/settings/integrations/health",  label: "Integration Health",   icon: HeartPulse },
  { href: "/settings/users",                label: "Users & Roles",        icon: Users      },
  { href: "/settings/notifications",        label: "Notifications",        icon: Bell       },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <DashboardShell>
      <div className="flex flex-col lg:flex-row h-full">

        {/* Mobile: horizontal scrollable tab bar */}
        <nav className="lg:hidden border-b border-border bg-card overflow-x-auto flex-shrink-0">
          <div className="flex px-3 py-1.5 gap-0.5 min-w-max">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium whitespace-nowrap transition-colors",
                    active
                      ? "bg-violet-500/15 text-violet-400"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Desktop: vertical sidebar */}
        <nav className="hidden lg:flex flex-col w-52 flex-shrink-0 border-r border-border bg-card pt-8 pb-6 px-3 gap-0.5">
          <p className="px-3 mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Settings
          </p>
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-violet-500/15 text-violet-400"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                <Icon className={cn("h-4 w-4 flex-shrink-0", active ? "text-violet-400" : "")} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0 overflow-y-auto p-5 lg:p-8">
          {children}
        </div>
      </div>
    </DashboardShell>
  );
}
