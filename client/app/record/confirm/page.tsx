"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ShoppingBag,
  UserPlus,
  Check,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { MobileShell } from "@/components/layout/MobileShell";
import { ContactAvatar } from "@/components/shared/ContactAvatar";
import { ContactPicker } from "@/components/forms/ContactPicker";
import { AmountInput } from "@/components/forms/AmountInput";
import { BigInput, BigTextarea, FormField } from "@/components/forms/FormField";
import { formatPKR } from "@/lib/format";
import { useVoiceDraft } from "@/lib/store/voice-draft";
import { useLedgerStore } from "@/lib/store/ledger-store";
import { useContacts } from "@/lib/store/selectors";
import { matchContacts, scoreContact } from "@/lib/fuzzy";
import type { Id, ParsedIntent, PakistanPhone } from "@/lib/types";

/**
 * Voice confirmation screen.
 *
 * Design contract:
 *   - Renders a high-confidence summary of the parsed intent.
 *   - Surfaces the top fuzzy contact match prominently; lets the user swap it.
 *   - Always allows amount + notes override before confirming.
 *   - Confirm → commit to store + toast (with Undo) + navigate to the
 *     category list.
 *   - Back arrow or "Edit transcript" → go back to `/record`.
 *   - "Unknown" intent → push into manual entry flow instead.
 */
export default function ConfirmPage() {
  const router = useRouter();
  const { transcript, payload } = useVoiceDraft();
  const clearDraft = useVoiceDraft((s) => s.clear);
  const contacts = useContacts();

  // If the user refreshed or deep-linked here without a draft, bounce back.
  useEffect(() => {
    if (!payload) router.replace("/record");
  }, [payload, router]);

  if (!payload) return null;

  const intent = payload.intent;

  switch (intent.action) {
    case "add_debt":
      return (
        <AddDebtConfirm
          intent={intent}
          router={router}
          clearDraft={clearDraft}
          transcript={transcript}
        />
      );
    case "add_payable":
      return (
        <AddPayableConfirm
          intent={intent}
          router={router}
          clearDraft={clearDraft}
          transcript={transcript}
        />
      );
    case "add_sale":
      return (
        <AddSaleConfirm
          intent={intent}
          router={router}
          clearDraft={clearDraft}
          transcript={transcript}
        />
      );
    case "settle_debt":
      return (
        <SettleDebtConfirm
          intent={intent}
          router={router}
          clearDraft={clearDraft}
          transcript={transcript}
        />
      );
    case "add_contact":
      return (
        <AddContactConfirm
          intent={intent}
          router={router}
          clearDraft={clearDraft}
          transcript={transcript}
          existingContacts={contacts}
        />
      );
    case "unknown":
    default:
      return (
        <UnknownConfirm
          transcript={transcript}
          reason={
            intent.action === "unknown" ? intent.payload.reason : "Unrecognized"
          }
        />
      );
  }
}

// ─── Subcomponents ─────────────────────────────────────────────────────────

type CommonProps = {
  router: ReturnType<typeof useRouter>;
  clearDraft: () => void;
  transcript: string;
};

function TranscriptBar({ transcript }: { transcript: string }) {
  return (
    <div className="rounded-[18px] bg-sage-soft px-4 py-3 ring-1 ring-black/5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        You said
      </p>
      <p className="mt-0.5 text-sm italic leading-snug">
        &ldquo;{transcript}&rdquo;
      </p>
    </div>
  );
}

function ConfirmFooter({
  onConfirm,
  onEdit,
  primaryLabel = "Confirm",
  disabled,
}: {
  onConfirm: () => void;
  onEdit: () => void;
  primaryLabel?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={onEdit}
        className="flex-1 rounded-2xl bg-white px-5 py-4 text-sm font-semibold ring-1 ring-border active:scale-95 transition"
      >
        <ArrowLeft className="mr-1 inline size-4" /> Back
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={disabled}
        className="flex-[2] rounded-2xl bg-ink px-5 py-4 text-base font-semibold text-background shadow-[0_14px_30px_-14px_rgba(0,0,0,0.5)] active:scale-95 transition disabled:opacity-40"
      >
        <Check className="mr-1 inline size-4" /> {primaryLabel}
      </button>
    </div>
  );
}

/* ------------------------------- add_debt -------------------------------- */
function AddDebtConfirm({
  intent,
  router,
  clearDraft,
  transcript,
}: CommonProps & { intent: Extract<ParsedIntent, { action: "add_debt" }> }) {
  const contacts = useContacts();
  const addDebt = useLedgerStore((s) => s.addDebt);
  const addContact = useLedgerStore((s) => s.addContact);
  const deleteDebt = useLedgerStore((s) => s.deleteDebt);

  const initialMatches = useMemo(
    () => matchContacts(intent.payload.contactName, contacts),
    [intent.payload.contactName, contacts]
  );
  const [contactId, setContactId] = useState<Id | undefined>(
    initialMatches[0]?.contactId
  );
  const [amountStr, setAmountStr] = useState(String(intent.payload.amount));
  const [notes, setNotes] = useState(intent.payload.notes ?? "");
  const amount = Number(amountStr) || 0;

  const matched = contactId ? contacts.find((c) => c.id === contactId) : null;

  const handleCreateContact = () => {
    const c = addContact({
      name: intent.payload.contactName,
      phone: (intent.payload.contactPhone ?? "+92") as PakistanPhone,
    });
    setContactId(c.id);
    toast.success(`Added ${c.name}`);
  };

  const handleConfirm = () => {
    if (!contactId || amount <= 0) return;
    const debt = addDebt({
      contactId,
      amount,
      notes: notes.trim() || undefined,
    });
    toast.success(`Debt saved — ${formatPKR(amount)}`, {
      action: { label: "Undo", onClick: () => deleteDebt(debt.id) },
    });
    clearDraft();
    router.push("/debt");
  };

  return (
    <>
      <AppHeader
        variant="page"
        title="Confirm debt"
        urduTitle="بقایا کی تصدیق"
        subtitle="Bakaya ki tafseelat check karen"
        backHref="/record"
      />
      <MobileShell>
        <div className="space-y-5">
          <TranscriptBar transcript={transcript} />

          <div className="rounded-[24px] bg-hero p-5 text-hero-foreground shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
              <ArrowDownLeft className="size-4" /> New debt · Bakaya
            </div>
            <p className="mt-1 tabular text-4xl font-bold">
              {formatPKR(amount)}
            </p>
          </div>

          <FormField label="Customer">
            {matched ? (
              <div className="flex items-center gap-3 rounded-2xl bg-white p-3.5 ring-1 ring-border shadow-sm">
                <ContactAvatar name={matched.name} />
                <div className="flex-1 leading-tight min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {matched.name}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {matched.phone}
                  </p>
                </div>
                {initialMatches[0] ? (
                  <span className="rounded-full bg-money-in-bg px-2 py-0.5 text-[10px] font-semibold text-money-in">
                    {Math.round(initialMatches[0].similarity * 100)}% match
                  </span>
                ) : null}
              </div>
            ) : null}
            <div className="mt-2">
              <ContactPicker value={contactId} onChange={setContactId} />
            </div>
            {!matched ? (
              <button
                type="button"
                onClick={handleCreateContact}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-sage-soft px-4 py-3 text-sm font-semibold ring-1 ring-black/5 active:scale-[0.99] transition"
              >
                <UserPlus className="size-4" />
                Create &ldquo;{intent.payload.contactName}&rdquo;
              </button>
            ) : null}
          </FormField>

          <AmountInput
            value={amountStr}
            onChange={setAmountStr}
            label="Amount"
          />

          <FormField label="Notes" sublabel="Optional">
            <BigTextarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </FormField>

          <ConfirmFooter
            onConfirm={handleConfirm}
            onEdit={() => router.push("/record")}
            disabled={!contactId || amount <= 0}
          />
        </div>
      </MobileShell>
    </>
  );
}

/* ----------------------------- add_payable ------------------------------- */
function AddPayableConfirm({
  intent,
  router,
  clearDraft,
  transcript,
}: CommonProps & { intent: Extract<ParsedIntent, { action: "add_payable" }> }) {
  const addPayable = useLedgerStore((s) => s.addPayable);
  const deletePayable = useLedgerStore((s) => s.deletePayable);
  const [wholesaler, setWholesaler] = useState(intent.payload.wholesalerName);
  const [amountStr, setAmountStr] = useState(String(intent.payload.amount));
  const [notes, setNotes] = useState(intent.payload.notes ?? "");
  const amount = Number(amountStr) || 0;

  const handleConfirm = () => {
    if (!wholesaler.trim() || amount <= 0) return;
    const p = addPayable({
      wholesalerName: wholesaler.trim(),
      amount,
      notes: notes.trim() || undefined,
    });
    toast.success(`Payable saved — ${formatPKR(amount)}`, {
      action: { label: "Undo", onClick: () => deletePayable(p.id) },
    });
    clearDraft();
    router.push("/payables");
  };

  return (
    <>
      <AppHeader
        variant="page"
        title="Confirm payable"
        urduTitle="دین کی تصدیق"
        subtitle="Supplier se kharida"
        backHref="/record"
      />
      <MobileShell>
        <div className="space-y-5">
          <TranscriptBar transcript={transcript} />

          <div className="rounded-[24px] bg-hero p-5 text-hero-foreground shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
              <ArrowUpRight className="size-4" /> New payable · Denay
            </div>
            <p className="mt-1 tabular text-4xl font-bold">{formatPKR(amount)}</p>
          </div>

          <FormField label="Wholesaler">
            <BigInput
              value={wholesaler}
              onChange={(e) => setWholesaler(e.target.value)}
            />
          </FormField>

          <AmountInput
            value={amountStr}
            onChange={setAmountStr}
            label="Amount"
          />

          <FormField label="Notes" sublabel="Optional">
            <BigTextarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </FormField>

          <ConfirmFooter
            onConfirm={handleConfirm}
            onEdit={() => router.push("/record")}
            disabled={!wholesaler.trim() || amount <= 0}
          />
        </div>
      </MobileShell>
    </>
  );
}

/* ------------------------------- add_sale -------------------------------- */
function AddSaleConfirm({
  intent,
  router,
  clearDraft,
  transcript,
}: CommonProps & { intent: Extract<ParsedIntent, { action: "add_sale" }> }) {
  const addSale = useLedgerStore((s) => s.addSale);
  const deleteSale = useLedgerStore((s) => s.deleteSale);
  const contacts = useContacts();
  const initialMatch = intent.payload.customerName
    ? matchContacts(intent.payload.customerName, contacts)[0]
    : undefined;

  const [customerId, setCustomerId] = useState<Id | undefined>(
    initialMatch?.contactId
  );
  const [amountStr, setAmountStr] = useState(String(intent.payload.total));
  const [notes, setNotes] = useState(intent.payload.notes ?? "");
  const amount = Number(amountStr) || 0;

  const handleConfirm = () => {
    if (amount <= 0) return;
    const items = intent.payload.items.map((it) => ({
      ...it,
      unitPrice: it.unitPrice || Math.round(amount / Math.max(it.quantity, 1)),
      lineTotal:
        it.lineTotal ||
        (it.unitPrice || Math.round(amount / Math.max(it.quantity, 1))) *
          it.quantity,
    }));
    const sale = addSale({
      customerContactId: customerId,
      items,
      total: amount,
      notes: notes.trim() || undefined,
    });
    toast.success(`Sale saved — ${formatPKR(amount)}`, {
      action: { label: "Undo", onClick: () => deleteSale(sale.id) },
    });
    clearDraft();
    router.push("/sales");
  };

  return (
    <>
      <AppHeader
        variant="page"
        title="Confirm sale"
        urduTitle="بکری کی تصدیق"
        subtitle="Cash bikri"
        backHref="/record"
      />
      <MobileShell>
        <div className="space-y-5">
          <TranscriptBar transcript={transcript} />

          <div className="rounded-[24px] bg-hero p-5 text-hero-foreground shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
              <ShoppingBag className="size-4" /> New sale · Bikri
            </div>
            <p className="mt-1 tabular text-4xl font-bold">{formatPKR(amount)}</p>
            {intent.payload.items.length ? (
              <p className="mt-1 text-xs opacity-80">
                {intent.payload.items
                  .map((i) => `${i.quantity} × ${i.name}`)
                  .join(", ")}
              </p>
            ) : null}
          </div>

          <FormField label="Customer" sublabel="Optional">
            <ContactPicker
              value={customerId}
              onChange={setCustomerId}
              allowClear
              placeholder="Walk-in cash"
            />
          </FormField>

          <AmountInput
            value={amountStr}
            onChange={setAmountStr}
            label="Total"
          />

          <FormField label="Notes" sublabel="Optional">
            <BigTextarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </FormField>

          <ConfirmFooter
            onConfirm={handleConfirm}
            onEdit={() => router.push("/record")}
            disabled={amount <= 0}
          />
        </div>
      </MobileShell>
    </>
  );
}

/* ----------------------------- settle_debt ------------------------------- */
function SettleDebtConfirm({
  intent,
  router,
  clearDraft,
  transcript,
}: CommonProps & { intent: Extract<ParsedIntent, { action: "settle_debt" }> }) {
  const contacts = useContacts();
  const debts = useLedgerStore((s) => s.debts);
  const setDebtSettled = useLedgerStore((s) => s.setDebtSettled);

  const matches = useMemo(
    () =>
      contacts
        .map((c) => ({
          c,
          s: scoreContact(intent.payload.contactName, c.name),
        }))
        .filter((x) => x.s > 0.3)
        .sort((a, b) => b.s - a.s),
    [contacts, intent.payload.contactName]
  );
  const [contactId, setContactId] = useState<Id | undefined>(
    matches[0]?.c.id
  );

  const openDebts = useMemo(
    () =>
      contactId ? debts.filter((d) => d.contactId === contactId && !d.settled) : [],
    [debts, contactId]
  );

  const handleConfirmAll = () => {
    if (!openDebts.length) return;
    for (const d of openDebts) setDebtSettled(d.id, true);
    toast.success(`Settled ${openDebts.length} debt${openDebts.length === 1 ? "" : "s"}`);
    clearDraft();
    router.push("/debt");
  };

  return (
    <>
      <AppHeader
        variant="page"
        title="Settle debt"
        urduTitle="بقایا ادا"
        subtitle="Bakaya clear"
        backHref="/record"
      />
      <MobileShell>
        <div className="space-y-5">
          <TranscriptBar transcript={transcript} />
          <FormField label="Customer">
            <ContactPicker value={contactId} onChange={setContactId} />
          </FormField>
          <div className="rounded-[22px] bg-white p-4 ring-1 ring-border shadow-sm">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Open debts
            </p>
            {openDebts.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                No open debts for this contact.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-border">
                {openDebts.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between py-2 text-sm"
                  >
                    <span className="text-muted-foreground">
                      {new Date(d.date).toLocaleDateString("en-GB")}
                    </span>
                    <span className="tabular font-semibold">
                      {formatPKR(d.amount)}
                    </span>
                  </li>
                ))}
                <li className="flex items-center justify-between pt-2 text-sm">
                  <span className="font-semibold">Total</span>
                  <span className="tabular font-bold">
                    {formatPKR(
                      openDebts.reduce((s, d) => s + d.amount, 0)
                    )}
                  </span>
                </li>
              </ul>
            )}
          </div>
          <ConfirmFooter
            onConfirm={handleConfirmAll}
            onEdit={() => router.push("/record")}
            primaryLabel="Settle all"
            disabled={openDebts.length === 0}
          />
        </div>
      </MobileShell>
    </>
  );
}

/* ----------------------------- add_contact ------------------------------- */
function AddContactConfirm({
  intent,
  router,
  clearDraft,
  transcript,
  existingContacts,
}: CommonProps & {
  intent: Extract<ParsedIntent, { action: "add_contact" }>;
  existingContacts: ReturnType<typeof useContacts>;
}) {
  const addContact = useLedgerStore((s) => s.addContact);
  const deleteContact = useLedgerStore((s) => s.deleteContact);
  const [name, setName] = useState(intent.payload.name);
  const [phone, setPhone] = useState(
    intent.payload.phone ?? "+92"
  );

  const duplicates = useMemo(
    () => matchContacts(name, existingContacts, { threshold: 0.7 }),
    [name, existingContacts]
  );

  const handleConfirm = () => {
    if (!name.trim()) return;
    const c = addContact({
      name: name.trim(),
      phone: phone.trim() as PakistanPhone,
    });
    toast.success(`Added ${c.name}`, {
      action: { label: "Undo", onClick: () => deleteContact(c.id) },
    });
    clearDraft();
    router.push(`/contacts/${c.id}`);
  };

  return (
    <>
      <AppHeader
        variant="page"
        title="New contact"
        urduTitle="نیا رابطہ"
        subtitle="Nay customer"
        backHref="/record"
      />
      <MobileShell>
        <div className="space-y-5">
          <TranscriptBar transcript={transcript} />

          {duplicates.length > 0 ? (
            <div className="rounded-[20px] bg-pending-bg p-3.5 ring-1 ring-pending/20">
              <p className="text-xs font-semibold text-pending">
                Similar contact exists
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {duplicates
                  .slice(0, 2)
                  .map((d) => d.name)
                  .join(", ")}
              </p>
            </div>
          ) : null}

          <FormField label="Name">
            <BigInput value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField label="Phone">
            <BigInput
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </FormField>
          <ConfirmFooter
            onConfirm={handleConfirm}
            onEdit={() => router.push("/record")}
            disabled={!name.trim()}
          />
        </div>
      </MobileShell>
    </>
  );
}

/* ------------------------------- unknown --------------------------------- */
function UnknownConfirm({
  transcript,
  reason,
}: {
  transcript: string;
  reason: string;
}) {
  return (
    <>
      <AppHeader
        variant="page"
        title="Couldn't understand"
        urduTitle="سمجھ نہیں آیا"
        backHref="/record"
      />
      <MobileShell>
        <div className="flex flex-1 flex-col items-center gap-5 pt-6 pb-24 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-pending-bg text-pending">
            <AlertCircle className="size-7" />
          </span>
          <div>
            <p className="text-base font-semibold">Let&apos;s try that again</p>
            <p className="mt-1 max-w-[22rem] text-sm text-muted-foreground">
              {reason}. You can re-record or add it manually.
            </p>
          </div>
          <div className="w-full max-w-[22rem] rounded-[18px] bg-sage-soft px-4 py-3 text-left ring-1 ring-black/5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              You said
            </p>
            <p className="mt-0.5 text-sm italic leading-snug">
              &ldquo;{transcript}&rdquo;
            </p>
          </div>
          <div className="flex w-full max-w-[22rem] flex-col gap-2">
            <a
              href="/record"
              className="rounded-2xl bg-ink px-5 py-3 text-sm font-semibold text-background active:scale-95 transition"
            >
              Try again
            </a>
            <a
              href="/new"
              className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold ring-1 ring-border active:scale-95 transition"
            >
              Add manually
            </a>
          </div>
        </div>
      </MobileShell>
    </>
  );
}
