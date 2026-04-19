import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Amount } from "@/components/money/Amount";
import type { LedgerCategory } from "@/lib/types";
import { CATEGORY_LABELS } from "@/lib/format";

interface CategoryCardProps {
  category: LedgerCategory;
  amount: number;
  tone: "in" | "out" | "pending";
  icon: LucideIcon;
  subtitle?: string;
}

const toneBar: Record<CategoryCardProps["tone"], string> = {
  in: "bg-money-in",
  out: "bg-money-out",
  pending: "bg-pending",
};

const toneChip: Record<CategoryCardProps["tone"], string> = {
  in: "bg-money-in-bg text-money-in",
  out: "bg-money-out-bg text-money-out",
  pending: "bg-pending-bg text-pending",
};

export function CategoryCard({
  category,
  amount,
  tone,
  icon: Icon,
  subtitle,
}: CategoryCardProps) {
  const labels = CATEGORY_LABELS[category];
  return (
    <Link
      href={labels.href}
      className="group relative block overflow-hidden rounded-[24px] bg-white p-4 shadow-[0_10px_24px_-14px_rgba(0,0,0,0.15)] ring-1 ring-black/5 active:scale-[0.99] transition"
    >
      <div className={cn("absolute inset-y-4 left-0 w-1.5 rounded-r-full", toneBar[tone])} />
      <div className="flex items-center gap-3 pl-3">
        <span
          className={cn(
            "flex size-11 items-center justify-center rounded-full",
            toneChip[tone]
          )}
        >
          <Icon className="size-5" strokeWidth={2.25} />
        </span>
        <div className="flex-1 leading-tight">
          <p className="text-sm font-bold text-foreground">
            {labels.en}
            <span
              lang="ur"
              dir="rtl"
              className="ml-1.5 text-[12px] font-medium text-muted-foreground"
            >
              {labels.urduScript}
            </span>
          </p>
          {subtitle ? (
            <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
          ) : null}
        </div>
        <ArrowUpRight className="size-4 text-muted-foreground group-hover:text-foreground transition" />
      </div>
      <div className="mt-3 pl-3">
        <Amount value={amount} tone={tone} size="xl" />
      </div>
    </Link>
  );
}
