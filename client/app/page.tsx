"use client";

import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ShoppingBag,
  Plus,
  TrendingUp,
  Clock,
} from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { MobileShell } from "@/components/layout/MobileShell";
import { HeroBalance } from "@/components/dashboard/HeroBalance";
import { StatTile } from "@/components/dashboard/StatTile";
import { CategoryCard } from "@/components/dashboard/CategoryCard";
import { RecentList } from "@/components/dashboard/RecentList";
import { DashboardSkeleton } from "@/components/shared/Skeleton";
import { useDashboardStats, useLedger } from "@/lib/store/selectors";
import { useLedgerStore } from "@/lib/store/ledger-store";

export default function HomePage() {
  const hasHydrated = useLedgerStore((s) => s.hasHydrated);
  const stats = useDashboardStats();
  const recent = useLedger();

  return (
    <>
      <AppHeader variant="home" />
      <MobileShell>
        {!hasHydrated ? (
          <DashboardSkeleton />
        ) : (
          <>
            <HeroBalance
              totalReceivable={stats.totalReceivable}
              pendingDebtCount={stats.pendingDebtCount}
            />

            <div className="mt-4 flex gap-3">
              <StatTile
                label="Today's Sales"
                sublabel="Aaj ki bikri"
                amount={stats.todaySales}
                tone="in"
                icon={<TrendingUp className="size-4" />}
              />
              <StatTile
                label="You owe"
                sublabel="Aap ke denay"
                amount={stats.totalPayable}
                tone="out"
                icon={<Clock className="size-4" />}
              />
            </div>

            <div className="mt-6 flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                Categories
              </h2>
              <Link
                href="/new"
                className="flex items-center gap-1 rounded-full bg-white px-3 py-1 text-[11px] font-semibold ring-1 ring-border shadow-sm active:scale-95 transition"
              >
                <Plus className="size-3.5" strokeWidth={2.5} />
                Add manually
              </Link>
            </div>

            <div className="mt-3 space-y-3">
              <CategoryCard
                category="debt"
                amount={stats.totalReceivable}
                tone="pending"
                icon={ArrowDownLeft}
                subtitle="Udhaar customers owe you"
              />
              <CategoryCard
                category="payable"
                amount={stats.totalPayable}
                tone="out"
                icon={ArrowUpRight}
                subtitle="What you owe suppliers"
              />
              <CategoryCard
                category="sale"
                amount={stats.todaySales}
                tone="in"
                icon={ShoppingBag}
                subtitle="Today's cash sales"
              />
            </div>

            <div className="mt-7 flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                Recent activity
              </h2>
              <Link
                href="/activity"
                className="text-[11px] font-semibold text-foreground/70 hover:text-foreground"
              >
                See all
              </Link>
            </div>

            <div className="mt-3">
              <RecentList entries={recent.slice(0, 6)} />
            </div>

            <div className="h-4" />
          </>
        )}
      </MobileShell>
    </>
  );
}
