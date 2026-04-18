"use client";

import { AppHeader } from "@/components/layout/AppHeader";
import { MobileShell } from "@/components/layout/MobileShell";
import { RecentList } from "@/components/dashboard/RecentList";
import { ListSkeleton } from "@/components/shared/Skeleton";
import { useLedger } from "@/lib/store/selectors";
import { useLedgerStore } from "@/lib/store/ledger-store";

export default function DebtPage() {
  const hasHydrated = useLedgerStore((s) => s.hasHydrated);
  const entries = useLedger("debt");
  return (
    <>
      <AppHeader
        variant="page"
        title="Debt · Bakaya"
        subtitle="What customers owe you"
        backHref="/"
      />
      <MobileShell>
        {hasHydrated ? <RecentList entries={entries} /> : <ListSkeleton />}
      </MobileShell>
    </>
  );
}
