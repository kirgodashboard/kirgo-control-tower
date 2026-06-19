"use client";

import { Moon, Sun, Menu } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface TopBarProps {
  onMenuClick?: () => void;
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <header className={cn(
      "h-14 flex-shrink-0 flex items-center justify-between px-4 sm:px-5",
      "border-b border-border bg-background/95 backdrop-blur-sm"
    )}>
      {/* Left: hamburger on mobile */}
      <div className="flex items-center">
        <button
          onClick={onMenuClick}
          className={cn(
            "h-8 w-8 flex items-center justify-center rounded-md lg:hidden",
            "text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          )}
          aria-label="Open navigation"
        >
          <Menu className="h-[15px] w-[15px]" />
        </button>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className={cn(
            "h-8 w-8 flex items-center justify-center rounded-md",
            "text-muted-foreground hover:text-foreground hover:bg-accent",
            "transition-colors"
          )}
          aria-label="Toggle theme"
        >
          {mounted && theme === "dark"
            ? <Sun className="h-[15px] w-[15px]" />
            : <Moon className="h-[15px] w-[15px]" />
          }
        </button>
      </div>
    </header>
  );
}
