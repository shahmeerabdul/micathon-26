"use client";

import { AppHeader } from "@/components/layout/AppHeader";
import { MobileShell } from "@/components/layout/MobileShell";
import { RecentList } from "@/components/dashboard/RecentList";
import { ListSkeleton } from "@/components/shared/Skeleton";
import { useLedger } from "@/lib/store/selectors";
import { useLedgerStore } from "@/lib/store/ledger-store";

export default function PayablesPage() {
  const hasHydrated = useLedgerStore((s) => s.hasHydrated);
  const entries = useLedger("payable");
  return (
    <>
      <AppHeader
        variant="page"
        title="Payables · Denay"
        subtitle="What you owe suppliers"
        backHref="/"
      />
      <MobileShell>
        {hasHydrated ? <RecentList entries={entries} /> : <ListSkeleton />}
      </MobileShell>
    </>
  );
}
