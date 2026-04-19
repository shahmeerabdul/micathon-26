"use client";

import { AppHeader } from "@/components/layout/AppHeader";
import { MobileShell } from "@/components/layout/MobileShell";
import { DebtByContactList } from "@/components/dashboard/DebtByContactList";
import { ListSkeleton } from "@/components/shared/Skeleton";
import { useOpenDebtsByContact } from "@/lib/store/selectors";
import { useLedgerStore } from "@/lib/store/ledger-store";

export default function DebtPage() {
  const hasHydrated = useLedgerStore((s) => s.hasHydrated);
  const groups = useOpenDebtsByContact();
  return (
    <>
      <AppHeader
        variant="page"
        title="Debt"
        urduTitle="بقایا"
        subtitle="What customers owe you"
        backHref="/"
      />
      <MobileShell>
        {hasHydrated ? <DebtByContactList groups={groups} /> : <ListSkeleton />}
      </MobileShell>
    </>
  );
}
