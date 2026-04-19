"use client";

import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Phone,
  MessageCircle,
  Plus,
  Trash2,
  Check,
  Clock,
  ArrowDownLeft,
} from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { MobileShell } from "@/components/layout/MobileShell";
import { ContactAvatar } from "@/components/shared/ContactAvatar";
import { Amount } from "@/components/money/Amount";
import {
  useContact,
  useDebtsForContact,
  useContactOutstanding,
} from "@/lib/store/selectors";
import { useLedgerStore } from "@/lib/store/ledger-store";
import { formatPKR, timeAgo } from "@/lib/format";

export default function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const contact = useContact(id);
  const debts = useDebtsForContact(id);
  const outstanding = useContactOutstanding(id);
  const deleteContact = useLedgerStore((s) => s.deleteContact);
  const setDebtSettled = useLedgerStore((s) => s.setDebtSettled);

  if (!contact) {
    return (
      <>
        <AppHeader
          variant="page"
          title="Contact"
          urduTitle="رابطہ"
          backHref="/contacts"
        />
        <MobileShell>
          <div className="rounded-[24px] bg-white/80 p-6 text-center ring-1 ring-black/5">
            <p className="text-sm text-muted-foreground">
              Contact not found.
            </p>
          </div>
        </MobileShell>
      </>
    );
  }

  const waPhone = contact.phone.replace(/\D/g, "");
  const waMessage = encodeURIComponent(
    outstanding > 0
      ? `Assalam-o-Alaikum ${contact.name}. Kindly clear your balance of Rs. ${outstanding.toLocaleString(
          "en-PK"
        )}. Shukriya.`
      : `Assalam-o-Alaikum ${contact.name}.`
  );

  const handleDelete = async () => {
    if (debts.length > 0) {
      toast.error("Clear their debts before deleting contact");
      return;
    }
    try {
      if (
        contact.mongoCustomerId ||
        contact.phone?.replace(/\D/g, "").length >= 12
      ) {
        const res = await fetch("/api/customers/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mongoCustomerId: contact.mongoCustomerId,
            whatsappNumber: contact.mongoCustomerId ? undefined : contact.phone,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (!res.ok || !json.ok) {
          toast.error(json.error ?? "Could not remove cloud copy");
          return;
        }
      }
    } catch {
      toast.error("Could not remove cloud copy");
      return;
    }
    deleteContact(id);
    toast.success("Contact deleted");
    router.push("/contacts");
  };

  return (
    <>
      <AppHeader variant="page" title={contact.name} backHref="/contacts" />
      <MobileShell>
        <div className="space-y-5">
          {/* Profile + outstanding */}
          <div className="rounded-[28px] bg-white p-5 ring-1 ring-border shadow-[0_14px_40px_-20px_rgba(0,0,0,0.2)]">
            <div className="flex items-center gap-3">
              <ContactAvatar name={contact.name} size="lg" />
              <div className="flex-1 leading-tight">
                <p className="text-base font-bold">{contact.name}</p>
                <p className="text-xs text-muted-foreground">{contact.phone}</p>
              </div>
            </div>

            <div className="mt-5 flex items-end justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Outstanding
                </p>
                <Amount
                  value={outstanding}
                  tone={outstanding > 0 ? "pending" : "in"}
                  size="xl"
                />
              </div>
              <Link
                href="/new/debt"
                className="flex items-center gap-1 rounded-full bg-ink px-3 py-2 text-xs font-semibold text-background active:scale-95 transition"
              >
                <Plus className="size-3.5" />
                Add debt
              </Link>
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex gap-2">
            <a
              href={`tel:${contact.phone}`}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold ring-1 ring-border shadow-sm active:scale-95 transition"
            >
              <Phone className="size-4" />
              Call
            </a>
            <a
              href={`https://wa.me/${waPhone}?text=${waMessage}`}
              target="_blank"
              rel="noreferrer"
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-4 py-3 text-sm font-semibold text-white shadow-sm active:scale-95 transition"
            >
              <MessageCircle className="size-4" />
              WhatsApp
            </a>
          </div>

          {/* Debt timeline */}
          <div>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Debt history
            </h2>
            {debts.length === 0 ? (
              <div className="rounded-[22px] bg-white/80 p-6 text-center ring-1 ring-black/5">
                <p className="text-sm text-muted-foreground">
                  No debts for this customer yet.
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {debts.map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/entry/debt/${d.id}`}
                      className="flex items-center gap-3 rounded-[22px] bg-white p-3.5 ring-1 ring-black/5 shadow-sm active:scale-[0.99] transition"
                    >
                      <span
                        className={
                          "flex size-11 items-center justify-center rounded-full " +
                          (d.settled
                            ? "bg-money-in-bg text-money-in"
                            : "bg-pending-bg text-pending")
                        }
                      >
                        {d.settled ? (
                          <Check className="size-5" />
                        ) : (
                          <ArrowDownLeft className="size-5" />
                        )}
                      </span>
                      <div className="flex-1 leading-tight min-w-0">
                        <p className="text-sm font-semibold">
                          {formatPKR(d.amount)}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {timeAgo(d.date)}
                          {d.notes ? ` · ${d.notes}` : ""}
                        </p>
                      </div>
                      {!d.settled ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            setDebtSettled(d.id, true);
                            toast.success("Marked as settled");
                          }}
                          className="flex size-8 items-center justify-center rounded-full bg-money-in text-white"
                          aria-label="Mark settled"
                        >
                          <Check className="size-4" />
                        </button>
                      ) : (
                        <Clock className="size-4 text-muted-foreground" />
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            type="button"
            onClick={handleDelete}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 py-4 text-base font-semibold text-money-out ring-1 ring-money-out/30 active:scale-95 transition"
          >
            <Trash2 className="size-4" />
            Delete contact
          </button>
        </div>
      </MobileShell>
    </>
  );
}
