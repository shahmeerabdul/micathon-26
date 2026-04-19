/**
 * Gemini client — turns raw audio bytes into a structured `GeminiIntent`.
 *
 * Design notes:
 *   - We use the `@google/genai` SDK (Gemini 3 generation).
 *   - Short voice notes (<20 MB) are sent as `inlineData` — no Files API
 *     upload, no cleanup. 99 % of shopkeeper utterances fit easily.
 *   - We constrain Gemini's output via `responseMimeType: "application/json"`
 *     + `responseSchema`, which returns valid JSON or errors out.
 *   - Urdu/Roman-Urdu/English are all accepted; the prompt instructs
 *     Gemini to normalise customer names into a canonical form.
 */

import { GoogleGenAI, Type } from "@google/genai";
import { GeminiIntentSchema, type GeminiIntent } from "../db/schemas";
import { loadServerEnvFallback } from "../env/load-env";

let cachedClient: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  loadServerEnvFallback();
  if (cachedClient) return cachedClient;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to client/.env.local (see server/.env.example).",
    );
  }
  cachedClient = new GoogleGenAI({ apiKey });
  return cachedClient;
}

function getModelName(): string {
  return process.env.GEMINI_MODEL || "gemini-3-flash-preview";
}

const SYSTEM_PROMPT = `You are the speech-understanding module for "Khata", a voice-first
ledger app used by local shopkeepers in Pakistan. The store owner speaks
brief instructions in English, Urdu, or Roman Urdu (often mixed). You
map each utterance to ONE of eight actions for the app to execute.

EXAMPLES:

  • "Ahmed took two Lays Wave, one hundred rupees each."
       → action=purchase, customerName=Ahmed, items=[{name:"Lays Wave",quantity:2,unitPrice:100,lineTotal:200}], amount=200
  • "Ahmed ne do lays kharide, har ek sau rupay ka."
       → action=purchase, customerName=Ahmed, amount=200
  • "Add 800 rupees to Shahmeer's debt." / "Shahmeer ki udhaar mein 800 add kar do." / "Shahmeer ke account pe 800 aur chadha do."
       → action=purchase, customerName=Shahmeer, amount=800
  • "Sara paid back three hundred rupees."
       → action=payment, customerName=Sara, amount=300
  • "I paid Bilal Wholesale eight thousand rupees." / "Maine Bilal Wholesale ko 8000 rupay diye."
       → action=supplier_payment, supplierName="Bilal Wholesale", amount=8000
  • "Paid the supplier 5000." / "Supplier ko 5000 rupay de diye."
       → action=supplier_payment, supplierName="supplier", amount=5000
  • "Add 5000 to Bilal Wholesale." / "Bilal Wholesale ki khaate mein 5000 aur add karo." / "Bilal Wholesale se 5000 ka maal aaya, paisay nahi diye."
       → action=supplier_credit, supplierName="Bilal Wholesale", amount=5000
  • "I owe the wholesaler 3000 more." / "Wholesaler ko 3000 aur dena hai." / "Supplier ne 3000 ka udhaar de diya."
       → action=supplier_credit, supplierName="wholesaler", amount=3000
  • "I did sales of 500 rupees today." / "Aaj 500 rupay ki bikri hui." / "Today's sales are 500."
       → action=cash_sale, amount=500
  • "Bilal is a new customer, his number is 03001234567."
       → action=new_customer, customerName=Bilal, whatsappNumber=03001234567
  • "Zainab naya customer hai, uska number zero three double one, two three four, five six seven eight nine is."
       → action=new_customer, customerName=Zainab, whatsappNumber=03112345678
  • "Show me all bills of Ahmed." / "Ahmed ka hisaab dikhao."
       → action=query_bills, customerName=Ahmed

RULES:

1.  Choose exactly ONE action:
      - "purchase"         — customer bought items from the shop, OR the
                             owner is ADDING to a customer's running debt
                             (udhaar/bakaya). Default for sales — assume
                             credit/debt unless the owner explicitly says
                             "paid cash" / "naqad". Cues for adding to an
                             existing tab: "add X to <name>'s debt",
                             "<name> ki udhaar mein X chadha do",
                             "<name> ke account pe X aur add kar do".
      - "payment"          — a CUSTOMER paid money BACK to the shopkeeper
                             toward an existing tab. Money flows INTO the
                             shop. Cues: "<name> paid back", "<name> ne
                             mujhe diye", "<name> ne bakaya clear kiya".
      - "supplier_payment" — the SHOPKEEPER paid money OUT to a wholesaler /
                             supplier / distributor. Money flows OUT of
                             the shop and REDUCES the payable owed to
                             them. Use "supplierName" (NOT
                             "customerName") for the recipient.
                             REQUIREMENTS — use ONLY when BOTH hold:
                               (a) the sentence uses a supplier cue verb:
                                   "paid the supplier", "paid <X>",
                                   "maine <X> ko diye", "<X> ko ada kar
                                   diye", "<X> ko pay kiya", AND
                               (b) the recipient name contains a business
                                   qualifier: "wholesale", "wholesaler",
                                   "distributor", "supplier", "company",
                                   "store", "traders", "trading", "corp",
                                   "ltd", OR is the literal word
                                   "supplier" / "wholesaler".
                             If the recipient is a bare personal name
                             (e.g. "Shahmeer", "Ahmed", "Bilal") with NO
                             business qualifier, this is NOT a supplier
                             payment — it's either a "purchase" (adding
                             to their debt) or a "payment" (they paid
                             you). When in doubt between the three, prefer
                             "purchase".
      - "supplier_credit"  — the SHOPKEEPER took MORE stock / money on
                             credit from a wholesaler / supplier without
                             paying (or only partially). This INCREASES
                             what the shop owes them. Use "supplierName"
                             (NOT "customerName"). Money flows OUT of
                             the supplier INTO the shop as goods/credit.
                             REQUIREMENTS — use ONLY when BOTH hold:
                               (a) the sentence uses an "add to tab /
                                   received goods / owe more" cue:
                                   "add <X> to <name>", "<name> ki khaate
                                   mein <X> chadha do", "<name> se <X> ka
                                   maal aaya", "got stock from <name>
                                   worth <X>", "<name> ko <X> aur dena
                                   hai", "supplier ne <X> ka udhaar de
                                   diya", AND
                               (b) the name contains the SAME business
                                   qualifier list as supplier_payment
                                   (wholesale / wholesaler / distributor /
                                   supplier / company / store / traders /
                                   trading / corp / ltd), OR is the
                                   literal word "supplier" / "wholesaler".
                             Same bare-name rule as above: "add 800 to
                             Shahmeer" is a purchase (customer tab), NOT
                             supplier_credit.
      - "cash_sale"        — owner is logging bulk / anonymous cash sales
                             for the day with NO specific customer named.
                             Cues: "today's sales", "aaj ki bikri",
                             "sales of <N> rupees today", "<N> ki sale
                             hui". Leave customerName empty.
      - "new_customer"     — shopkeeper is registering a new customer.
                             Often includes a phone number. No purchase
                             implied.
      - "query_bills"      — shopkeeper is asking about outstanding debt /
                             bills / "hisaab" of a named customer. No write.
      - "unknown"          — you cannot confidently extract an action.

   Disambiguation cheat-sheet:
     • "I paid <BusinessQualifier+Name> <amount>"  → supplier_payment
     • "Add <amount> to <BusinessQualifier+Name>"  → supplier_credit
     • "Got stock worth <amount> from <BusinessQualifier+Name>" → supplier_credit
     • "I paid <bare first name> <amount>"         → purchase (adding to
                                                     that customer's tab)
     • "Add <amount> to <bare first name>'s debt"  → purchase
     • "<name> paid me <amount>" / "<name> ne diye" → payment
     • "Today's sales are <amount>" (no name)      → cash_sale

2.  "customerName" is the PERSON the command is about, normalised:
      - Capitalise first letter of each word ("ahmed" → "Ahmed").
      - Strip honorifics like "bhai", "sahab", "mr." unless clearly part
        of the name.
      - Prefer the shortest unambiguous form the owner used.

3.  "whatsappNumber" is ONLY for "new_customer" actions (or when the
    owner explicitly dictates a number for an existing customer). Return
    whatever digits you hear, in the same form — we will normalise them
    server-side. Pakistan numbers usually start with 03xx (10-11 digits).

4.  "items" is the list of goods for purchases. Each item needs a clean
    "name" (e.g. "Lays Wave"), integer "quantity" (default 1), and — if
    mentioned — "unitPrice" and "lineTotal" in INTEGER rupees (PKR).
    When only a total is mentioned, leave unitPrice blank and set
    lineTotal equal to the total. For non-purchase actions, leave items
    empty.

5.  "amount" is the grand total in INTEGER rupees for purchases and
    payments. Zero for new_customer/query_bills/unknown.

6.  "transcript" is a faithful verbatim transcription of the audio, in
    the same language the owner used. Do NOT translate it.

7.  "confidence" is YOUR self-rated 0..1 score for the extracted
    structure. Use < 0.5 when you had to guess.

Return ONLY the JSON object — no commentary, no markdown fences.`;

// Gemini's responseSchema uses its own Type enum, not JSON Schema.
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    transcript: { type: Type.STRING },
    language: { type: Type.STRING },
    action: {
      type: Type.STRING,
      enum: [
        "purchase",
        "payment",
        "new_customer",
        "query_bills",
        "supplier_payment",
        "supplier_credit",
        "cash_sale",
        "unknown",
      ],
    },
    customerName: { type: Type.STRING },
    supplierName: { type: Type.STRING },
    whatsappNumber: { type: Type.STRING },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          quantity: { type: Type.INTEGER },
          unitPrice: { type: Type.INTEGER },
          lineTotal: { type: Type.INTEGER },
        },
        required: ["name"],
      },
    },
    amount: { type: Type.INTEGER },
    notes: { type: Type.STRING },
    confidence: { type: Type.NUMBER },
  },
  required: ["transcript", "action", "amount", "confidence"],
} as const;

export interface TranscribeOptions {
  /** Raw audio bytes from the browser MediaRecorder (or Buffer on Node). */
  audio: Buffer | Uint8Array;
  /** MIME type of the audio — e.g. "audio/webm", "audio/mp4", "audio/ogg". */
  mimeType: string;
  /** Optional extra context appended to the system prompt (e.g. known contacts). */
  context?: string;
}

/**
 * Transcribe + parse in a single Gemini call.
 * Throws on API errors or if the response fails schema validation.
 */
export async function transcribeAndParse(
  opts: TranscribeOptions,
): Promise<GeminiIntent> {
  const client = getClient();
  const base64 = Buffer.from(opts.audio).toString("base64");

  const userText =
    (opts.context ? `Known context:\n${opts.context}\n\n` : "") +
    "Listen to the audio and return the JSON record.";

  // Hard cap the upstream call so the UI can fail fast instead of hanging
  // ~2 minutes on flaky networks / slow preview models. 45 s is well above
  // a healthy Flash round-trip but well below our users' patience.
  const GEMINI_TIMEOUT_MS = 45_000;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), GEMINI_TIMEOUT_MS);

  let response;
  try {
    response = await client.models.generateContent({
      model: getModelName(),
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: opts.mimeType, data: base64 } },
            { text: userText },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.1, // Deterministic-ish; structure matters more than creativity.
        abortSignal: abort.signal,
      },
    });
  } catch (err) {
    const cause = (err as { cause?: { code?: string } })?.cause;
    if (abort.signal.aborted) {
      throw Object.assign(
        new Error(
          `Gemini request timed out after ${GEMINI_TIMEOUT_MS / 1000}s. ` +
            "Check your network — generativelanguage.googleapis.com may be blocked, " +
            "or try GEMINI_MODEL=gemini-2.5-flash in client/.env.local.",
        ),
        { code: "GEMINI_TIMEOUT" },
      );
    }
    if (cause?.code === "ECONNRESET" || cause?.code === "ETIMEDOUT") {
      throw Object.assign(
        new Error(
          `Network reset while talking to Gemini (${cause.code}). ` +
            "Your Wi-Fi/ISP likely throttles Google APIs — try a different network or a VPN.",
        ),
        { code: "GEMINI_NETWORK" },
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  const raw = response.text;
  if (!raw) {
    throw new Error("Gemini returned an empty response.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `Gemini returned non-JSON despite the schema constraint:\n${raw.slice(0, 500)}`,
    );
  }

  const result = GeminiIntentSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Gemini output failed validation: ${result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }
  return result.data;
}
