"use client";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Client-side ledger store.
 *
 *  This is the single source of truth the UI reads from and mutates. For the
 *  demo it persists to `localStorage` unencrypted — the backend teammate will
 *  swap the persist layer to @khata/server's encrypted IndexedDB once the
 *  vault actions land. The public store API (add/update/settle/delete) is
 *  shaped to map 1:1 onto future server actions so call-sites don't move.
 *
 *  Persistence caveats handled here:
 *    - Next.js SSR has no localStorage → the persist middleware correctly
 *      no-ops during render; consumers should gate UI on `hasHydrated`.
 *    - Zustand's `onRehydrateStorage` flips `hasHydrated` once client-side
 *      storage is loaded, preventing hydration-mismatch flashes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  Contact,
  Debt,
  Payable,
  Sale,
  SaleItem,
  Id,
  RupeeAmount,
  EpochMs,
  PakistanPhone,
} from "../types";
import { newId, now } from "../ids";

/** Lightweight inventory model used for the restock-alert demo. */
export interface InventoryItem {
  /** Lowercased canonical name, e.g. "sugar". Used as dedup key. */
  key: string;
  /** Display name. */
  name: string;
  /** Running stock-on-hand (decremented by sales, bumped by payables). */
  quantity: number;
  /** If `quantity` falls at or below this, surface a restock alert. */
  threshold: number;
  updatedAt: EpochMs;
}

interface LedgerState {
  contacts: Contact[];
  debts: Debt[];
  payables: Payable[];
  sales: Sale[];
  inventory: InventoryItem[];

  /** Flips true once zustand finishes rehydrating from localStorage. */
  hasHydrated: boolean;
  setHasHydrated(v: boolean): void;

  // --- contacts ----------------------------------------------------------
  addContact(input: { name: string; phone: PakistanPhone }): Contact;
  updateContact(contact: Contact): void;
  deleteContact(id: Id): void;

  // --- debts -------------------------------------------------------------
  addDebt(input: {
    contactId: Id;
    amount: RupeeAmount;
    date?: EpochMs;
    notes?: string;
  }): Debt;
  updateDebt(debt: Debt): void;
  setDebtSettled(id: Id, settled: boolean): void;
  deleteDebt(id: Id): void;

  // --- payables ----------------------------------------------------------
  addPayable(input: {
    wholesalerName: string;
    amount: RupeeAmount;
    date?: EpochMs;
    notes?: string;
    items?: Array<{ name: string; quantity: number }>;
  }): Payable;
  updatePayable(payable: Payable): void;
  setPayablePaid(id: Id, paid: boolean): void;
  deletePayable(id: Id): void;

  // --- sales -------------------------------------------------------------
  addSale(input: {
    customerContactId?: Id;
    items: SaleItem[];
    total: RupeeAmount;
    date?: EpochMs;
    notes?: string;
  }): Sale;
  updateSale(sale: Sale): void;
  deleteSale(id: Id): void;

  // --- inventory ---------------------------------------------------------
  ensureInventoryItem(
    name: string,
    opts?: { initialQty?: number; threshold?: number }
  ): InventoryItem;
  adjustInventory(name: string, delta: number): void;

  // --- misc --------------------------------------------------------------
  seedDemo(): void;
  clearAll(): void;
}

const STORAGE_KEY = "khata.ledger.v1";

export const useLedgerStore = create<LedgerState>()(
  persist(
    (set, get) => ({
      contacts: [],
      debts: [],
      payables: [],
      sales: [],
      inventory: [],
      hasHydrated: false,
      setHasHydrated: (v) => set({ hasHydrated: v }),

      // ── contacts ────────────────────────────────────────────────────────
      addContact: (input) => {
        const t = now();
        const c: Contact = {
          id: newId(),
          name: input.name.trim(),
          phone: input.phone,
          createdAt: t,
          updatedAt: t,
        };
        set({ contacts: [...get().contacts, c] });
        return c;
      },
      updateContact: (contact) =>
        set({
          contacts: get().contacts.map((c) =>
            c.id === contact.id ? { ...contact, updatedAt: now() } : c
          ),
        }),
      deleteContact: (id) =>
        set({ contacts: get().contacts.filter((c) => c.id !== id) }),

      // ── debts ───────────────────────────────────────────────────────────
      addDebt: (input) => {
        const t = now();
        const d: Debt = {
          id: newId(),
          contactId: input.contactId,
          amount: input.amount,
          date: input.date ?? t,
          notes: input.notes,
          settled: false,
          createdAt: t,
          updatedAt: t,
        };
        set({ debts: [...get().debts, d] });
        return d;
      },
      updateDebt: (debt) =>
        set({
          debts: get().debts.map((d) =>
            d.id === debt.id ? { ...debt, updatedAt: now() } : d
          ),
        }),
      setDebtSettled: (id, settled) =>
        set({
          debts: get().debts.map((d) =>
            d.id === id ? { ...d, settled, updatedAt: now() } : d
          ),
        }),
      deleteDebt: (id) =>
        set({ debts: get().debts.filter((d) => d.id !== id) }),

      // ── payables ────────────────────────────────────────────────────────
      addPayable: (input) => {
        const t = now();
        const p: Payable = {
          id: newId(),
          wholesalerName: input.wholesalerName.trim(),
          amount: input.amount,
          date: input.date ?? t,
          notes: input.notes,
          paid: false,
          createdAt: t,
          updatedAt: t,
        };
        set({ payables: [...get().payables, p] });
        // Restock side-effect: receiving stock from a wholesaler bumps inventory.
        if (input.items?.length) {
          for (const it of input.items) {
            get().adjustInventory(it.name, it.quantity);
          }
        }
        return p;
      },
      updatePayable: (payable) =>
        set({
          payables: get().payables.map((p) =>
            p.id === payable.id ? { ...payable, updatedAt: now() } : p
          ),
        }),
      setPayablePaid: (id, paid) =>
        set({
          payables: get().payables.map((p) =>
            p.id === id ? { ...p, paid, updatedAt: now() } : p
          ),
        }),
      deletePayable: (id) =>
        set({ payables: get().payables.filter((p) => p.id !== id) }),

      // ── sales ───────────────────────────────────────────────────────────
      addSale: (input) => {
        const t = now();
        const s: Sale = {
          id: newId(),
          customerContactId: input.customerContactId,
          items: input.items,
          total: input.total,
          date: input.date ?? t,
          notes: input.notes,
          createdAt: t,
          updatedAt: t,
        };
        set({ sales: [...get().sales, s] });
        for (const it of input.items) {
          get().adjustInventory(it.name, -it.quantity);
        }
        return s;
      },
      updateSale: (sale) =>
        set({
          sales: get().sales.map((s) =>
            s.id === sale.id ? { ...sale, updatedAt: now() } : s
          ),
        }),
      deleteSale: (id) =>
        set({ sales: get().sales.filter((s) => s.id !== id) }),

      // ── inventory ───────────────────────────────────────────────────────
      ensureInventoryItem: (name, opts) => {
        const key = name.trim().toLowerCase();
        const existing = get().inventory.find((i) => i.key === key);
        if (existing) return existing;
        const created: InventoryItem = {
          key,
          name: name.trim(),
          quantity: opts?.initialQty ?? 0,
          threshold: opts?.threshold ?? 3,
          updatedAt: now(),
        };
        set({ inventory: [...get().inventory, created] });
        return created;
      },
      adjustInventory: (name, delta) => {
        const key = name.trim().toLowerCase();
        const existing = get().inventory.find((i) => i.key === key);
        if (!existing) {
          // Auto-create with a sane default threshold when first seen.
          const created: InventoryItem = {
            key,
            name: name.trim(),
            quantity: Math.max(0, delta),
            threshold: 3,
            updatedAt: now(),
          };
          set({ inventory: [...get().inventory, created] });
          return;
        }
        set({
          inventory: get().inventory.map((i) =>
            i.key === key
              ? {
                  ...i,
                  quantity: Math.max(0, i.quantity + delta),
                  updatedAt: now(),
                }
              : i
          ),
        });
      },

      // ── misc ────────────────────────────────────────────────────────────
      seedDemo: () => {
        const state = get();
        if (
          state.contacts.length ||
          state.debts.length ||
          state.payables.length ||
          state.sales.length
        ) {
          return; // never overwrite user data
        }
        const t = now();
        const HOUR = 60 * 60 * 1000;
        const DAY = 24 * HOUR;

        const ahmed: Contact = {
          id: newId(),
          name: "Ahmed Khan",
          phone: "+923001234567",
          createdAt: t - 30 * DAY,
          updatedAt: t,
        };
        const zainab: Contact = {
          id: newId(),
          name: "Zainab Bibi",
          phone: "+923217654321",
          createdAt: t - 10 * DAY,
          updatedAt: t,
        };
        const saleem: Contact = {
          id: newId(),
          name: "Saleem Ullah",
          phone: "+923451112233",
          createdAt: t - 3 * DAY,
          updatedAt: t,
        };

        set({
          contacts: [ahmed, zainab, saleem],
          debts: [
            {
              id: newId(),
              contactId: ahmed.id,
              amount: 500,
              date: t - 2 * HOUR,
              notes: "Morning purchase",
              settled: false,
              createdAt: t - 2 * HOUR,
              updatedAt: t - 2 * HOUR,
            },
            {
              id: newId(),
              contactId: zainab.id,
              amount: 320,
              date: t - 5 * HOUR,
              settled: false,
              createdAt: t - 5 * HOUR,
              updatedAt: t - 5 * HOUR,
            },
            {
              id: newId(),
              contactId: saleem.id,
              amount: 1200,
              date: t - 2 * DAY,
              notes: "Pays on Friday",
              settled: false,
              createdAt: t - 2 * DAY,
              updatedAt: t - 2 * DAY,
            },
          ],
          payables: [
            {
              id: newId(),
              wholesalerName: "Bilal Wholesale",
              amount: 8400,
              date: t - 3 * HOUR,
              notes: "Weekly restock",
              paid: false,
              createdAt: t - 3 * HOUR,
              updatedAt: t - 3 * HOUR,
            },
          ],
          sales: [
            {
              id: newId(),
              items: [
                { name: "tea", quantity: 2, unitPrice: 300, lineTotal: 600 },
                { name: "sugar", quantity: 1, unitPrice: 600, lineTotal: 600 },
              ],
              total: 1200,
              date: t - HOUR,
              createdAt: t - HOUR,
              updatedAt: t - HOUR,
            },
          ],
          inventory: [
            { key: "tea", name: "tea", quantity: 4, threshold: 3, updatedAt: t },
            { key: "sugar", name: "sugar", quantity: 2, threshold: 3, updatedAt: t },
            { key: "rice", name: "rice", quantity: 10, threshold: 4, updatedAt: t },
          ],
        });
      },
      clearAll: () =>
        set({
          contacts: [],
          debts: [],
          payables: [],
          sales: [],
          inventory: [],
        }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => {
        if (typeof window === "undefined") {
          // No-op storage during SSR; persist middleware needs *something*.
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };
        }
        return window.localStorage;
      }),
      partialize: (s) => ({
        contacts: s.contacts,
        debts: s.debts,
        payables: s.payables,
        sales: s.sales,
        inventory: s.inventory,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // One-time cleanup: prior versions of the supplier_payment mirror
          // wrote a zero-amount "paid" payable whenever the voice command
          // didn't match an existing wholesaler. Those rows now appear as
          // "+Rs. 0 · settled" noise in /payables, so we prune them on
          // rehydrate. Safe because a legitimate payable can never have
          // amount === 0.
          const cleanedPayables = state.payables.filter(
            (p) => !(p.amount === 0 && p.paid),
          );
          if (cleanedPayables.length !== state.payables.length) {
            state.payables = cleanedPayables;
          }
          state.setHasHydrated(true);
        }
      },
    }
  )
);

/**
 * Idempotent demo seeder — safe to call on every mount; it refuses to
 * overwrite existing data. Run it once from a root client boundary so
 * the first demo launch isn't empty.
 */
export function ensureDemoSeed() {
  const s = useLedgerStore.getState();
  if (!s.hasHydrated) return;
  s.seedDemo();
}
