"use client";

/**
 * /record/receipt — post-action confirmation.
 *
 * Visuals are tuned per-action via ActionHero so the shopkeeper can see
 * at a glance what happened:
 *   - purchase (debt)     → warm yellow/amber hero + items card
 *   - purchase (cash)     → soft cream hero + items card
 *   - payment             → green money-in hero
 *   - new_customer        → lilac welcome hero + phone card
 *   - query_bills         → slate ledger hero + bills list with bars
 *
 * A small WhatsApp badge below the hero tells the owner whether a
 * Twilio message was successfully sent.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  RotateCcw,
  Sparkles,
  UserCircle2,
  MessageCircle,
  ReceiptText,
  Phone,
  Wallet,
  TrendingDown,
  TrendingUp,
  ShoppingBag,
  CheckCircle2,
} from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { MobileShell } from "@/components/layout/MobileShell";
import { ContactAvatar } from "@/components/shared/ContactAvatar";
import { ActionHero, type HeroAction } from "@/components/shared/ActionHero";
import { useVoiceReceipt } from "@/lib/store/voice-receipt";
import { undoVoicePurchase } from "@/lib/actions";
import { formatPKR } from "@/lib/format";
import { useLedgerStore } from "@/lib/store/ledger-store";
import {
  useContactOutstanding,
  useContactTotalSpent,
  useLocalContactByName,
} from "@/lib/store/selectors";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function resolveHeroAction(
  action: string,
  kind: string | undefined,
): HeroAction {
  if (action === "new_customer") return "new_customer";
  if (action === "query_bills") return "query_bills";
  if (action === "payment") return "payment";
  if (action === "supplier_payment") return "supplier_payment";
  if (action === "supplier_credit") return "supplier_credit";
  if (action === "cash_sale") return "cash_sale";
  if (kind === "cash") return "purchase_cash";
  return "purchase_debt";
}

function headerTitle(action: string): string {
  switch (action) {
    case "new_customer":
      return "Customer added";
    case "query_bills":
      return "Bills summary";
    case "payment":
      return "Payment saved";
    case "supplier_payment":
      return "Supplier paid";
    case "supplier_credit":
      return "Added to payable";
    case "cash_sale":
      return "Sales logged";
    default:
      return "Saved";
  }
}

function headerUrduTitle(action: string): string {
  switch (action) {
    case "new_customer":
      return "نیا گاہک";
    case "query_bills":
      return "حساب";
    case "payment":
      return "ادائیگی";
    case "supplier_payment":
      return "دکاندار کی ادائیگی";
    case "supplier_credit":
      return "نیا ادھار";
    case "cash_sale":
      return "بکری";
    default:
      return "محفوظ";
  }
}

/* -------------------------------------------------------------------------- */
/*  Small UI pieces                                                           */
/* -------------------------------------------------------------------------- */

function MessagingBadge({
  messaging,
}: {
  messaging: {
    attempted: boolean;
    sent: boolean;
    kind?: string;
    skippedReason?: string;
  };
}) {
  // Only surface the positive "sent" state. The skipped/failed states are
  // misleading for locally-stored contacts whose numbers don't exist in
  // MongoDB yet, so we hide them entirely rather than confuse the user.
  if (!messaging.sent) return null;

  const label =
    messaging.kind === "welcome"
      ? "Welcome message sent on WhatsApp"
      : messaging.kind === "receipt"
        ? "Receipt sent on WhatsApp"
        : "Bills summary sent on WhatsApp";

  return (
    <div className="flex items-center gap-2 rounded-2xl bg-money-in-bg px-3 py-2 text-xs font-medium text-money-in ring-1 ring-black/5">
      <MessageCircle className="size-4 shrink-0" />
      <span className="leading-snug">{label}</span>
    </div>
  );
}

function StatTile({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  tone: "debt" | "cash" | "neutral";
  icon: typeof Wallet;
}) {
  const toneClasses =
    tone === "debt"
      ? "bg-money-out-bg text-money-out"
      : tone === "cash"
        ? "bg-money-in-bg text-money-in"
        : "bg-sage-soft text-foreground";
  return (
    <div className={`rounded-2xl ${toneClasses} px-3 py-3 ring-1 ring-black/5`}>
      <div className="flex items-center gap-1.5 opacity-80">
        <Icon className="size-3.5" />
        <p className="text-[10px] uppercase tracking-wider">{label}</p>
      </div>
      <p className="tabular mt-1 text-base font-bold">{value}</p>
    </div>
  );
}

function SupplierPaymentCard({
  supplierName,
  amount,
}: {
  supplierName: string;
  amount: number;
}) {
  // Pull live payables so the "still owed" math reflects the mirror step
  // that already ran — no double-counting.
  const payables = useLedgerStore((s) => s.payables);
  const key = supplierName.trim().toLowerCase();
  const matches = payables.filter((p) => {
    const name = p.wholesalerName.trim().toLowerCase();
    return name === key || name.includes(key) || key.includes(name);
  });
  const stillOwed = matches
    .filter((p) => !p.paid)
    .reduce((sum, p) => sum + p.amount, 0);
  const matched = matches.length > 0;

  return (
    <div className="rounded-[22px] bg-white p-4 ring-1 ring-border shadow-sm">
      <div className="flex items-center gap-3">
        <ContactAvatar name={supplierName} size="lg" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-base font-bold">{supplierName}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {matched ? "Wholesaler · Denay" : "New supplier"}
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            matched
              ? "bg-money-out-bg text-money-out"
              : "bg-pending-bg text-pending"
          }`}
        >
          {matched ? "Updated" : "Not found"}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <StatTile
          label="You paid"
          value={formatPKR(amount)}
          tone="cash"
          icon={Wallet}
        />
        <StatTile
          label="Still owed"
          value={formatPKR(stillOwed)}
          tone={stillOwed > 0 ? "debt" : "neutral"}
          icon={TrendingDown}
        />
      </div>

      {!matched ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-pending-bg/60 px-3 py-2 text-[11px] text-pending ring-1 ring-pending/20">
          <Sparkles className="mt-0.5 size-3.5 shrink-0" />
          <span>
            No open payable found for &ldquo;{supplierName}&rdquo;. If this
            was a customer, try &ldquo;Add <em>amount</em> to {supplierName}
            &rsquo;s debt&rdquo; so it records against their tab instead.
          </span>
        </div>
      ) : null}
    </div>
  );
}

function SupplierCreditCard({
  supplierName,
  addedAmount,
  items,
}: {
  supplierName: string;
  addedAmount: number;
  items: { name: string; quantity: number; lineTotal: number }[];
}) {
  // Pull live payables — the mirror step has already updated whichever
  // row matches this supplier, so we can read the new totals from state.
  const payables = useLedgerStore((s) => s.payables);
  const key = supplierName.trim().toLowerCase();
  const matches = payables.filter((p) => {
    const name = p.wholesalerName.trim().toLowerCase();
    return name === key || name.includes(key) || key.includes(name);
  });
  const totalOwed = matches
    .filter((p) => !p.paid)
    .reduce((sum, p) => sum + p.amount, 0);
  const matched = matches.length > 0;

  return (
    <div className="rounded-[22px] bg-white p-4 ring-1 ring-border shadow-sm">
      <div className="flex items-center gap-3">
        <ContactAvatar name={supplierName} size="lg" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-base font-bold">{supplierName}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Wholesaler · Naya udhaar
          </p>
        </div>
        <span className="rounded-full bg-money-out-bg px-2 py-0.5 text-[10px] font-semibold text-money-out">
          {matched ? "Updated" : "Added"}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <StatTile
          label="Added"
          value={formatPKR(addedAmount)}
          tone="debt"
          icon={TrendingUp}
        />
        <StatTile
          label="Total owed now"
          value={formatPKR(totalOwed)}
          tone={totalOwed > 0 ? "debt" : "neutral"}
          icon={Wallet}
        />
      </div>

      {items && items.length > 0 ? (
        <div className="mt-3 rounded-xl bg-sage-soft/60 px-3 py-2 ring-1 ring-black/5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Goods received
          </p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {items.map((it, i) => (
              <li key={i} className="flex items-center justify-between">
                <span className="truncate">
                  {it.quantity}× {it.name}
                </span>
                {it.lineTotal > 0 ? (
                  <span className="tabular text-xs text-muted-foreground">
                    {formatPKR(it.lineTotal)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function CashSaleCard({
  amount,
  items,
}: {
  amount: number;
  items: { name: string; quantity: number; lineTotal: number }[];
}) {
  // Pull today's sales total live so the owner sees the running figure
  // their voice entry just contributed to.
  const sales = useLedgerStore((s) => s.sales);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const todaysTotal = sales
    .filter((s) => s.date >= startOfDay.getTime())
    .reduce((sum, s) => sum + s.total, 0);

  return (
    <div className="rounded-[22px] bg-white p-4 ring-1 ring-border shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-full bg-money-in-bg text-money-in">
          <ShoppingBag className="size-5" strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-base font-bold">Cash sale</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            No customer attached · logged to today
          </p>
        </div>
        <span className="rounded-full bg-money-in-bg px-2 py-0.5 text-[10px] font-semibold text-money-in">
          Added
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <StatTile
          label="This sale"
          value={formatPKR(amount)}
          tone="cash"
          icon={Wallet}
        />
        <StatTile
          label="Today's total"
          value={formatPKR(todaysTotal)}
          tone="cash"
          icon={Wallet}
        />
      </div>

      {items.length > 0 ? (
        <ul className="mt-3 divide-y divide-border">
          {items.map((it, i) => (
            <li
              key={i}
              className="flex items-center justify-between py-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate">
                <span className="tabular text-muted-foreground">
                  {it.quantity}×
                </span>{" "}
                {it.name}
              </span>
              <span className="tabular font-semibold">
                {formatPKR(it.lineTotal)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function ReceiptPage() {
  const router = useRouter();
  const result = useVoiceReceipt((s) => s.result);
  const clearReceipt = useVoiceReceipt((s) => s.clear);
  const [undoing, setUndoing] = useState(false);
  const [undone, setUndone] = useState(false);

  // IMPORTANT: call every hook unconditionally before the early-return
  // below, otherwise the hook count changes across renders when the
  // receipt is cleared (which throws "Rendered fewer hooks than
  // expected"). The selectors all handle undefined inputs gracefully.
  //
  // We prefer the client Zustand store for the balance tiles: the
  // server's `balance` only counts voice-recorded purchases, but the
  // rest of the app (debt page, dashboard tile) reads from the local
  // store, which also includes demo-seeded/imported debts. Showing the
  // server figure here would contradict what the shopkeeper sees on
  // the next screen.
  const localContact = useLocalContactByName(result?.customer?.name);
  const localOwed = useContactOutstanding(localContact?.id);
  const localSpent = useContactTotalSpent(localContact?.id);

  useEffect(() => {
    if (!result) router.replace("/record");
    else if (result.action === "disambiguate") router.replace("/record/choose");
  }, [result, router]);

  if (!result || result.action === "disambiguate") return null;

  const {
    action,
    customer,
    purchase,
    intent,
    balance,
    customerCreated,
    customerSuggestions,
    bills,
    messaging,
  } = result;

  const heroAction = resolveHeroAction(action, purchase?.kind);

  const supplierPayment = result.supplierPayment ?? null;
  const supplierCredit = result.supplierCredit ?? null;
  const cashSale = result.cashSale ?? null;

  const displayOwed = localContact ? localOwed : balance?.totalOwed ?? 0;
  const displaySpent = localContact ? localSpent : balance?.totalSpent ?? 0;

  // Compute headline for the hero card per action.
  const headline = (() => {
    if (action === "new_customer") return customer?.name ?? "New customer";
    if (action === "query_bills") return formatPKR(displayOwed);
    if (action === "supplier_payment")
      return formatPKR(supplierPayment?.amount ?? 0);
    if (action === "supplier_credit")
      return formatPKR(supplierCredit?.amount ?? 0);
    if (action === "cash_sale") return formatPKR(cashSale?.amount ?? 0);
    return formatPKR(purchase?.amount ?? 0);
  })();

  const handleUndo = async () => {
    if (!purchase || undoing || undone) return;
    setUndoing(true);
    const ok = await undoVoicePurchase(purchase.id);
    setUndoing(false);
    if (ok) {
      setUndone(true);
      toast.success("Deleted from the ledger");
    } else {
      toast.error("Couldn't undo. Try again from the entry page.");
    }
  };

  /**
   * Build a prefilled WhatsApp message appropriate for the action so the
   * shopkeeper only has to tap "Send" in WhatsApp.
   */
  const buildWhatsAppMessage = (): string | null => {
    const name = customer?.name ?? "";
    if (action === "purchase") {
      const amt = formatPKR(purchase?.amount ?? 0);
      const total = formatPKR(displayOwed);
      const itemsLine =
        purchase?.items && purchase.items.length > 0
          ? "\n" +
            purchase.items
              .map((i) => `• ${i.quantity}× ${i.name}`)
              .join("\n") +
            "\n"
          : "";
      const tail =
        purchase?.kind === "cash"
          ? "_Paid in cash. Thank you!_"
          : "_Added to your tab (udhaar)._";
      return (
        `Hi ${name}, here's your receipt from the shop:${itemsLine}\n` +
        `*Total:* ${amt}\n${tail}\n\n` +
        `Outstanding balance: ${total}\n\n` +
        `— Sent via *Khata* (کھاتہ)`
      );
    }
    if (action === "payment") {
      const amt = formatPKR(purchase?.amount ?? 0);
      const total = formatPKR(displayOwed);
      return (
        `Hi ${name}, payment received: *${amt}*. Thank you!\n\n` +
        `Remaining balance: ${total}\n\n` +
        `— Sent via *Khata* (کھاتہ)`
      );
    }
    if (action === "query_bills") {
      const total = formatPKR(displayOwed);
      if (displayOwed <= 0) {
        return (
          `Hi ${name}, you have no outstanding balance at the shop. ` +
          `You're all cleared! ✅\n\n— Sent via *Khata* (کھاتہ)`
        );
      }
      return (
        `Hi ${name}, your outstanding balance is *${total}*.\n\n` +
        `— Sent via *Khata* (کھاتہ)`
      );
    }
    if (action === "new_customer") {
      return (
        `Welcome, ${name}! 🛍️\nYou've been added to our khata. ` +
        `You'll get a WhatsApp confirmation each time a purchase is ` +
        `recorded against your account.\n\n— Sent via *Khata* (کھاتہ)`
      );
    }
    return null;
  };

  /**
   * Opens a new tab/window with a WhatsApp chat for this customer,
   * pre-populated with an action-appropriate message. Does NOT clear
   * the receipt — the user still needs to tap Done to return home.
   *
   * Device-aware routing:
   *   • Desktop → WhatsApp Web (opens chat directly, no prompt).
   *   • Mobile  → whatsapp:// scheme (still shows the OS "Open WhatsApp?"
   *     confirmation, which cannot be suppressed by the web platform).
   */
  const handleOpenWhatsApp = () => {
    const phone = customer?.whatsappNumber ?? localContact?.phone ?? null;
    const message = buildWhatsAppMessage();
    if (!phone || !message) return;
    const digits = phone.replace(/\D+/g, "");
    if (digits.length < 10) return;
    const text = encodeURIComponent(message);
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    const url = isMobile
      ? `whatsapp://send?phone=${digits}&text=${text}`
      : `https://web.whatsapp.com/send?phone=${digits}&text=${text}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleDone = () => {
    clearReceipt();
    router.push("/");
  };

  const maxBillAmount = bills.reduce((m, b) => Math.max(m, b.amount), 1);

  return (
    <>
      <AppHeader
        variant="page"
        title={headerTitle(action)}
        urduTitle={headerUrduTitle(action)}
        subtitle={
          action === "new_customer"
            ? "New contact"
            : action === "query_bills"
              ? "Ledger lookup"
              : "Ledger updated"
        }
        backHref="/record"
      />
      <MobileShell>
        <div className="space-y-4 pb-24">
          {/* Per-action hero */}
          <ActionHero
            action={heroAction}
            headline={headline}
            statusLabel={undone ? "Undone" : undefined}
          />

          {/* Transcript */}
          <div className="rounded-[18px] bg-sage-soft px-4 py-3 ring-1 ring-black/5">
            <div className="flex items-center gap-2">
              <Sparkles className="size-3.5 text-muted-foreground" />
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Gemini heard
              </p>
              {intent.confidence < 0.6 ? (
                <span className="ml-auto rounded-full bg-pending-bg px-2 py-0.5 text-[10px] font-semibold text-pending">
                  Low confidence
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm italic leading-snug">
              &ldquo;{intent.transcript}&rdquo;
            </p>
          </div>

          {/* WhatsApp status */}
          <MessagingBadge messaging={messaging} />

          {/* ---- NEW CUSTOMER: phone + welcome visual ---- */}
          {action === "new_customer" && customer ? (
            <div className="rounded-[22px] bg-gradient-to-br from-white to-sage-soft p-4 ring-1 ring-border shadow-sm">
              <div className="flex items-center gap-3">
                <ContactAvatar name={customer.name} size="lg" />
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-base font-bold">
                    {customer.name}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <Phone className="size-3" />
                    {customer.whatsappNumber ?? "No WhatsApp number"}
                  </p>
                </div>
                {customerCreated ? (
                  <span className="rounded-full bg-money-in-bg px-2 py-0.5 text-[10px] font-semibold text-money-in">
                    Added
                  </span>
                ) : (
                  <span className="rounded-full bg-pending-bg px-2 py-0.5 text-[10px] font-semibold text-pending">
                    Already existed
                  </span>
                )}
              </div>
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/70 px-3 py-2 text-[11px] text-muted-foreground ring-1 ring-black/5">
                <Sparkles className="size-3 text-[#5b8def]" />
                <span>
                  A Welcome to E-Karyana Store message was prepared for them.
                </span>
              </div>
            </div>
          ) : null}

          {/* ---- PURCHASE/PAYMENT: balance tiles + items ---- */}
          {(action === "purchase" || action === "payment") && customer ? (
            <>
              <div className="rounded-[22px] bg-white p-4 ring-1 ring-border shadow-sm">
                <div className="flex items-center gap-3">
                  <ContactAvatar name={customer.name} />
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="truncate text-base font-semibold">
                      {customer.name}
                    </p>
                    {customer.whatsappNumber || localContact?.phone ? (
                      <p className="truncate text-[11px] text-muted-foreground">
                        {customer.whatsappNumber ?? localContact?.phone}
                      </p>
                    ) : null}
                  </div>
                  {customerCreated ? (
                    <span className="rounded-full bg-money-in-bg px-2 py-0.5 text-[10px] font-semibold text-money-in">
                      New
                    </span>
                  ) : null}
                </div>

                {balance || localContact ? (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <StatTile
                      label="Owes now"
                      value={formatPKR(displayOwed)}
                      tone="debt"
                      icon={TrendingDown}
                    />
                    <StatTile
                      label="Lifetime spend"
                      value={formatPKR(displaySpent)}
                      tone="cash"
                      icon={Wallet}
                    />
                  </div>
                ) : null}

                {customerSuggestions.length > 0 ? (
                  <div className="mt-3 rounded-xl bg-pending-bg/40 p-3 text-left">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-pending">
                      Did you mean one of these?
                    </p>
                    <ul className="mt-1 flex flex-wrap gap-1.5">
                      {customerSuggestions.slice(0, 3).map((c) => (
                        <li
                          key={c.id}
                          className="flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs ring-1 ring-border"
                        >
                          <UserCircle2 className="size-3 text-muted-foreground" />
                          {c.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>

              {purchase && purchase.items.length > 0 ? (
                <div className="rounded-[22px] bg-white p-4 ring-1 ring-border shadow-sm">
                  <div className="flex items-center gap-2">
                    <ShoppingBag className="size-4 text-muted-foreground" />
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Items
                    </p>
                  </div>
                  <ul className="mt-2 divide-y divide-border">
                    {purchase.items.map((it, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between py-2 text-sm"
                        style={{
                          animation: `fadeSlide 280ms ease-out ${i * 40}ms both`,
                        }}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          <span className="tabular text-muted-foreground">
                            {it.quantity}×
                          </span>{" "}
                          {it.name}
                        </span>
                        <span className="tabular font-semibold">
                          {formatPKR(it.lineTotal)}
                        </span>
                      </li>
                    ))}
                    <li className="flex items-center justify-between pt-2 text-sm">
                      <span className="font-semibold">Total</span>
                      <span className="tabular font-bold">
                        {formatPKR(purchase.amount)}
                      </span>
                    </li>
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}

          {/* ---- SUPPLIER PAYMENT: payable card ---- */}
          {action === "supplier_payment" && supplierPayment ? (
            <SupplierPaymentCard
              supplierName={supplierPayment.supplierName}
              amount={supplierPayment.amount}
            />
          ) : null}

          {/* ---- SUPPLIER CREDIT: udhaar-grew card ---- */}
          {action === "supplier_credit" && supplierCredit ? (
            <SupplierCreditCard
              supplierName={supplierCredit.supplierName}
              addedAmount={supplierCredit.amount}
              items={supplierCredit.items}
            />
          ) : null}

          {/* ---- CASH SALE: anonymous daily-sales card ---- */}
          {action === "cash_sale" && cashSale ? (
            <CashSaleCard amount={cashSale.amount} items={cashSale.items} />
          ) : null}

          {/* ---- QUERY BILLS: proportional bars ---- */}
          {action === "query_bills" ? (
            <div className="rounded-[22px] bg-white p-4 ring-1 ring-border shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ReceiptText className="size-4 text-muted-foreground" />
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Open bills
                  </p>
                </div>
                <span className="rounded-full bg-sage-soft px-2 py-0.5 text-[10px] font-semibold">
                  {bills.length} item{bills.length === 1 ? "" : "s"}
                </span>
              </div>

              {bills.length === 0 ? (
                <div className="mt-3 flex items-center gap-2 rounded-xl bg-money-in-bg px-3 py-4 text-sm text-money-in">
                  <CheckCircle2 className="size-4" />
                  All cleared — nothing owed.
                </div>
              ) : (
                <ul className="mt-3 space-y-3">
                  {bills.map((b, i) => {
                    const pct = Math.max(
                      8,
                      Math.round((b.amount / maxBillAmount) * 100),
                    );
                    const date = new Date(b.createdAt).toLocaleDateString(
                      "en-PK",
                      { day: "2-digit", month: "short" },
                    );
                    const label =
                      b.items.length > 0
                        ? b.items.map((i) => i.name).join(", ")
                        : b.notes ?? "Debt";
                    return (
                      <li
                        key={b.id}
                        style={{
                          animation: `fadeSlide 280ms ease-out ${i * 40}ms both`,
                        }}
                      >
                        <div className="flex items-center justify-between text-sm">
                          <span className="min-w-0 flex-1 truncate">
                            {label}
                          </span>
                          <span className="tabular ml-2 font-semibold text-money-out">
                            {formatPKR(b.amount)}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-money-out-bg">
                            <div
                              className="h-full rounded-full bg-money-out transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground">
                            {date}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                  <li className="flex items-center justify-between border-t border-border pt-3 text-sm">
                    <span className="font-semibold">Total owed</span>
                    <span className="tabular font-bold text-money-out">
                      {formatPKR(displayOwed)}
                    </span>
                  </li>
                </ul>
              )}
            </div>
          ) : null}

          {/* Footer actions */}
          {(() => {
            const phone =
              customer?.whatsappNumber ?? localContact?.phone ?? null;
            const showWhatsAppButton =
              !!phone &&
              (action === "purchase" ||
                action === "payment" ||
                action === "query_bills" ||
                action === "new_customer");
            return (
              <div className="flex flex-wrap gap-2 pt-2">
                {purchase ? (
                  <button
                    type="button"
                    onClick={handleUndo}
                    disabled={undoing || undone}
                    className="flex-1 rounded-2xl bg-white px-5 py-4 text-sm font-semibold ring-1 ring-border active:scale-95 transition disabled:opacity-40"
                  >
                    <RotateCcw className="mr-1 inline size-4" />
                    {undone ? "Undone" : undoing ? "Undoing…" : "Undo"}
                  </button>
                ) : null}
                {showWhatsAppButton ? (
                  <button
                    type="button"
                    onClick={handleOpenWhatsApp}
                    className="flex-1 rounded-2xl bg-[#25D366] px-4 py-4 text-sm font-semibold text-white shadow-[0_14px_30px_-14px_rgba(37,211,102,0.6)] active:scale-95 transition"
                  >
                    <MessageCircle className="mr-1 inline size-4" />
                    WhatsApp
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={handleDone}
                  className="flex-[2] min-w-[120px] rounded-2xl bg-ink px-5 py-4 text-base font-semibold text-background shadow-[0_14px_30px_-14px_rgba(0,0,0,0.5)] active:scale-95 transition"
                >
                  <ArrowLeft className="mr-1 inline size-4 rotate-180" />
                  Done
                </button>
              </div>
            );
          })()}
        </div>
      </MobileShell>

      {/* Lightweight per-item entrance animation. */}
      <style jsx global>{`
        @keyframes fadeSlide {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  );
}
