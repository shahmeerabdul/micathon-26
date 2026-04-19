"use client";

/**
 * ActionHero — a large, decorative hero card at the top of the receipt
 * screen. Each of the four voice-intent actions gets its own colour
 * palette, icon, and subtle animation so the shopkeeper can instantly
 * recognise what happened without reading.
 *
 *    purchase / payment (cash)  → sunny yellow hero (existing "money" look)
 *    payment                    → mint green "money in" card
 *    new_customer               → lilac/blue welcome card with a ping
 *    query_bills                → slate/terracotta ledger card
 */

import type { LucideIcon } from "lucide-react";
import {
  CheckCircle2,
  FileText,
  PackagePlus,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type HeroAction =
  | "purchase_debt"
  | "purchase_cash"
  | "payment"
  | "new_customer"
  | "query_bills"
  | "supplier_payment"
  | "supplier_credit"
  | "cash_sale";

interface Theme {
  icon: LucideIcon;
  badge: string;
  bg: string; // gradient classes for the card bg
  text: string; // foreground color
  accent: string; // floating blob color
  pulse: string; // pulse ring colour
  label: string;
}

const THEMES: Record<HeroAction, Theme> = {
  purchase_debt: {
    icon: ShoppingBag,
    badge: "On credit · Udhaar",
    bg: "bg-gradient-to-br from-[#fbbf24] via-[#f9e27a] to-[#fde9a6]",
    text: "text-[#2a1a00]",
    accent: "bg-[#f97316]/30",
    pulse: "bg-[#c2780c]/40",
    label: "Added to tab",
  },
  purchase_cash: {
    icon: ShoppingBag,
    badge: "Cash sale",
    bg: "bg-gradient-to-br from-[#f9e27a] via-[#fff6cc] to-[#fef9e2]",
    text: "text-[#2a1a00]",
    accent: "bg-[#fbbf24]/40",
    pulse: "bg-[#ca8a04]/35",
    label: "Cash received",
  },
  payment: {
    icon: CheckCircle2,
    badge: "Payment received",
    bg: "bg-gradient-to-br from-[#0f8a4d] via-[#34c77a] to-[#b6efcb]",
    text: "text-white",
    accent: "bg-white/25",
    pulse: "bg-white/40",
    label: "Marked as paid",
  },
  new_customer: {
    icon: UserPlus,
    badge: "New customer",
    bg: "bg-gradient-to-br from-[#5b8def] via-[#8ba7ff] to-[#c7dbff]",
    text: "text-white",
    accent: "bg-white/20",
    pulse: "bg-white/35",
    label: "Welcome",
  },
  query_bills: {
    icon: FileText,
    badge: "Ledger lookup",
    bg: "bg-gradient-to-br from-[#1f2937] via-[#374151] to-[#6b7280]",
    text: "text-white",
    accent: "bg-[#f9e27a]/25",
    pulse: "bg-[#f9e27a]/40",
    label: "Bills summary",
  },
  supplier_payment: {
    icon: CheckCircle2,
    badge: "Paid supplier · Bakaya ada",
    bg: "bg-gradient-to-br from-[#c2410c] via-[#f97316] to-[#fdba74]",
    text: "text-white",
    accent: "bg-white/25",
    pulse: "bg-white/40",
    label: "Payable updated",
  },
  supplier_credit: {
    icon: PackagePlus,
    badge: "More on tab · Naya udhaar",
    bg: "bg-gradient-to-br from-[#7c2d12] via-[#c2410c] to-[#f97316]",
    text: "text-white",
    accent: "bg-white/25",
    pulse: "bg-white/40",
    label: "Payable grew",
  },
  cash_sale: {
    icon: TrendingUp,
    badge: "Cash sale · Aaj ki bikri",
    bg: "bg-gradient-to-br from-[#0f8a4d] via-[#34c77a] to-[#d1f2df]",
    text: "text-white",
    accent: "bg-white/25",
    pulse: "bg-white/40",
    label: "Added to today",
  },
};

export interface ActionHeroProps {
  action: HeroAction;
  /** Main line — a big amount or a name. */
  headline: string;
  /** Small subline under the headline. Defaults to the theme badge. */
  sublabel?: string;
  /** Optional corner label (e.g. "Undone"). Overrides the theme badge. */
  statusLabel?: string;
}

export function ActionHero({
  action,
  headline,
  sublabel,
  statusLabel,
}: ActionHeroProps) {
  const theme = THEMES[action];
  const Icon = theme.icon;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[28px] p-5 shadow-[0_20px_45px_-18px_rgba(0,0,0,0.35)]",
        theme.bg,
        theme.text,
      )}
    >
      {/* Decorative blobs */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -top-10 -right-6 size-40 rounded-full blur-2xl",
          theme.accent,
        )}
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -bottom-14 -left-10 size-48 rounded-full blur-2xl",
          theme.accent,
        )}
      />

      {/* Big icon with pulse */}
      <div className="relative mb-3 flex items-center justify-between">
        <div className="relative">
          <span
            aria-hidden
            className={cn(
              "absolute inset-0 animate-ping rounded-full opacity-70",
              theme.pulse,
            )}
          />
          <span
            className={cn(
              "relative flex size-11 items-center justify-center rounded-full ring-1 ring-white/40",
              action === "purchase_cash" || action === "purchase_debt"
                ? "bg-white/60 text-[#2a1a00]"
                : "bg-white/20 text-white",
            )}
          >
            <Icon className="size-5" strokeWidth={2.25} />
          </span>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider backdrop-blur-sm">
          <Sparkles className="size-3" />
          <span>{statusLabel ?? theme.label}</span>
        </div>
      </div>

      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-85">
        {sublabel ?? theme.badge}
      </p>
      <p className="mt-1 tabular text-[34px] leading-none font-bold break-words">
        {headline}
      </p>
    </div>
  );
}
