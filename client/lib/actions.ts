/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Frontend facade for data + voice actions.
 *
 *  Data reads/writes are now served by the client Zustand store
 *  (`@/lib/store/ledger-store`). This module only hosts the *voice pipeline*
 *  entry points, which are the real integration surface with the backend:
 *
 *      transcribeAudio()   → @khata/server/actions/stt          (not yet)
 *      parseIntent()       → @khata/server/actions/parser       (not yet)
 *      buildConfirmation() → @khata/server/actions/confirm      (not yet)
 *
 *  For the demo we short-circuit with:
 *    - Web Speech API (client-side STT) wrapped by `useSpeechRecognition`.
 *    - A heuristic intent parser (`@/lib/intent`).
 *    - A local fuzzy contact matcher (`@/lib/fuzzy`).
 *
 *  When the backend teammate lands the real actions, replace the bodies below
 *  with calls to `@khata/server/actions/*` and strip the heuristic fallbacks.
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use client";

import type {
  Contact,
  ParsedIntent,
  ConfirmationPayload,
  PakistanPhone,
  SaleItem,
} from "./types";
import type { VoiceIntentResult, GeminiIntent } from "@khata/server";
import { parseIntent as heuristicParseIntent } from "./intent";
import { matchContacts } from "./fuzzy";
import { useLedgerStore } from "./store/ledger-store";

/* -------------------------------------------------------------------------- */
/*  Server-backed voice pipeline                                              */
/*  (audio blob → /api/voice/record → MongoDB-persisted result)               */
/* -------------------------------------------------------------------------- */

/**
 * Upload a recorded audio clip to the backend. The server runs Gemini
 * 3 Flash + the Mongo pipeline and returns the saved purchase along with
 * the customer it was attached to. Throws on 4xx/5xx with a message
 * suitable for a toast.
 */
export async function uploadVoiceAudio(
  audio: Blob,
  mimeType: string,
): Promise<VoiceIntentResult> {
  const form = new FormData();
  // Give the file a sensible extension so server-side logging is easier
  // to read; the server only trusts the MIME type, not the filename.
  const ext = mimeType.includes("mp4")
    ? "m4a"
    : mimeType.includes("ogg")
      ? "ogg"
      : "webm";
  form.append("audio", audio, `voice-${Date.now()}.${ext}`);

  const res = await fetch("/api/voice/record", {
    method: "POST",
    body: form,
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    data?: VoiceIntentResult;
    error?: string;
    code?: string;
  };
  if (!res.ok || !json.ok || !json.data) {
    const err = new Error(json.error || `Upload failed (${res.status})`);
    (err as Error & { code?: string }).code = json.code;
    throw err;
  }

  // Mirror the server-side result into the client Zustand store so the
  // Debt / Payables / Sales / Contacts list pages (which read from
  // localStorage) stay in sync with MongoDB Atlas. Swallow mirroring
  // errors — the server truth has already been saved; UI sync is
  // best-effort.
  try {
    mirrorVoiceResultToLedger(json.data);
  } catch (e) {
    console.warn("[voice] failed to mirror result into client store:", e);
  }

  return json.data;
}

/* -------------------------------------------------------------------------- */
/*  Client-store mirroring                                                    */
/* -------------------------------------------------------------------------- */

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Ensure a local Zustand Contact exists for the server-side customer. If the
 * same person is already in the client store we reuse its id; otherwise we
 * create a new contact. Matching priority:
 *   1. Exact phone match (when both sides have a whatsappNumber).
 *   2. Exact normalized-name match.
 *   3. Fresh addContact().
 */
function ensureLocalContact(
  customer: VoiceIntentResult["customer"],
): Contact | null {
  if (!customer) return null;
  const store = useLedgerStore.getState();
  const existing = store.contacts;

  const serverPhone = customer.whatsappNumber?.trim();
  if (serverPhone) {
    const byPhone = existing.find((c) => c.phone === serverPhone);
    if (byPhone) return byPhone;
  }

  const nameKey = normalizeName(customer.name);
  const byName = existing.find((c) => normalizeName(c.name) === nameKey);
  if (byName) {
    // Backfill a phone we didn't have locally.
    if (serverPhone && !byName.phone) {
      store.updateContact({ ...byName, phone: serverPhone as PakistanPhone });
      return { ...byName, phone: serverPhone as PakistanPhone };
    }
    return byName;
  }

  return store.addContact({
    name: customer.name,
    // addContact wants a PakistanPhone; we cast because the UI tolerates an
    // empty phone and the server will accept the backfill later.
    phone: (serverPhone ?? "") as PakistanPhone,
  });
}

/**
 * Translate a successful VoiceIntentResult into the equivalent client-store
 * mutations so the existing list UIs (which read only from localStorage) show
 * the new row instantly.
 */
function mirrorVoiceResultToLedger(result: VoiceIntentResult): void {
  const { action, customer, purchase, intent } = result;

  // Supplier payments bypass the customer path entirely — they update a
  // payable row in the client store, not a customer's debts.
  if (action === "supplier_payment" && result.supplierPayment) {
    mirrorSupplierPayment(result.supplierPayment);
    return;
  }

  // Supplier credit — owner took more stock on udhaar from a wholesaler.
  // Same mirror pattern as supplier_payment but the payable grows instead
  // of shrinking.
  if (action === "supplier_credit" && result.supplierCredit) {
    mirrorSupplierCredit(result.supplierCredit);
    return;
  }

  // Anonymous "today I sold Rs. X" — no customer attached, just append a
  // Sale row so it rolls into today's sales total on the dashboard.
  if (action === "cash_sale" && result.cashSale) {
    mirrorCashSale(result.cashSale);
    return;
  }

  const store = useLedgerStore.getState();
  const contact = ensureLocalContact(customer);

  if (action === "new_customer") {
    return; // ensureLocalContact already did the work.
  }

  if (!purchase || !contact) return;

  const createdAt = new Date(purchase.createdAt).getTime() || Date.now();

  if (action === "purchase" && purchase.kind === "debt") {
    store.addDebt({
      contactId: contact.id,
      amount: purchase.amount,
      date: createdAt,
      notes: purchase.notes ?? intent.transcript,
    });
    return;
  }

  if (action === "purchase" && purchase.kind === "cash") {
    const saleItems: SaleItem[] = (purchase.items ?? []).map((it) => ({
      name: it.name,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      lineTotal: it.lineTotal,
    }));
    store.addSale({
      customerContactId: contact.id,
      items: saleItems,
      total: purchase.amount,
      date: createdAt,
      notes: purchase.notes ?? intent.transcript,
    });
    return;
  }

  if (action === "payment") {
    // Settle outstanding debts for this contact, oldest first, until the
    // paid amount is exhausted. Partial payments collapse the most recent
    // unsettled debt by the remainder (demo-grade accounting; good enough
    // for the UI to reflect reality).
    let remaining = purchase.amount;
    const openDebts = store.debts
      .filter((d) => d.contactId === contact.id && !d.settled)
      .sort((a, b) => a.date - b.date);
    for (const d of openDebts) {
      if (remaining <= 0) break;
      if (remaining >= d.amount) {
        store.setDebtSettled(d.id, true);
        remaining -= d.amount;
      } else {
        store.updateDebt({ ...d, amount: d.amount - remaining });
        remaining = 0;
      }
    }
    return;
  }
}

/**
 * Handle action="supplier_payment". Find the matching Payable by normalized
 * wholesaler name, reduce its amount, and mark it paid if it reaches zero.
 * Walks multiple unpaid payables oldest-first when the owner's statement
 * covers more than one bill.
 */
function mirrorSupplierPayment(
  supplierPayment: { supplierName: string; amount: number },
): void {
  const store = useLedgerStore.getState();
  const key = normalizeName(supplierPayment.supplierName);

  // Find all unpaid payables for this wholesaler (fuzzy: startsWith/contains).
  const openPayables = store.payables
    .filter((p) => {
      if (p.paid) return false;
      const name = normalizeName(p.wholesalerName);
      return name === key || name.includes(key) || key.includes(name);
    })
    .sort((a, b) => a.date - b.date);

  let remaining = supplierPayment.amount;
  for (const p of openPayables) {
    if (remaining <= 0) break;
    if (remaining >= p.amount) {
      // Cleared this bill entirely.
      store.setPayablePaid(p.id, true);
      remaining -= p.amount;
    } else {
      // Partial payment: knock the owed amount down, keep it unpaid.
      store.updatePayable({ ...p, amount: p.amount - remaining });
      remaining = 0;
    }
  }

  // No matching open payable — do NOT invent a zero-balance row. A junk
  // "Rs. 0 · settled" entry pollutes the payables list (and was the cause
  // of the Shahmeer/supplier phantom entries users saw). The receipt
  // screen already shows the paid amount from the voice intent, so the
  // owner has full visibility of the event without persisting noise.
  // If the supplier does exist but was already marked paid, we've
  // intentionally ignored the new payment: historical payables shouldn't
  // be resurrected silently — we'd rather under-mirror than mis-mirror.
}

/**
 * Handle action="supplier_credit". Owner took more goods / credit from a
 * wholesaler without paying. If an open payable for that supplier already
 * exists we collapse the new amount into it (keeps the payables list
 * tidy, matches how debts are grouped by contact in the UI). Otherwise
 * we create a fresh payable row.
 */
function mirrorSupplierCredit(
  supplierCredit: NonNullable<VoiceIntentResult["supplierCredit"]>,
): void {
  const store = useLedgerStore.getState();
  const key = normalizeName(supplierCredit.supplierName);

  const allMatches = store.payables
    .filter((p) => {
      const name = normalizeName(p.wholesalerName);
      return name === key || name.includes(key) || key.includes(name);
    })
    .sort((a, b) => b.date - a.date);

  // Preference order:
  //   1. Most recent UNPAID row → just grow it.
  //   2. Most recent PAID row → reopen + grow. This handles the common
  //      case where a previous balance was marked paid (accidentally or
  //      because it actually was) and the shopkeeper now owes more.
  //      Keeping the single grouped row avoids the "two Bilal Wholesale
  //      entries" bug we saw in practice.
  //   3. No existing row at all → create a fresh unpaid payable.
  const openTarget = allMatches.find((p) => !p.paid);
  const target = openTarget ?? allMatches[0];

  if (target) {
    store.updatePayable({
      ...target,
      wholesalerName: supplierCredit.supplierName,
      amount: target.amount + supplierCredit.amount,
      paid: false,
      notes: target.notes ?? supplierCredit.transcript,
    });
    return;
  }

  store.addPayable({
    wholesalerName: supplierCredit.supplierName,
    amount: supplierCredit.amount,
    date: Date.now(),
    notes: supplierCredit.notes ?? supplierCredit.transcript,
    ...(supplierCredit.items.length
      ? {
          items: supplierCredit.items.map((it) => ({
            name: it.name,
            quantity: it.quantity,
          })),
        }
      : {}),
  });
}

/**
 * Handle action="cash_sale". Anonymous cash-register sales are appended
 * to the client `sales` list with no customer attached, so they roll
 * into today's totals on the dashboard but don't pollute any contact's
 * lifetime-spend figure.
 */
function mirrorCashSale(
  cashSale: NonNullable<VoiceIntentResult["cashSale"]>,
): void {
  const store = useLedgerStore.getState();
  const saleItems: SaleItem[] = (cashSale.items ?? []).map((it) => ({
    name: it.name,
    quantity: it.quantity,
    unitPrice: it.unitPrice,
    lineTotal: it.lineTotal,
  }));
  store.addSale({
    items: saleItems,
    total: cashSale.amount,
    date: Date.now(),
    notes: cashSale.transcript,
  });
}

/**
 * Second half of the disambiguation flow. `/api/voice/record` returned
 * an `action=disambiguate` result with a list of candidates; the user
 * picked one; we send the original Gemini intent + the chosen
 * customerId back to `/api/voice/commit` and receive the real
 * VoiceIntentResult (purchase / payment / query_bills) for the receipt
 * screen.
 */
export async function commitDisambiguatedIntent(
  intent: GeminiIntent,
  customerId: string,
): Promise<VoiceIntentResult> {
  const res = await fetch("/api/voice/commit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intent, customerId }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    data?: VoiceIntentResult;
    error?: string;
    code?: string;
  };
  if (!res.ok || !json.ok || !json.data) {
    const err = new Error(json.error || `Commit failed (${res.status})`);
    (err as Error & { code?: string }).code = json.code;
    throw err;
  }

  try {
    mirrorVoiceResultToLedger(json.data);
  } catch (e) {
    console.warn("[voice] failed to mirror commit result:", e);
  }

  return json.data;
}

/**
 * Undo the most recently saved voice record. Silently swallows errors —
 * the UI toast just reports success/failure without extra detail.
 */
export async function undoVoicePurchase(purchaseId: string): Promise<boolean> {
  try {
    const res = await fetch("/api/voice/undo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purchaseId }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
    return !!json.ok;
  } catch {
    return false;
  }
}

/**
 * Turn free-text (already-transcribed) voice into a structured intent.
 * Demo implementation runs client-side; real one will be a server action.
 */
export async function previewVoice(transcript: string): Promise<ParsedIntent> {
  return heuristicParseIntent(transcript);
}

/**
 * Hydrate a `ParsedIntent` into a full confirmation payload the UI can
 * render: fuzzy-matched contact suggestions + a draft record.
 */
export async function buildConfirmation(
  intent: ParsedIntent,
  contacts: Contact[]
): Promise<ConfirmationPayload> {
  switch (intent.action) {
    case "add_debt": {
      const matches = matchContacts(intent.payload.contactName, contacts);
      const topMatch = matches[0];
      return {
        intent,
        summary: `Debt of Rs. ${intent.payload.amount.toLocaleString("en-PK")} from ${intent.payload.contactName}`,
        suggestedContactMatches: matches,
        draftRecord: {
          kind: "debt",
          value: {
            contactId: topMatch?.contactId ?? "",
            amount: intent.payload.amount,
            date: intent.payload.date ?? Date.now(),
            notes: intent.payload.notes,
            settled: false,
          },
        },
        autoConfirm: false,
      };
    }
    case "settle_debt": {
      const matches = matchContacts(intent.payload.contactName, contacts);
      return {
        intent,
        summary: `Settle debt for ${intent.payload.contactName}${
          intent.payload.amount
            ? ` — Rs. ${intent.payload.amount.toLocaleString("en-PK")}`
            : ""
        }`,
        suggestedContactMatches: matches,
        autoConfirm: false,
      };
    }
    case "add_payable": {
      return {
        intent,
        summary: `Payable of Rs. ${intent.payload.amount.toLocaleString("en-PK")} to ${intent.payload.wholesalerName}`,
        draftRecord: {
          kind: "payable",
          value: {
            wholesalerName: intent.payload.wholesalerName,
            amount: intent.payload.amount,
            date: intent.payload.date ?? Date.now(),
            notes: intent.payload.notes,
            paid: false,
          },
        },
        autoConfirm: false,
      };
    }
    case "add_sale": {
      const matches = intent.payload.customerName
        ? matchContacts(intent.payload.customerName, contacts)
        : [];
      return {
        intent,
        summary: `Sale of Rs. ${intent.payload.total.toLocaleString("en-PK")}${
          intent.payload.customerName ? ` to ${intent.payload.customerName}` : ""
        }`,
        suggestedContactMatches: matches,
        draftRecord: {
          kind: "sale",
          value: {
            customerContactId: matches[0]?.contactId,
            items: intent.payload.items,
            total: intent.payload.total,
            date: Date.now(),
            notes: intent.payload.notes,
          },
        },
        autoConfirm: false,
      };
    }
    case "add_contact": {
      const existing = matchContacts(intent.payload.name, contacts);
      return {
        intent,
        summary: `New contact — ${intent.payload.name}${
          intent.payload.phone ? ` (${intent.payload.phone})` : ""
        }`,
        suggestedContactMatches: existing,
        autoConfirm: false,
      };
    }
    case "unknown":
    default:
      return {
        intent,
        summary: "Couldn't understand. Try again or add manually.",
        autoConfirm: false,
      };
  }
}
