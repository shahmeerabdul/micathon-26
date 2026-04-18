"use client";

/**
 * Reactive selector hooks built on top of `useLedgerStore`.
 *
 * These compose primitive store state into the view-model shapes UI pages
 * consume (DashboardStats, LedgerEntry lists, single-contact projections).
 * Everything here is pure and memo-safe — components re-render only when
 * the underlying store slices change.
 */

import { useMemo } from "react";
import { useLedgerStore } from "./ledger-store";
import {
  debtToEntry,
  payableToEntry,
  saleToEntry,
  type LedgerEntry,
  type LedgerCategory,
  type DashboardStats,
  type Contact,
  type Id,
} from "../types";

/** Returns the full contact list sorted alphabetically. */
export function useContacts(): Contact[] {
  const contacts = useLedgerStore((s) => s.contacts);
  return useMemo(
    () => [...contacts].sort((a, b) => a.name.localeCompare(b.name)),
    [contacts]
  );
}

export function useContact(id: Id | undefined): Contact | undefined {
  const contacts = useLedgerStore((s) => s.contacts);
  return useMemo(
    () => (id ? contacts.find((c) => c.id === id) : undefined),
    [contacts, id]
  );
}

/** Raw lookup for imperative code (event handlers etc.). */
export function useContactMap(): Map<Id, Contact> {
  const contacts = useLedgerStore((s) => s.contacts);
  return useMemo(
    () => new Map(contacts.map((c) => [c.id, c])),
    [contacts]
  );
}

/**
 * Unified ledger view. Optionally filtered by category. Sorted newest-first.
 */
export function useLedger(category?: LedgerCategory): LedgerEntry[] {
  const debts = useLedgerStore((s) => s.debts);
  const payables = useLedgerStore((s) => s.payables);
  const sales = useLedgerStore((s) => s.sales);
  const contactMap = useContactMap();

  return useMemo(() => {
    const list: LedgerEntry[] = [];
    if (!category || category === "debt") {
      for (const d of debts) list.push(debtToEntry(d, contactMap.get(d.contactId)));
    }
    if (!category || category === "payable") {
      for (const p of payables) list.push(payableToEntry(p));
    }
    if (!category || category === "sale") {
      for (const s of sales) {
        list.push(saleToEntry(s, s.customerContactId ? contactMap.get(s.customerContactId) : undefined));
      }
    }
    return list.sort((a, b) => b.date - a.date);
  }, [debts, payables, sales, contactMap, category]);
}

/** Dashboard aggregate stats — receivable, payable, today's sales, counts. */
export function useDashboardStats(): DashboardStats {
  const debts = useLedgerStore((s) => s.debts);
  const payables = useLedgerStore((s) => s.payables);
  const sales = useLedgerStore((s) => s.sales);

  return useMemo(() => {
    const openDebts = debts.filter((d) => !d.settled);
    const openPayables = payables.filter((p) => !p.paid);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startMs = startOfDay.getTime();
    const todaySales = sales
      .filter((s) => s.date >= startMs)
      .reduce((sum, s) => sum + s.total, 0);
    return {
      totalReceivable: openDebts.reduce((s, d) => s + d.amount, 0),
      totalPayable: openPayables.reduce((s, p) => s + p.amount, 0),
      todaySales,
      pendingDebtCount: openDebts.length,
      pendingPayableCount: openPayables.length,
    };
  }, [debts, payables, sales]);
}

/**
 * Every debt (open + settled) for a single contact, newest-first.
 * Powers the contact detail timeline.
 */
export function useDebtsForContact(contactId: Id | undefined) {
  const debts = useLedgerStore((s) => s.debts);
  return useMemo(() => {
    if (!contactId) return [];
    return debts
      .filter((d) => d.contactId === contactId)
      .sort((a, b) => b.date - a.date);
  }, [debts, contactId]);
}

/** Sum of open debts for one contact. */
export function useContactOutstanding(contactId: Id | undefined): number {
  const debts = useDebtsForContact(contactId);
  return useMemo(
    () => debts.filter((d) => !d.settled).reduce((s, d) => s + d.amount, 0),
    [debts]
  );
}

/** Inventory items currently at or below their restock threshold. */
export function useLowStock() {
  const inventory = useLedgerStore((s) => s.inventory);
  return useMemo(
    () => inventory.filter((i) => i.quantity <= i.threshold),
    [inventory]
  );
}
