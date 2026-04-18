"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { MobileShell } from "@/components/layout/MobileShell";
import { AmountInput } from "@/components/forms/AmountInput";
import { ContactPicker } from "@/components/forms/ContactPicker";
import { BigTextarea, FormField } from "@/components/forms/FormField";
import { useLedgerStore } from "@/lib/store/ledger-store";
import type { Id } from "@/lib/types";

export default function NewDebtPage() {
  const router = useRouter();
  const addDebt = useLedgerStore((s) => s.addDebt);
  const deleteDebt = useLedgerStore((s) => s.deleteDebt);

  const [contactId, setContactId] = useState<Id | undefined>(undefined);
  const [amountStr, setAmountStr] = useState("");
  const [notes, setNotes] = useState("");

  const amount = Number(amountStr) || 0;
  const canSubmit = contactId && amount > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const debt = addDebt({
      contactId,
      amount,
      notes: notes.trim() || undefined,
    });
    toast.success(`Debt recorded — Rs. ${amount.toLocaleString("en-PK")}`, {
      action: {
        label: "Undo",
        onClick: () => deleteDebt(debt.id),
      },
    });
    router.push("/debt");
  };

  return (
    <>
      <AppHeader
        variant="page"
        title="New debt · Bakaya"
        subtitle="Customer took on credit"
        backHref="/new"
      />
      <MobileShell>
        <div className="space-y-5">
          <FormField label="Customer" sublabel="Kaun sa grahak?">
            <ContactPicker
              value={contactId}
              onChange={setContactId}
              placeholder="Select customer"
            />
          </FormField>

          <AmountInput
            value={amountStr}
            onChange={setAmountStr}
            label="How much do they owe?"
          />

          <FormField label="Notes" sublabel="Optional">
            <BigTextarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. morning purchase, pays on Friday"
            />
          </FormField>

          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="w-full rounded-2xl bg-ink px-5 py-4 text-base font-semibold text-background shadow-[0_14px_30px_-14px_rgba(0,0,0,0.5)] active:scale-95 transition disabled:opacity-40"
          >
            Save debt
          </button>
        </div>
      </MobileShell>
    </>
  );
}
