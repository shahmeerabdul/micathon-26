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
} from "./types";
import { parseIntent as heuristicParseIntent } from "./intent";
import { matchContacts } from "./fuzzy";

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
