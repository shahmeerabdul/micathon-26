"use client";

import { useMemo, useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { MobileShell } from "@/components/layout/MobileShell";
import { RecentList } from "@/components/dashboard/RecentList";
import { ListSkeleton } from "@/components/shared/Skeleton";
import { useLedger } from "@/lib/store/selectors";
import { useLedgerStore } from "@/lib/store/ledger-store";
import { cn } from "@/lib/utils";
import type { LedgerCategory } from "@/lib/types";

type Filter = "all" | LedgerCategory;

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "debt", label: "Debt" },
  { id: "payable", label: "Payables" },
  { id: "sale", label: "Sales" },
];

export default function ActivityPage() {
  const hasHydrated = useLedgerStore((s) => s.hasHydrated);
  const [filter, setFilter] = useState<Filter>("all");
  const entries = useLedger(filter === "all" ? undefined : filter);

  const grouped = useMemo(() => {
    const byDay = new Map<string, typeof entries>();
    for (const e of entries) {
      const key = new Date(e.date).toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
      const bucket = byDay.get(key) ?? [];
      bucket.push(e);
      byDay.set(key, bucket);
    }
    return Array.from(byDay.entries());
  }, [entries]);

  return (
    <>
      <AppHeader
        variant="page"
        title="Activity"
        subtitle="Sari tafseelat"
        backHref="/"
      />
      <MobileShell>
        {/* Filter pills */}
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                "shrink-0 rounded-full px-4 py-2 text-xs font-semibold ring-1 transition",
                filter === f.id
                  ? "bg-ink text-background ring-ink"
                  : "bg-white ring-border"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {!hasHydrated ? (
          <ListSkeleton count={6} />
        ) : grouped.length === 0 ? (
          <div className="rounded-[24px] bg-white/80 p-6 text-center ring-1 ring-black/5">
            <p className="text-sm text-muted-foreground">
              No activity in this view yet.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {grouped.map(([day, items]) => (
              <section key={day}>
                <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {day}
                </h3>
                <RecentList entries={items} />
              </section>
            ))}
          </div>
        )}
      </MobileShell>
    </>
  );
}
