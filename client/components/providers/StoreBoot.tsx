"use client";

import { useEffect } from "react";
import { useLedgerStore } from "@/lib/store/ledger-store";

/**
 * Mounts once at the root of the app, waits for zustand to rehydrate from
 * localStorage, then idempotently seeds demo data on first launch.
 * Renders nothing; it exists purely for the side-effect.
 */
export function StoreBoot() {
  const hasHydrated = useLedgerStore((s) => s.hasHydrated);
  const seedDemo = useLedgerStore((s) => s.seedDemo);

  useEffect(() => {
    if (hasHydrated) seedDemo();
  }, [hasHydrated, seedDemo]);

  return null;
}
