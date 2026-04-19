"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ArrowDownLeft, ArrowUpRight, ShoppingBag, Mic } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Home", icon: Home, urdu: "گھر" },
  { href: "/debt", label: "Debt", icon: ArrowDownLeft, urdu: "بقایا" },
  { href: "/payables", label: "Payables", icon: ArrowUpRight, urdu: "دینے" },
  { href: "/sales", label: "Sales", icon: ShoppingBag, urdu: "بکری" },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  // Hide the bottom nav on auth screens — they have their own CTA.
  if (pathname === "/login") return null;
  // Split nav into two halves so the center FAB can float between them.
  const leftItems = items.slice(0, 2);
  const rightItems = items.slice(2);

  return (
    <nav
      aria-label="Primary"
      className="sticky bottom-0 inset-x-0 z-40 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div className="relative mx-3 mb-0 rounded-full bg-white/95 backdrop-blur-md shadow-[0_10px_30px_-12px_rgba(0,0,0,0.25)] ring-1 ring-black/5">
        <ul className="grid grid-cols-5 items-center px-2 py-2">
          {leftItems.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}

          <li className="flex justify-center">
            <Link
              href="/record"
              aria-label="Record voice transaction"
              className={cn(
                "group relative -mt-8 flex size-16 items-center justify-center rounded-full bg-ink text-background",
                "shadow-[0_14px_30px_-8px_rgba(0,0,0,0.5)] ring-4 ring-background",
                "transition active:scale-95"
              )}
            >
              <Mic
                className="size-7 transition-transform group-active:scale-90"
                strokeWidth={2.25}
              />
            </Link>
          </li>

          {rightItems.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </ul>
      </div>
    </nav>
  );
}

function NavLink({
  item,
  pathname,
}: {
  item: (typeof items)[number];
  pathname: string;
}) {
  const active =
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
  const Icon = item.icon;
  return (
    <li className="flex justify-center">
      <Link
        href={item.href}
        className={cn(
          "flex flex-col items-center gap-0.5 rounded-full px-3 py-1 text-[10px] font-medium transition",
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        )}
        aria-current={active ? "page" : undefined}
      >
        <span
          lang="ur"
          dir="rtl"
          className="text-[9px] leading-none text-muted-foreground/70"
        >
          {item.urdu}
        </span>
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-full transition",
            active ? "bg-sage-soft" : "bg-transparent"
          )}
        >
          <Icon className="size-5" strokeWidth={active ? 2.25 : 2} />
        </span>
        <span className="leading-none">{item.label}</span>
      </Link>
    </li>
  );
}
