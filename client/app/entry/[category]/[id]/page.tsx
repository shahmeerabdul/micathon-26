"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Check, Phone, MessageCircle } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { MobileShell } from "@/components/layout/MobileShell";
import { Amount } from "@/components/money/Amount";
import { ContactAvatar } from "@/components/shared/ContactAvatar";
import { useLedgerStore } from "@/lib/store/ledger-store";
import { useContact } from "@/lib/store/selectors";
import { formatPKR, timeAgo, CATEGORY_LABELS } from "@/lib/format";
import type { LedgerCategory } from "@/lib/types";

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
        <AppHeader variant="page" title="Not found" backHref="/" />
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

  return (
    <>
      <AppHeader
        variant="page"
        title={label.en}
        subtitle={label.ur}
        backHref={label.href}
      />
      <MobileShell>
        <div className="space-y-5">
          {/* Hero amount card */}
          <div className="rounded-[28px] bg-white p-6 ring-1 ring-border shadow-[0_14px_40px_-20px_rgba(0,0,0,0.2)]">
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
          </div>

          {/* Contact (debt / sale) */}
          {contact ? (
            <a
              href={`/contacts/${contact.id}`}
              className="flex items-center gap-3 rounded-[22px] bg-white p-3.5 ring-1 ring-border shadow-sm active:scale-[0.99] transition"
            >
              <ContactAvatar name={contact.name} />
              <div className="flex-1 leading-tight min-w-0">
                <p className="truncate text-sm font-semibold">{contact.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {contact.phone}
                </p>
              </div>
              <div className="flex gap-2">
                <a
                  href={`tel:${contact.phone}`}
                  aria-label="Call"
                  className="flex size-9 items-center justify-center rounded-full bg-sage-soft"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Phone className="size-4" />
                </a>
                <a
                  href={`https://wa.me/${contact.phone.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="WhatsApp"
                  className="flex size-9 items-center justify-center rounded-full bg-[#25D366] text-white"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MessageCircle className="size-4" />
                </a>
              </div>
            </a>
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
