/**
 * Voice intent orchestrator.
 *
 * Pipeline:
 *
 *     audio bytes  ──►  Gemini (transcribe + parse)
 *                       │
 *                       ▼
 *              GeminiIntent (JSON)
 *                       │
 *                       ▼
 *           ┌──────────┬────────────┬────────────┬──────────────┐
 *           │          │            │            │              │
 *       purchase   payment    new_customer   query_bills   unknown
 *           │          │            │            │              │
 *           ▼          ▼            ▼            ▼              ▼
 *       insert +   insert +    upsert +      aggregate +    error
 *       Twilio     Twilio      Twilio        Twilio
 *       receipt    receipt     welcome       summary
 *                       │
 *                       ▼
 *              VoiceIntentResult
 *
 * Twilio calls are fire-and-forget from the UI's perspective: if the
 * account isn't configured the pipeline still returns the database
 * result, and the `messaging` field on the response records what was
 * attempted so the frontend can show a subtle "WhatsApp sent" badge.
 */

import { transcribeAndParse } from "../integrations/gemini-client";
import {
  findCustomerByName,
  getCustomerById,
  listCustomers,
  upsertCustomerByName,
} from "../db/customers";
import {
  createPurchase,
  deletePurchase,
  getCustomerBalance,
  listPurchases,
} from "../db/purchases";
import {
  isTwilioConfigured,
  normalizeWhatsAppNumber,
  sendBillsSummary,
  sendPurchaseReceipt,
  sendWelcomeMessage,
  type SendResult,
} from "../integrations/twilio-client";
import type {
  CustomerView,
  GeminiIntent,
  PurchaseItemInput,
  PurchaseKind,
  PurchaseView,
} from "../db/schemas";

const AUTO_MATCH_THRESHOLD = 0.72;

/**
 * Above this similarity we consider a match "near-exact" — the typical
 * shape is a substring hit (0.95) or an exact string (1.0). When two
 * customers both score in this band for the same utterance, neither is
 * safe to auto-pick and the pipeline asks the shopkeeper to choose.
 */
const AMBIGUITY_THRESHOLD = 0.85;
/**
 * Even within the ambiguity band, we only treat the top two as a real
 * tie when their scores are within this delta of each other. (e.g. a 1.0
 * exact match for "Zuhaib" vs a 0.95 substring match for "Zuhaib Akhtar"
 * — delta = 0.05, ambiguous. A 1.0 "Zuhaib" vs 0.92 "Mohammad Zuhaib"
 * — delta = 0.08, ambiguous.)
 */
const AMBIGUITY_DELTA = 0.15;

export type VoiceAction =
  | "purchase"
  | "payment"
  | "new_customer"
  | "query_bills"
  | "supplier_payment"
  | "supplier_credit"
  | "cash_sale"
  | "disambiguate";

export interface SupplierPaymentPayload {
  supplierName: string;
  amount: number;
}

export interface SupplierCreditPayload {
  supplierName: string;
  amount: number;
  items: PurchaseItemInput[];
  notes?: string;
  transcript: string;
}

export interface CashSalePayload {
  amount: number;
  items: PurchaseItemInput[];
  transcript: string;
}

export interface DisambiguationCandidate {
  customer: CustomerView;
  similarity: number;
  balance: Awaited<ReturnType<typeof getCustomerBalance>>;
}

export interface DisambiguationPayload {
  /** The raw name Gemini extracted from the audio. */
  originalName: string;
  /** What the pipeline was about to do before pausing for a pick. */
  pendingAction: "purchase" | "payment" | "query_bills";
  /** Near-exact matches the shopkeeper must choose between. */
  candidates: DisambiguationCandidate[];
}

export interface MessagingStatus {
  attempted: boolean;
  sent: boolean;
  kind?: "welcome" | "receipt" | "bills_summary";
  to?: string;
  error?: string;
  skippedReason?: string;
}

export interface VoiceIntentResult {
  /** Which tool/action the pipeline executed. */
  action: VoiceAction;
  /** Raw Gemini output, for debugging and the confirm screen. */
  intent: GeminiIntent;
  /** The customer the action was resolved to (if any). */
  customer: CustomerView | null;
  /** The persisted purchase doc (only for purchase/payment). */
  purchase: PurchaseView | null;
  /** Running balance for that customer after the action. */
  balance: Awaited<ReturnType<typeof getCustomerBalance>> | null;
  /** True if we had to create the customer fresh. */
  customerCreated: boolean;
  /** Open debts for query_bills, otherwise []. */
  bills: PurchaseView[];
  /** Other fuzzy matches Gemini might have meant. */
  customerSuggestions: CustomerView[];
  /** Twilio send status (best-effort). */
  messaging: MessagingStatus;
  /** Populated only for action=supplier_payment. The client-side ledger
   *  store is the source of truth for payables, so the server just
   *  forwards the supplier name + amount for the mirror step to apply. */
  supplierPayment: SupplierPaymentPayload | null;
  /** Populated only for action=supplier_credit. Same client-side mirror
   *  pattern as supplier_payment, except the mirror INCREASES the
   *  matching payable instead of reducing it. */
  supplierCredit: SupplierCreditPayload | null;
  /** Populated only for action=cash_sale. Anonymous (no customer)
   *  cash sales are client-side-only too — the server echoes the total
   *  back so the mirror can append a Sale row. */
  cashSale: CashSalePayload | null;
  /** Populated only for action=disambiguate. The UI renders a picker
   *  and then POSTs to /api/voice/commit with the chosen customerId. */
  disambiguation: DisambiguationPayload | null;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function inferKind(intent: GeminiIntent): PurchaseKind {
  if (intent.action === "payment") return "payment";
  const transcript = intent.transcript.toLowerCase();
  if (/\b(cash|naqad|naqd|paid cash|cash me|cash mein)\b/.test(transcript)) {
    return "cash";
  }
  return "debt";
}

function coerceItems(intent: GeminiIntent): PurchaseItemInput[] {
  if (!intent.items || intent.items.length === 0) return [];
  return intent.items.map((raw) => {
    const quantity = raw.quantity ?? 1;
    const unitPrice = raw.unitPrice ?? 0;
    const lineTotal =
      raw.lineTotal ??
      (unitPrice > 0
        ? unitPrice * quantity
        : Math.round(intent.amount / intent.items.length));
    return {
      name: raw.name.trim(),
      quantity,
      unitPrice,
      lineTotal,
    };
  });
}

function amountFromIntent(
  intent: GeminiIntent,
  items: PurchaseItemInput[],
): number {
  if (intent.amount && intent.amount > 0) return Math.round(intent.amount);
  const sum = items.reduce((a, b) => a + (b.lineTotal || 0), 0);
  return Math.max(0, sum);
}

async function resolveOrCreateCustomer(
  name: string,
  extra?: { whatsappNumber?: string },
): Promise<{
  customer: CustomerView;
  created: boolean;
  suggestions: CustomerView[];
}> {
  const matches = await findCustomerByName(name, { limit: 5 });
  const topMatch = matches[0];
  if (topMatch && topMatch.similarity >= AUTO_MATCH_THRESHOLD) {
    return {
      customer: topMatch.customer,
      created: false,
      suggestions: matches.slice(1).map((m) => m.customer),
    };
  }
  const { customer, created } = await upsertCustomerByName({
    name,
    aliases: [],
    ...(extra?.whatsappNumber ? { whatsappNumber: extra.whatsappNumber } : {}),
  });
  return {
    customer,
    created,
    suggestions: matches.map((m) => m.customer),
  };
}

/**
 * Decide whether the voice-extracted name resolves to multiple plausible
 * customers. Returns the ambiguous candidate set (with live balances) or
 * `null` when we should proceed normally.
 *
 * "Ambiguous" means: at least two matches score ≥ AMBIGUITY_THRESHOLD
 * AND the gap between the #1 and #2 match is ≤ AMBIGUITY_DELTA. This
 * catches the classic near-duplicate shape (exact "Zuhaib" + substring
 * "Zuhaib Akhtar") without tripping on unrelated fuzzy matches.
 */
async function findAmbiguousCandidates(
  name: string,
): Promise<DisambiguationCandidate[] | null> {
  const matches = await findCustomerByName(name, { limit: 6 });
  if (matches.length < 2) return null;
  const top = matches[0]!;
  const second = matches[1]!;
  if (second.similarity < AMBIGUITY_THRESHOLD) return null;
  if (top.similarity - second.similarity > AMBIGUITY_DELTA) return null;

  const ambiguous = matches.filter((m) => m.similarity >= AMBIGUITY_THRESHOLD);
  const withBalances = await Promise.all(
    ambiguous.map(async (m) => ({
      customer: m.customer,
      similarity: m.similarity,
      balance: await getCustomerBalance(m.customer.id),
    })),
  );
  return withBalances;
}

/** Build a "pause and ask the user to pick" result the UI knows how to route. */
function makeDisambiguationResult(
  intent: GeminiIntent,
  candidates: DisambiguationCandidate[],
  pendingAction: DisambiguationPayload["pendingAction"],
): VoiceIntentResult {
  return {
    action: "disambiguate",
    intent,
    customer: null,
    purchase: null,
    balance: null,
    customerCreated: false,
    bills: [],
    customerSuggestions: [],
    messaging: {
      attempted: false,
      sent: false,
      skippedReason: "not_applicable",
    },
    supplierPayment: null,
    supplierCredit: null,
    cashSale: null,
    disambiguation: {
      originalName: intent.customerName?.trim() ?? "",
      pendingAction,
      candidates,
    },
  };
}

function toMessagingStatus(
  kind: MessagingStatus["kind"],
  to: string | null,
  result: SendResult | null,
): MessagingStatus {
  if (!to || !result) {
    return {
      attempted: false,
      sent: false,
      kind,
      skippedReason: !to ? "no_phone_on_file" : "not_configured",
    };
  }
  return {
    attempted: true,
    sent: result.sent,
    kind,
    to,
    ...(result.error ? { error: result.error } : {}),
    ...(result.skippedReason ? { skippedReason: result.skippedReason } : {}),
  };
}

/* -------------------------------------------------------------------------- */
/*  Entry point                                                               */
/* -------------------------------------------------------------------------- */

export interface RunVoiceIntentOpts {
  audio: Buffer | Uint8Array;
  mimeType: string;
}

export async function runVoiceIntent(
  opts: RunVoiceIntentOpts,
): Promise<VoiceIntentResult> {
  // 1. Hint Gemini with known customer names so it spells them correctly.
  const existingCustomers = await listCustomers();
  const context =
    existingCustomers.length > 0
      ? `Known customers (match their spelling when possible): ${existingCustomers
          .slice(0, 50)
          .map((c) => c.name)
          .join(", ")}`
      : undefined;

  // 2. Transcribe + parse.
  const intent = await transcribeAndParse({
    audio: opts.audio,
    mimeType: opts.mimeType,
    context,
  });

  // Action-specific required-field checks. cash_sale needs no name;
  // supplier_payment / supplier_credit use supplierName; everything else
  // uses customerName.
  let hasRequired: boolean;
  if (intent.action === "cash_sale") {
    hasRequired = true;
  } else if (
    intent.action === "supplier_payment" ||
    intent.action === "supplier_credit"
  ) {
    hasRequired = !!intent.supplierName;
  } else {
    hasRequired = !!intent.customerName;
  }
  if (intent.action === "unknown" || !hasRequired) {
    throw Object.assign(
      new Error(
        "Couldn't confidently extract a command from the audio. Please try again.",
      ),
      { code: "AMBIGUOUS_INTENT", intent },
    );
  }

  // 3. Dispatch to the right "tool".
  switch (intent.action) {
    case "new_customer":
      return handleNewCustomer(intent);
    case "query_bills":
      return handleQueryBills(intent);
    case "purchase":
    case "payment":
      return handlePurchaseOrPayment(intent);
    case "supplier_payment":
      return handleSupplierPayment(intent);
    case "supplier_credit":
      return handleSupplierCredit(intent);
    case "cash_sale":
      return handleCashSale(intent);
    default:
      throw Object.assign(new Error("Unsupported action."), {
        code: "AMBIGUOUS_INTENT",
        intent,
      });
  }
}

/* -------------------------------------------------------------------------- */
/*  Action: cash_sale                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Owner is logging anonymous cash-register sales ("aaj ki bikri 500")
 * that aren't tied to a specific customer. Persisting a fake customer
 * would pollute the Mongo contacts list, so — like supplier_payment —
 * this is forwarded to the client for the Zustand sales list to absorb.
 */
async function handleCashSale(
  intent: GeminiIntent,
): Promise<VoiceIntentResult> {
  const items = coerceItems(intent);
  const amount = amountFromIntent(intent, items);
  if (amount <= 0) {
    throw Object.assign(
      new Error(
        "Couldn't extract an amount from the audio. Please include the rupees.",
      ),
      { code: "MISSING_AMOUNT", intent },
    );
  }

  return {
    action: "cash_sale",
    intent,
    customer: null,
    purchase: null,
    balance: null,
    customerCreated: false,
    bills: [],
    customerSuggestions: [],
    messaging: { attempted: false, sent: false, skippedReason: "not_applicable" },
    supplierPayment: null,
    supplierCredit: null,
    cashSale: { amount, items, transcript: intent.transcript },
    disambiguation: null,
  };
}

/* -------------------------------------------------------------------------- */
/*  Action: supplier_payment                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Shopkeeper paid a wholesaler/supplier. Payables live only in the client
 * Zustand store for now, so the server doesn't persist anything — it just
 * echoes back the parsed supplierName + amount so the client mirror can
 * reduce the matching payable.
 */
async function handleSupplierPayment(
  intent: GeminiIntent,
): Promise<VoiceIntentResult> {
  const supplierName = intent.supplierName!.trim();
  const amount = Math.round(intent.amount);
  if (amount <= 0) {
    throw Object.assign(
      new Error(
        "Couldn't extract an amount from the audio. Please include the rupees paid.",
      ),
      { code: "MISSING_AMOUNT", intent },
    );
  }

  return {
    action: "supplier_payment",
    intent,
    customer: null,
    purchase: null,
    balance: null,
    customerCreated: false,
    bills: [],
    customerSuggestions: [],
    messaging: { attempted: false, sent: false, skippedReason: "not_applicable" },
    supplierPayment: { supplierName, amount },
    supplierCredit: null,
    cashSale: null,
    disambiguation: null,
  };
}

/* -------------------------------------------------------------------------- */
/*  Action: supplier_credit                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Owner took more goods / credit from a wholesaler without paying.
 * Increases the payable owed to that supplier. Payables live in the
 * client Zustand store, so — like supplier_payment — the server just
 * validates + echoes the payload back for the mirror step to apply.
 */
async function handleSupplierCredit(
  intent: GeminiIntent,
): Promise<VoiceIntentResult> {
  const supplierName = intent.supplierName!.trim();
  const items = coerceItems(intent);
  const amount = amountFromIntent(intent, items);
  if (amount <= 0) {
    throw Object.assign(
      new Error(
        "Couldn't extract an amount from the audio. Please include the rupees owed.",
      ),
      { code: "MISSING_AMOUNT", intent },
    );
  }

  return {
    action: "supplier_credit",
    intent,
    customer: null,
    purchase: null,
    balance: null,
    customerCreated: false,
    bills: [],
    customerSuggestions: [],
    messaging: { attempted: false, sent: false, skippedReason: "not_applicable" },
    supplierPayment: null,
    supplierCredit: {
      supplierName,
      amount,
      items,
      ...(intent.notes ? { notes: intent.notes } : {}),
      transcript: intent.transcript,
    },
    cashSale: null,
    disambiguation: null,
  };
}

/* -------------------------------------------------------------------------- */
/*  Action: new_customer                                                      */
/* -------------------------------------------------------------------------- */

async function handleNewCustomer(
  intent: GeminiIntent,
): Promise<VoiceIntentResult> {
  const name = intent.customerName!.trim();
  const normalizedPhone = normalizeWhatsAppNumber(intent.whatsappNumber);

  const { customer, created, suggestions } = await resolveOrCreateCustomer(
    name,
    normalizedPhone ? { whatsappNumber: normalizedPhone } : undefined,
  );

  // Best-effort: send welcome only when we just created the customer AND
  // we actually have a phone number to reach them on.
  let messagingResult: SendResult | null = null;
  const recipient = customer.whatsappNumber ?? normalizedPhone ?? null;
  if (created && recipient && isTwilioConfigured()) {
    messagingResult = await sendWelcomeMessage(recipient, customer.name);
  }

  const balance = await getCustomerBalance(customer.id);

  return {
    action: "new_customer",
    intent,
    customer,
    purchase: null,
    balance,
    customerCreated: created,
    bills: [],
    customerSuggestions: suggestions,
    messaging: toMessagingStatus("welcome", recipient, messagingResult),
    supplierPayment: null,
    supplierCredit: null,
    cashSale: null,
    disambiguation: null,
  };
}

/* -------------------------------------------------------------------------- */
/*  Action: query_bills                                                       */
/* -------------------------------------------------------------------------- */

async function handleQueryBills(
  intent: GeminiIntent,
  opts: { forcedCustomer?: CustomerView } = {},
): Promise<VoiceIntentResult> {
  const name = intent.customerName!.trim();

  let customer: CustomerView;
  let suggestions: CustomerView[] = [];

  if (opts.forcedCustomer) {
    customer = opts.forcedCustomer;
  } else {
    const ambiguous = await findAmbiguousCandidates(name);
    if (ambiguous) return makeDisambiguationResult(intent, ambiguous, "query_bills");

    const matches = await findCustomerByName(name, { limit: 5 });
    const topMatch = matches[0];
    if (!topMatch || topMatch.similarity < 0.4) {
      throw Object.assign(
        new Error(`No customer matching "${name}" was found in the ledger.`),
        { code: "CUSTOMER_NOT_FOUND", intent },
      );
    }
    customer = topMatch.customer;
    suggestions = matches.slice(1).map((m) => m.customer);
  }

  const balance = await getCustomerBalance(customer.id);

  const purchases = await listPurchases({ customerId: customer.id, limit: 100 });
  const openBills = purchases.filter((p) => p.kind === "debt" && !p.settled);

  // Send bills summary over WhatsApp when possible.
  let messagingResult: SendResult | null = null;
  if (customer.whatsappNumber && isTwilioConfigured()) {
    messagingResult = await sendBillsSummary(
      customer.whatsappNumber,
      customer.name,
      openBills.map((b) => ({
        amount: b.amount,
        createdAt: b.createdAt,
        ...(b.notes ? { notes: b.notes } : {}),
      })),
      balance.totalOwed,
    );
  }

  return {
    action: "query_bills",
    intent,
    customer,
    purchase: null,
    balance,
    customerCreated: false,
    bills: openBills,
    customerSuggestions: suggestions,
    messaging: toMessagingStatus(
      "bills_summary",
      customer.whatsappNumber ?? null,
      messagingResult,
    ),
    supplierPayment: null,
    supplierCredit: null,
    cashSale: null,
    disambiguation: null,
  };
}

/* -------------------------------------------------------------------------- */
/*  Action: purchase / payment                                                */
/* -------------------------------------------------------------------------- */

async function handlePurchaseOrPayment(
  intent: GeminiIntent,
  opts: { forcedCustomer?: CustomerView } = {},
): Promise<VoiceIntentResult> {
  const items = coerceItems(intent);
  const kind = inferKind(intent);
  const amount = amountFromIntent(intent, items);
  if (amount <= 0) {
    throw Object.assign(
      new Error(
        "Couldn't extract an amount from the audio. Please include a price.",
      ),
      { code: "MISSING_AMOUNT", intent },
    );
  }

  const name = intent.customerName!.trim();
  const normalizedPhone = normalizeWhatsAppNumber(intent.whatsappNumber);

  let customer: CustomerView;
  let created: boolean;
  let suggestions: CustomerView[];

  if (opts.forcedCustomer) {
    customer = opts.forcedCustomer;
    created = false;
    suggestions = [];
  } else {
    const ambiguous = await findAmbiguousCandidates(name);
    if (ambiguous) {
      return makeDisambiguationResult(
        intent,
        ambiguous,
        intent.action === "payment" ? "payment" : "purchase",
      );
    }
    const resolved = await resolveOrCreateCustomer(
      name,
      normalizedPhone ? { whatsappNumber: normalizedPhone } : undefined,
    );
    customer = resolved.customer;
    created = resolved.created;
    suggestions = resolved.suggestions;
  }

  const purchase = await createPurchase({
    customerId: customer.id,
    kind,
    items,
    amount,
    ...(intent.notes ? { notes: intent.notes } : {}),
    audioTranscript: intent.transcript,
    settled: false,
  });

  const balance = await getCustomerBalance(customer.id);

  // Send receipt over WhatsApp.
  let messagingResult: SendResult | null = null;
  if (customer.whatsappNumber && isTwilioConfigured()) {
    // If this is a brand-new customer, send a welcome first so they know
    // where the follow-up message came from.
    if (created) {
      await sendWelcomeMessage(customer.whatsappNumber, customer.name);
    }
    messagingResult = await sendPurchaseReceipt(customer.whatsappNumber, {
      customerName: customer.name,
      items: purchase.items,
      amount: purchase.amount,
      kind: purchase.kind,
      totalOwed: balance.totalOwed,
    });
  }

  return {
    action: intent.action === "payment" ? "payment" : "purchase",
    intent,
    customer,
    purchase,
    balance,
    customerCreated: created,
    bills: [],
    customerSuggestions: suggestions,
    messaging: toMessagingStatus(
      "receipt",
      customer.whatsappNumber ?? null,
      messagingResult,
    ),
    supplierPayment: null,
    supplierCredit: null,
    cashSale: null,
    disambiguation: null,
  };
}

/* -------------------------------------------------------------------------- */
/*  Commit after disambiguation                                               */
/* -------------------------------------------------------------------------- */

/**
 * Re-run a previously-paused intent with the customer the shopkeeper
 * explicitly picked on the disambiguation screen. The original Gemini
 * `intent` is echoed back from the client verbatim — we don't re-call
 * Gemini — and the fuzzy resolver is bypassed entirely.
 *
 * Only purchase / payment / query_bills can be disambiguated; the other
 * actions either don't touch customers or explicitly add new ones.
 */
export async function commitVoiceIntent(args: {
  intent: GeminiIntent;
  customerId: string;
}): Promise<VoiceIntentResult> {
  const customer = await getCustomerById(args.customerId);
  if (!customer) {
    throw Object.assign(
      new Error("The chosen customer no longer exists."),
      { code: "CUSTOMER_NOT_FOUND" },
    );
  }

  switch (args.intent.action) {
    case "purchase":
    case "payment":
      return handlePurchaseOrPayment(args.intent, { forcedCustomer: customer });
    case "query_bills":
      return handleQueryBills(args.intent, { forcedCustomer: customer });
    default:
      throw Object.assign(
        new Error(`Action "${args.intent.action}" cannot be disambiguated.`),
        { code: "UNEXPECTED_ACTION" },
      );
  }
}

/* -------------------------------------------------------------------------- */
/*  Undo                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Undo the last voice action. The UI calls this when the owner taps
 * "Undo" on the confirmation screen.
 */
export async function undoVoiceIntent(purchaseId: string): Promise<boolean> {
  return deletePurchase(purchaseId);
}
