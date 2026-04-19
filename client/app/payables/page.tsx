"use client";

import { AppHeader } from "@/components/layout/AppHeader";
import { MobileShell } from "@/components/layout/MobileShell";
import { PayableBySupplierList } from "@/components/dashboard/PayableBySupplierList";
import { ListSkeleton } from "@/components/shared/Skeleton";
import { useOpenPayablesBySupplier } from "@/lib/store/selectors";
import { useLedgerStore } from "@/lib/store/ledger-store";

export default function PayablesPage() {
  const hasHydrated = useLedgerStore((s) => s.hasHydrated);
  const groups = useOpenPayablesBySupplier();
  return (
    <>
      <AppHeader
        variant="page"
        title="Payables"
        urduTitle="دینے"
        subtitle="What you owe suppliers"
        backHref="/"
      />
      <MobileShell>
        {hasHydrated ? (
          <PayableBySupplierList groups={groups} />
        ) : (
          <ListSkeleton />
        )}
      </MobileShell>
    </>
  );
}
