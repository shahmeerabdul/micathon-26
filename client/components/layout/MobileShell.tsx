import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface MobileShellProps {
  children: ReactNode;
  /** Remove default horizontal padding (e.g. for hero sections that bleed). */
  flush?: boolean;
  className?: string;
}

/**
 * The scrollable content area of the phone canvas. Bottom nav sits outside
 * this in the root layout.
 */
export function MobileShell({ children, flush, className }: MobileShellProps) {
  return (
    <main
      className={cn(
        "flex-1 overflow-y-auto no-scrollbar",
        flush ? "" : "px-5 pt-4 pb-6",
        className
      )}
    >
      {children}
    </main>
  );
}
