"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Check, Phone, MessageCircle, Pencil, X } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { MobileShell } from "@/components/layout/MobileShell";
import { Amount } from "@/components/money/Amount";
import { ContactAvatar } from "@/components/shared/ContactAvatar";
import { AmountInput } from "@/components/forms/AmountInput";
import { BigInput, BigTextarea, FormField } from "@/components/forms/FormField";
import { useLedgerStore } from "@/lib/store/ledger-store";
import { useContact } from "@/lib/store/selectors";
import { formatPKR, timeAgo, CATEGORY_LABELS } from "@/lib/format";
import type { LedgerCategory, RupeeAmount } from "@/lib/types";

type Params = { category: string; id: string };

export default function EntryDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { category, id } = use(params);
  const validCategory = ["debt", "payable", "sale"].includes(category)
    ? (category as LedgerCategory)
    : null;

  if (!validCategory) {
    return (
      <>
        <AppHeader
          variant="page"
          title="Not found"
          urduTitle="نہیں ملا"
          backHref="/"
        />
        <MobileShell>
          <p className="text-sm text-muted-foreground">Unknown category.</p>
        </MobileShell>
      </>
    );
  }

  return <EntryDetail category={validCategory} id={id} />;
}

function EntryDetail({
  category,
  id,
}: {
  category: LedgerCategory;
  id: string;
}) {
  const router = useRouter();
  const label = CATEGORY_LABELS[category];

  const debt = useLedgerStore((s) =>
    category === "debt" ? s.debts.find((d) => d.id === id) : undefined
  );
  const payable = useLedgerStore((s) =>
    category === "payable" ? s.payables.find((p) => p.id === id) : undefined
  );
  const sale = useLedgerStore((s) =>
    category === "sale" ? s.sales.find((x) => x.id === id) : undefined
  );
  const setDebtSettled = useLedgerStore((s) => s.setDebtSettled);
  const setPayablePaid = useLedgerStore((s) => s.setPayablePaid);
  const deleteDebt = useLedgerStore((s) => s.deleteDebt);
  const deletePayable = useLedgerStore((s) => s.deletePayable);
  const deleteSale = useLedgerStore((s) => s.deleteSale);
  const updateDebt = useLedgerStore((s) => s.updateDebt);
  const updatePayable = useLedgerStore((s) => s.updatePayable);
  const updateSale = useLedgerStore((s) => s.updateSale);

  // Edit-mode local form state. Seeded lazily from the entry when the
  // user taps "Edit" so opening the sheet always reflects the latest
  // canonical values.
  const [isEditing, setIsEditing] = useState(false);
  const [editAmount, setEditAmount] = useState("");
  const [editWholesaler, setEditWholesaler] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const contact = useContact(
    debt?.contactId ?? sale?.customerContactId ?? undefined
  );

  const entry = debt ?? payable ?? sale;
  if (!entry) {
    return (
      <>
        <AppHeader
          variant="page"
          title={label.en}
          urduTitle={label.urduScript}
          backHref={label.href}
        />
        <MobileShell>
          <div className="rounded-[24px] bg-white/80 p-6 text-center ring-1 ring-black/5">
            <p className="text-sm text-muted-foreground">
              Entry not found or has been deleted.
            </p>
          </div>
        </MobileShell>
      </>
    );
  }

  const amount =
    category === "debt"
      ? debt!.amount
      : category === "payable"
        ? payable!.amount
        : sale!.total;
  const tone =
    category === "sale" ? "in" : category === "payable" ? "out" : "pending";

  const handleDelete = () => {
    if (category === "debt") deleteDebt(id);
    else if (category === "payable") deletePayable(id);
    else deleteSale(id);
    toast.success("Deleted");
    router.push(label.href);
  };

  const handleToggleStatus = () => {
    if (category === "debt" && debt) {
      setDebtSettled(debt.id, !debt.settled);
      toast.success(debt.settled ? "Marked as open" : "Marked as settled");
    } else if (category === "payable" && payable) {
      setPayablePaid(payable.id, !payable.paid);
      toast.success(payable.paid ? "Marked as unpaid" : "Marked as paid");
    }
  };

  const openEditor = () => {
    setEditAmount(String(amount));
    setEditWholesaler(payable?.wholesalerName ?? "");
    setEditNotes(entry.notes ?? "");
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    const nextAmount = Number(editAmount);
    if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
      toast.error("Amount must be greater than zero.");
      return;
    }
    const notes = editNotes.trim() || undefined;

    if (category === "debt" && debt) {
      updateDebt({
        ...debt,
        amount: nextAmount as RupeeAmount,
        notes,
      });
    } else if (category === "payable" && payable) {
      const name = editWholesaler.trim();
      if (!name) {
        toast.error("Wholesaler name is required.");
        return;
      }
      updatePayable({
        ...payable,
        wholesalerName: name,
        amount: nextAmount as RupeeAmount,
        notes,
      });
    } else if (category === "sale" && sale) {
      updateSale({
        ...sale,
        total: nextAmount as RupeeAmount,
        notes,
      });
    }
    toast.success("Saved changes");
    setIsEditing(false);
  };

  return (
    <>
      <AppHeader
        variant="page"
        title={label.en}
        urduTitle={label.urduScript}
        subtitle={label.ur}
        backHref={label.href}
      />
      <MobileShell>
        <div className="space-y-5">
          {/* Hero amount card */}
          <div className="relative rounded-[28px] bg-white p-6 ring-1 ring-border shadow-[0_14px_40px_-20px_rgba(0,0,0,0.2)]">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {label.en} · {label.ur}
            </p>
            <div className="mt-1">
              <Amount value={amount} tone={tone} size="hero" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {timeAgo(entry.date)} · {new Date(entry.date).toLocaleString("en-GB")}
            </p>
            {(category === "debt" && debt?.settled) ||
            (category === "payable" && payable?.paid) ? (
              <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-money-in-bg px-3 py-1 text-xs font-semibold text-money-in">
                <Check className="size-3.5" /> Settled
              </span>
            ) : null}
            {!isEditing ? (
              <button
                type="button"
                onClick={openEditor}
                aria-label="Edit entry"
                className="absolute top-4 right-4 inline-flex items-center gap-1 rounded-full bg-sage-soft px-3 py-1.5 text-xs font-semibold ring-1 ring-black/5 active:scale-95 transition"
              >
                <Pencil className="size-3.5" />
                Edit
              </button>
            ) : null}
          </div>

          {/* Edit form */}
          {isEditing ? (
            <div className="rounded-[22px] bg-white p-4 ring-1 ring-border shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Edit {label.en.toLowerCase()}
                </p>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  aria-label="Cancel edit"
                  className="flex size-7 items-center justify-center rounded-full bg-sage-soft ring-1 ring-black/5"
                >
                  <X className="size-3.5" />
                </button>
              </div>

              <AmountInput
                value={editAmount}
                onChange={setEditAmount}
                label={category === "sale" ? "Sale total" : "Amount"}
              />

              {category === "payable" ? (
                <FormField label="Wholesaler" sublabel="Kis ka hisaab?">
                  <BigInput
                    value={editWholesaler}
                    onChange={(e) => setEditWholesaler(e.target.value)}
                    placeholder="e.g. Bilal Wholesale"
                  />
                </FormField>
              ) : null}

              <FormField label="Notes" sublabel="Optional">
                <BigTextarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Any details about this entry"
                />
              </FormField>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="flex-1 rounded-2xl bg-white px-5 py-3 text-sm font-semibold ring-1 ring-border active:scale-95 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  className="flex-[2] rounded-2xl bg-ink px-5 py-3 text-sm font-semibold text-background shadow-[0_10px_26px_-14px_rgba(0,0,0,0.5)] active:scale-95 transition"
                >
                  Save changes
                </button>
              </div>
            </div>
          ) : null}

          {/* Contact (debt / sale)
              NOTE: the outer element must be a <div> — nesting real
              anchors (call / whatsapp) inside a single wrapping <a>
              produces invalid HTML and trips React's hydration check.
              Only the avatar + name area is the "go to contact" link. */}
          {contact ? (
            <div className="flex items-center gap-3 rounded-[22px] bg-white p-3.5 ring-1 ring-border shadow-sm">
              <Link
                href={`/contacts/${contact.id}`}
                className="flex flex-1 items-center gap-3 min-w-0 active:scale-[0.99] transition"
              >
                <ContactAvatar name={contact.name} />
                <div className="flex-1 leading-tight min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {contact.name}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {contact.phone}
                  </p>
                </div>
              </Link>
              <div className="flex gap-2">
                {contact.phone ? (
                  <>
                    <a
                      href={`tel:${contact.phone}`}
                      aria-label="Call"
                      className="flex size-9 items-center justify-center rounded-full bg-sage-soft"
                    >
                      <Phone className="size-4" />
                    </a>
                    <a
                      href={`https://wa.me/${contact.phone.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="WhatsApp"
                      className="flex size-9 items-center justify-center rounded-full bg-[#25D366] text-white"
                    >
                      <MessageCircle className="size-4" />
                    </a>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Wholesaler (payable) */}
          {category === "payable" && payable ? (
            <div className="rounded-[22px] bg-white p-3.5 ring-1 ring-border shadow-sm">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Wholesaler
              </p>
              <p className="mt-1 text-sm font-semibold">
                {payable.wholesalerName}
              </p>
            </div>
          ) : null}

          {/* Sale items */}
          {category === "sale" && sale && sale.items.length > 0 ? (
            <div className="rounded-[22px] bg-white p-4 ring-1 ring-border shadow-sm">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                Items ({sale.items.length})
              </p>
              <ul className="divide-y divide-border">
                {sale.items.map((it, i) => (
                  <li
                    key={i}
                    className="flex items-baseline justify-between py-2 text-sm"
                  >
                    <span>
                      {it.name}
                      <span className="ml-1 text-muted-foreground">
                        × {it.quantity}
                      </span>
                    </span>
                    <span className="tabular font-semibold">
                      {formatPKR(it.lineTotal)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Notes */}
          {entry.notes ? (
            <div className="rounded-[22px] bg-white p-4 ring-1 ring-border shadow-sm">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Notes
              </p>
              <p className="mt-1 text-sm">{entry.notes}</p>
            </div>
          ) : null}

          {/* Actions */}
          <div className="space-y-2">
            {category !== "sale" ? (
              <button
                type="button"
                onClick={handleToggleStatus}
                className="w-full rounded-2xl bg-money-in px-5 py-4 text-base font-semibold text-white active:scale-95 transition"
              >
                {category === "debt"
                  ? debt?.settled
                    ? "Mark as open"
                    : "Mark as settled"
                  : payable?.paid
                    ? "Mark as unpaid"
                    : "Mark as paid"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleDelete}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 py-4 text-base font-semibold text-money-out ring-1 ring-money-out/30 active:scale-95 transition"
            >
              <Trash2 className="size-4" />
              Delete
            </button>
          </div>
        </div>
      </MobileShell>
    </>
  );
}
