"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { MobileShell } from "@/components/layout/MobileShell";
import { ContactPicker } from "@/components/forms/ContactPicker";
import { BigInput, BigTextarea, FormField } from "@/components/forms/FormField";
import { formatPKR } from "@/lib/format";
import { useLedgerStore } from "@/lib/store/ledger-store";
import type { Id, SaleItem } from "@/lib/types";

interface DraftSaleItem {
  name: string;
  quantity: string;
  unitPrice: string;
}

export default function NewSalePage() {
  const router = useRouter();
  const addSale = useLedgerStore((s) => s.addSale);
  const deleteSale = useLedgerStore((s) => s.deleteSale);

  const [customerId, setCustomerId] = useState<Id | undefined>(undefined);
  const [items, setItems] = useState<DraftSaleItem[]>([
    { name: "", quantity: "1", unitPrice: "" },
  ]);
  const [notes, setNotes] = useState("");

  const total = useMemo(
    () =>
      items.reduce((sum, it) => {
        const q = Number(it.quantity) || 0;
        const u = Number(it.unitPrice) || 0;
        return sum + q * u;
      }, 0),
    [items]
  );
  const canSubmit =
    total > 0 &&
    items.some((i) => i.name.trim() && Number(i.quantity) > 0);

  const updateItem = (idx: number, patch: Partial<DraftSaleItem>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const addItem = () =>
    setItems((prev) => [...prev, { name: "", quantity: "1", unitPrice: "" }]);
  const removeItem = (idx: number) =>
    setItems((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = () => {
    if (!canSubmit) return;
    const finalItems: SaleItem[] = items
      .map((it) => {
        const quantity = Number(it.quantity) || 0;
        const unitPrice = Number(it.unitPrice) || 0;
        return {
          name: it.name.trim(),
          quantity,
          unitPrice,
          lineTotal: quantity * unitPrice,
        };
      })
      .filter((it) => it.name && it.quantity > 0);
    const sale = addSale({
      customerContactId: customerId,
      items: finalItems,
      total,
      notes: notes.trim() || undefined,
    });
    toast.success(`Sale recorded — ${formatPKR(total)}`, {
      action: {
        label: "Undo",
        onClick: () => deleteSale(sale.id),
      },
    });
    router.push("/sales");
  };

  return (
    <>
      <AppHeader
        variant="page"
        title="New sale · Bikri"
        subtitle="Cash received"
        backHref="/new"
      />
      <MobileShell>
        <div className="space-y-5">
          <FormField label="Customer" sublabel="Optional — walk-in OK">
            <ContactPicker
              value={customerId}
              onChange={setCustomerId}
              allowClear
              placeholder="Walk-in cash"
            />
          </FormField>

          <FormField label="Items" sublabel="Kya becha?">
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="rounded-2xl bg-white p-3 ring-1 ring-border shadow-sm space-y-2">
                  <div className="flex gap-2">
                    <BigInput
                      value={it.name}
                      onChange={(e) => updateItem(idx, { name: e.target.value })}
                      placeholder="Item"
                      className="flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      aria-label="Remove item"
                      disabled={items.length === 1}
                      className="flex size-12 items-center justify-center rounded-2xl bg-muted disabled:opacity-30"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <BigInput
                      value={it.quantity}
                      onChange={(e) =>
                        updateItem(idx, { quantity: e.target.value })
                      }
                      inputMode="numeric"
                      placeholder="Qty"
                      className="flex-1 text-center"
                    />
                    <span className="flex items-center px-2 text-muted-foreground">
                      ×
                    </span>
                    <BigInput
                      value={it.unitPrice}
                      onChange={(e) =>
                        updateItem(idx, { unitPrice: e.target.value })
                      }
                      inputMode="numeric"
                      placeholder="Rate"
                      className="flex-1 text-center"
                    />
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={addItem}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-sage-soft px-4 py-3 text-sm font-semibold ring-1 ring-black/5 active:scale-[0.99] transition"
              >
                <Plus className="size-4" />
                Add item
              </button>
            </div>
          </FormField>

          <div className="flex items-center justify-between rounded-2xl bg-hero px-5 py-4 text-hero-foreground shadow-sm">
            <span className="text-sm font-semibold uppercase tracking-wide">
              Total
            </span>
            <span className="tabular text-3xl font-bold">
              {formatPKR(total)}
            </span>
          </div>

          <FormField label="Notes" sublabel="Optional">
            <BigTextarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. morning sale"
            />
          </FormField>

          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="w-full rounded-2xl bg-ink px-5 py-4 text-base font-semibold text-background shadow-[0_14px_30px_-14px_rgba(0,0,0,0.5)] active:scale-95 transition disabled:opacity-40"
          >
            Save sale
          </button>
        </div>
      </MobileShell>
    </>
  );
}
