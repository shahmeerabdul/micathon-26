import type { LedgerCategory, RupeeAmount, EpochMs } from "./types";

export function formatPKR(
  amount: RupeeAmount,
  options?: { sign?: boolean }
): string {
  const abs = Math.abs(amount);
  const formatted = new Intl.NumberFormat("en-PK", {
    maximumFractionDigits: 0,
  }).format(abs);
  const sign = options?.sign ? (amount < 0 ? "−" : "+") : "";
  return `${sign}Rs. ${formatted}`;
}

export function formatPKRCompact(amount: RupeeAmount): string {
  if (Math.abs(amount) >= 100000) {
    return `Rs. ${(amount / 100000).toFixed(1)}L`;
  }
  if (Math.abs(amount) >= 1000) {
    return `Rs. ${(amount / 1000).toFixed(1)}k`;
  }
  return formatPKR(amount);
}

export function timeAgo(when: EpochMs | string): string {
  const ms = typeof when === "number" ? when : new Date(when).getTime();
  const diff = Date.now() - ms;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ms).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

export const CATEGORY_LABELS: Record<
  LedgerCategory,
  { en: string; ur: string; urduScript: string; verb: string; href: string }
> = {
  debt: {
    en: "Debt",
    ur: "Bakaya",
    urduScript: "بقایا",
    verb: "owes you",
    href: "/debt",
  },
  payable: {
    en: "Payables",
    ur: "Denay",
    urduScript: "دینے",
    verb: "you owe",
    href: "/payables",
  },
  sale: {
    en: "Sales",
    ur: "Bikri",
    urduScript: "بکری",
    verb: "received",
    href: "/sales",
  },
};

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
