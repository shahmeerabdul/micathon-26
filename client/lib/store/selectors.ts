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
  type EpochMs,
  type RupeeAmount,
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

/**
 * Find a local contact by display name — useful when bridging from a
 * server-returned `CustomerView` (which knows the name but not the local
 * Zustand id) back into the client store. Case- and whitespace-tolerant.
 */
export function useLocalContactByName(name: string | undefined): Contact | undefined {
  const contacts = useLedgerStore((s) => s.contacts);
  return useMemo(() => {
    if (!name) return undefined;
    const key = name.trim().toLowerCase();
    return contacts.find((c) => c.name.trim().toLowerCase() === key);
  }, [contacts, name]);
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

/**
 * Aggregate of open debts grouped by customer.
 *
 * Each customer surfaces as a single row carrying the running total they owe,
 * the most recent debt timestamp, and the count of underlying debt events.
 * Individual debt transactions are preserved in the store — they remain
 * visible on the contact detail page — so this view-model exists purely so
 * `/debt` behaves like a khata book (one line per customer, not per entry).
 *
 * Sorted by most recent activity first.
 */
export interface DebtContactGroup {
  contactId: Id;
  name: string;
  /** Sum of `amount` across this contact's unsettled debts. */
  total: RupeeAmount;
  /** Most recent debt `date` across the contact's unsettled debts. */
  latestDate: EpochMs;
  /** Number of unsettled debt events rolled up into this row. */
  count: number;
}

export function useOpenDebtsByContact(): DebtContactGroup[] {
  const debts = useLedgerStore((s) => s.debts);
  const contactMap = useContactMap();

  return useMemo(() => {
    const groups = new Map<Id, DebtContactGroup>();
    for (const d of debts) {
      if (d.settled) continue;
      const contact = contactMap.get(d.contactId);
      const existing = groups.get(d.contactId);
      if (existing) {
        existing.total += d.amount;
        existing.count += 1;
        if (d.date > existing.latestDate) existing.latestDate = d.date;
      } else {
        groups.set(d.contactId, {
          contactId: d.contactId,
          name: contact?.name ?? "Unknown",
          total: d.amount,
          latestDate: d.date,
          count: 1,
        });
      }
    }
    return [...groups.values()].sort((a, b) => b.latestDate - a.latestDate);
  }, [debts, contactMap]);
}

/**
 * Aggregate of open payables grouped by supplier name.
 *
 * Same rationale as `useOpenDebtsByContact` — payables for the same
 * wholesaler should collapse into a single row on the Payables page so
 * "Bilal Wholesale Rs. 400" and "Bilal Wholesale Rs. 85,000" appear as
 * one "Bilal Wholesale Rs. 85,400" line. The underlying transaction
 * rows are preserved and remain editable via the entry detail page.
 *
 * Names are grouped case-insensitively with whitespace collapsed.
 */
export interface PayableSupplierGroup {
  /** Canonical (most-recent) display name for the supplier. */
  name: string;
  /** Normalised lower-case key used for fuzzy matching + grouping. */
  key: string;
  /** Sum of `amount` across this supplier's unpaid payables. */
  total: RupeeAmount;
  /** Most recent payable `date` across the supplier's unpaid payables. */
  latestDate: EpochMs;
  /** Number of unpaid payable events rolled up into this row. */
  count: number;
  /** IDs of the underlying unpaid payables — handy for deep-linking to
   *  the entry detail page from the grouped row. */
  payableIds: Id[];
}

export function useOpenPayablesBySupplier(): PayableSupplierGroup[] {
  const payables = useLedgerStore((s) => s.payables);

  return useMemo(() => {
    const groups = new Map<string, PayableSupplierGroup>();
    for (const p of payables) {
      if (p.paid) continue;
      const key = p.wholesalerName.trim().toLowerCase().replace(/\s+/g, " ");
      const existing = groups.get(key);
      if (existing) {
        existing.total += p.amount;
        existing.count += 1;
        existing.payableIds.push(p.id);
        if (p.date > existing.latestDate) {
          existing.latestDate = p.date;
          existing.name = p.wholesalerName;
        }
      } else {
        groups.set(key, {
          key,
          name: p.wholesalerName,
          total: p.amount,
          latestDate: p.date,
          count: 1,
          payableIds: [p.id],
        });
      }
    }
    return [...groups.values()].sort((a, b) => b.latestDate - a.latestDate);
  }, [payables]);
}

/** Sum of open debts for one contact. */
export function useContactOutstanding(contactId: Id | undefined): number {
  const debts = useDebtsForContact(contactId);
  return useMemo(
    () => debts.filter((d) => !d.settled).reduce((s, d) => s + d.amount, 0),
    [debts]
  );
}

/**
 * Lifetime cash-paid spend for a contact, derived from the Sales list.
 * Mirrors the server's definition (cash purchases only — open debts are
 * tracked separately via `useContactOutstanding`).
 */
export function useContactTotalSpent(contactId: Id | undefined): number {
  const sales = useLedgerStore((s) => s.sales);
  return useMemo(() => {
    if (!contactId) return 0;
    return sales
      .filter((s) => s.customerContactId === contactId)
      .reduce((sum, s) => sum + s.total, 0);
  }, [sales, contactId]);
}

/** Inventory items currently at or below their restock threshold. */
export function useLowStock() {
  const inventory = useLedgerStore((s) => s.inventory);
  return useMemo(
    () => inventory.filter((i) => i.quantity <= i.threshold),
    [inventory]
  );
}
