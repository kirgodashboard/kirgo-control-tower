"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function TopBar() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <header className={cn(
      "h-14 flex-shrink-0 flex items-center justify-between px-5",
      "border-b border-border bg-background/95 backdrop-blur-sm"
    )}>
      {/* Left: spacer for page title (rendered inline in each page) */}
      <div />

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
