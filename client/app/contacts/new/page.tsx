"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { MobileShell } from "@/components/layout/MobileShell";
import { BigInput, FormField } from "@/components/forms/FormField";
import { useLedgerStore } from "@/lib/store/ledger-store";
import type { PakistanPhone } from "@/lib/types";

export default function NewContactPage() {
  const router = useRouter();
  const addContact = useLedgerStore((s) => s.addContact);
  const deleteContact = useLedgerStore((s) => s.deleteContact);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+92");

  const canSubmit = name.trim().length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const created = addContact({
      name: name.trim(),
      phone: phone.trim() as PakistanPhone,
    });
    toast.success(`Contact added — ${created.name}`, {
      action: {
        label: "Undo",
        onClick: () => deleteContact(created.id),
      },
    });
    router.push(`/contacts/${created.id}`);
  };

  return (
    <>
      <AppHeader
        variant="page"
        title="New contact"
        subtitle="Nay customer"
        backHref="/contacts"
      />
      <MobileShell>
        <div className="space-y-5">
          <FormField label="Name" sublabel="Customer ka naam">
            <BigInput
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ahmed Khan"
            />
          </FormField>

          <FormField label="Phone" sublabel="Pakistan mobile">
            <BigInput
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+923001234567"
            />
          </FormField>

          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="w-full rounded-2xl bg-ink px-5 py-4 text-base font-semibold text-background shadow-[0_14px_30px_-14px_rgba(0,0,0,0.5)] active:scale-95 transition disabled:opacity-40"
          >
            Save contact
          </button>
        </div>
      </MobileShell>
    </>
  );
}
