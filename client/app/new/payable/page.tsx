"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { MobileShell } from "@/components/layout/MobileShell";
import { AmountInput } from "@/components/forms/AmountInput";
import { BigInput, BigTextarea, FormField } from "@/components/forms/FormField";
import { useLedgerStore } from "@/lib/store/ledger-store";

interface DraftItem {
  name: string;
  quantity: string;
}

export default function NewPayablePage() {
  const router = useRouter();
  const addPayable = useLedgerStore((s) => s.addPayable);
  const deletePayable = useLedgerStore((s) => s.deletePayable);

  const [wholesaler, setWholesaler] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DraftItem[]>([]);

  const amount = Number(amountStr) || 0;
  const canSubmit = wholesaler.trim().length > 0 && amount > 0;

  const addItemRow = () =>
    setItems((prev) => [...prev, { name: "", quantity: "" }]);
  const updateItem = (idx: number, patch: Partial<DraftItem>) =>
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, ...patch } : it))
    );
  const removeItem = (idx: number) =>
    setItems((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = () => {
    if (!canSubmit) return;
    const restockItems = items
      .map((i) => ({
        name: i.name.trim(),
        quantity: Number(i.quantity) || 0,
      }))
      .filter((i) => i.name && i.quantity > 0);
    const payable = addPayable({
      wholesalerName: wholesaler.trim(),
      amount,
      notes: notes.trim() || undefined,
      items: restockItems.length ? restockItems : undefined,
    });
    toast.success(`Payable recorded — Rs. ${amount.toLocaleString("en-PK")}`, {
      action: {
        label: "Undo",
        onClick: () => deletePayable(payable.id),
      },
    });
    router.push("/payables");
  };

  return (
    <>
      <AppHeader
        variant="page"
        title="New payable"
        urduTitle="نیا دین"
        subtitle="You owe a supplier"
        backHref="/new"
      />
      <MobileShell>
        <div className="space-y-5">
          <FormField label="Wholesaler" sublabel="Kis se kharida?">
            <BigInput
              value={wholesaler}
              onChange={(e) => setWholesaler(e.target.value)}
              placeholder="e.g. Bilal Wholesale"
            />
          </FormField>

          <AmountInput
            value={amountStr}
            onChange={setAmountStr}
            label="Amount owed"
          />

          <FormField
            label="Restocked items"
            sublabel="Optional — bumps inventory"
          >
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="flex gap-2">
                  <BigInput
                    value={it.name}
                    onChange={(e) => updateItem(idx, { name: e.target.value })}
                    placeholder="Item (e.g. sugar)"
                    className="flex-1"
                  />
                  <BigInput
                    value={it.quantity}
                    onChange={(e) =>
                      updateItem(idx, { quantity: e.target.value })
                    }
                    inputMode="numeric"
                    placeholder="Qty"
                    className="w-24 text-center"
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    aria-label="Remove item"
                    className="flex size-12 items-center justify-center rounded-2xl bg-white ring-1 ring-border shadow-sm"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addItemRow}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-sage-soft px-4 py-3 text-sm font-semibold ring-1 ring-black/5 active:scale-[0.99] transition"
              >
                <Plus className="size-4" />
                Add item
              </button>
            </div>
          </FormField>

          <FormField label="Notes" sublabel="Optional">
            <BigTextarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. weekly restock, due next Friday"
            />
          </FormField>

          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="w-full rounded-2xl bg-ink px-5 py-4 text-base font-semibold text-background shadow-[0_14px_30px_-14px_rgba(0,0,0,0.5)] active:scale-95 transition disabled:opacity-40"
          >
            Save payable
          </button>
        </div>
      </MobileShell>
    </>
  );
}
