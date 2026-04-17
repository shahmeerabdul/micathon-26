/**
 * Shared type definitions for the Voice Khata app.
 *
 * Import surface for the frontend:
 *     import type { Contact, Debt, Payable, Sale, ParsedIntent } from "@khata/server/types";
 *
 * Design invariants:
 *   - All monetary values are stored as integers in PKR (Pakistani Rupees).
 *     The app does not deal in paisa (sub-rupee) amounts; shopkeepers transact
 *     in whole rupees at MVP scope.
 *   - All timestamps are unix epoch milliseconds (UTC).
 *   - `id` fields are opaque client-generated UUIDv4 strings.
 *   - Records are NEVER persisted in plaintext. They are wrapped in
 *     `EncryptedRecord` envelopes (see `encryption.ts`) before hitting
 *     IndexedDB. Only the minimal indexing metadata (id, kind, updatedAt)
 *     is stored in plaintext.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Client-generated UUIDv4. */
export type Id = string;

/** Unix epoch milliseconds (UTC). */
export type EpochMs = number;

/**
 * Pakistan mobile phone number in canonical E.164 format: `+923XXXXXXXXX`.
 * Validation helpers live in `lib/validation.ts` (forthcoming) — frontend
 * should call `normalizePakistanPhone()` before handing numbers to server actions.
 */
export type PakistanPhone = `+92${string}`;

/** PKR whole rupees, non-negative integer. */
export type RupeeAmount = number;

// ---------------------------------------------------------------------------
// Core domain records
// ---------------------------------------------------------------------------

export interface Contact {
  id: Id;
  name: string;
  phone: PakistanPhone;
  createdAt: EpochMs;
  updatedAt: EpochMs;
}

/**
 * A "kata" entry — money owed TO the shopkeeper BY a customer (udhaar).
 * `settled = true` means the debt has been fully paid back.
 */
export interface Debt {
  id: Id;
  contactId: Id;
  amount: RupeeAmount;
  date: EpochMs;
  notes?: string;
  settled: boolean;
  createdAt: EpochMs;
  updatedAt: EpochMs;
}

/**
 * Money the shopkeeper owes TO a wholesaler/supplier.
 * Wholesalers are tracked by loose name (not full Contact records)
 * because they are B2B relationships, often with no phone on file.
 */
export interface Payable {
  id: Id;
  wholesalerName: string;
  amount: RupeeAmount;
  date: EpochMs;
  notes?: string;
  paid: boolean;
  createdAt: EpochMs;
  updatedAt: EpochMs;
}

export interface SaleItem {
  name: string;
  quantity: number;
  unitPrice: RupeeAmount;
  lineTotal: RupeeAmount;
}

export interface Sale {
  id: Id;
  /** Optional — walk-in cash sales have no contact. */
  customerContactId?: Id;
  items: SaleItem[];
  total: RupeeAmount;
  date: EpochMs;
  notes?: string;
  createdAt: EpochMs;
  updatedAt: EpochMs;
}

// ---------------------------------------------------------------------------
// Union helpers
// ---------------------------------------------------------------------------

export type RecordKind = "contact" | "debt" | "payable" | "sale";

export type RecordOfKind<K extends RecordKind> = K extends "contact"
  ? Contact
  : K extends "debt"
    ? Debt
    : K extends "payable"
      ? Payable
      : K extends "sale"
        ? Sale
        : never;

export type AnyRecord = Contact | Debt | Payable | Sale;

// ---------------------------------------------------------------------------
// Encryption envelope (stored shape in IndexedDB)
// ---------------------------------------------------------------------------

/**
 * Every record on disk is wrapped like this. Only `id`, `kind`, and
 * `updatedAt` are plaintext (required for indexing + list queries).
 * The real record sits inside `ciphertext` as an AES-GCM blob.
 */
export interface EncryptedRecord {
  id: Id;
  kind: RecordKind;
  updatedAt: EpochMs;
  /** base64-encoded AES-GCM ciphertext of `JSON.stringify(record)`. */
  ciphertext: string;
  /** base64-encoded 12-byte IV used for this blob. */
  iv: string;
  /** Crypto schema version — bumped if we ever rotate algorithms. */
  v: 1;
}

/**
 * Metadata kept in a dedicated IndexedDB store to bootstrap the vault.
 * None of these fields are secret.
 */
export interface VaultMeta {
  /** base64-encoded 16-byte PBKDF2 salt. */
  salt: string;
  /** PBKDF2 iteration count at the time the vault was created. */
  iterations: number;
  /**
   * Encrypted magic string used to verify the PIN without decrypting any
   * real records. If `decrypt(verifier)` equals the expected magic, PIN is correct.
   */
  verifier: { ciphertext: string; iv: string };
  createdAt: EpochMs;
  v: 1;
}

// ---------------------------------------------------------------------------
// LLM parser contract
// ---------------------------------------------------------------------------

/**
 * The LLM must return exactly one of these shapes. This is enforced
 * by a zod schema in `server/src/actions/parser.ts`.
 *
 * `contactName` is used (rather than `contactId`) because the LLM sees
 * names in the user's speech, not opaque ids. The confirmation action
 * resolves names -> ids via fuzzy match.
 */
export type ParsedIntent =
  | {
      action: "add_contact";
      payload: {
        name: string;
        phone?: string;
      };
      confidence: number;
    }
  | {
      action: "add_debt";
      payload: {
        contactName: string;
        contactPhone?: string;
        amount: RupeeAmount;
        notes?: string;
        date?: EpochMs;
      };
      confidence: number;
    }
  | {
      action: "settle_debt";
      payload: {
        contactName: string;
        amount?: RupeeAmount;
        notes?: string;
      };
      confidence: number;
    }
  | {
      action: "add_payable";
      payload: {
        wholesalerName: string;
        amount: RupeeAmount;
        notes?: string;
        date?: EpochMs;
      };
      confidence: number;
    }
  | {
      action: "add_sale";
      payload: {
        customerName?: string;
        items: SaleItem[];
        total: RupeeAmount;
        notes?: string;
      };
      confidence: number;
    }
  | {
      action: "unknown";
      payload: {
        reason: string;
        rawText: string;
      };
      confidence: number;
    };

export type IntentAction = ParsedIntent["action"];

// ---------------------------------------------------------------------------
// Server action wire types
// ---------------------------------------------------------------------------

/**
 * Standard discriminated-union result shape returned by every server action.
 * Keeps error handling uniform on the frontend.
 */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: ActionErrorCode };

export type ActionErrorCode =
  | "MISSING_API_KEY"
  | "UPSTREAM_FAILURE"
  | "INVALID_INPUT"
  | "PARSE_FAILURE"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "INTERNAL";

// STT ----------------------------------------------------------------------

export interface STTInput {
  /** base64-encoded audio payload (webm/opus, wav, or mp3). */
  audioBase64: string;
  mimeType: string;
  /** BCP-47 language hint. Default `"ur-PK"`. */
  language?: string;
}

export interface STTResult {
  text: string;
  language: string;
  durationMs?: number;
}

// WhatsApp ------------------------------------------------------------------

export interface WhatsAppSendInput {
  /** Recipient phone in E.164 (Pakistan format). */
  to: PakistanPhone;
  /** Plaintext message body. Composed client-side after decrypting the sale. */
  message: string;
}

export interface WhatsAppSendResult {
  messageId: string;
  to: PakistanPhone;
  sentAt: EpochMs;
}

// Confirmation flow ---------------------------------------------------------

/**
 * Frontend renders a confirmation UI based on this structured payload.
 * `summary` is a short human-readable description (English) that the
 * frontend may localize to Urdu/Roman Urdu at render time.
 */
export interface ConfirmationPayload {
  intent: ParsedIntent;
  summary: string;
  /** Fuzzy-matched candidates when the intent references a contact by name. */
  suggestedContactMatches?: ContactMatch[];
  /**
   * If the intent implies writing a new record, this is a
   * draft record (client fills id/timestamps) shown for review.
   */
  draftRecord?: DraftRecord;
  /**
   * When true, the frontend should auto-commit without asking —
   * used for high-confidence, low-risk intents. MVP keeps this `false`.
   */
  autoConfirm: boolean;
}

export interface ContactMatch {
  contactId: Id;
  name: string;
  /** 0..1 — higher is better. */
  similarity: number;
}

export type DraftRecord =
  | { kind: "contact"; value: Omit<Contact, "id" | "createdAt" | "updatedAt"> }
  | { kind: "debt"; value: Omit<Debt, "id" | "createdAt" | "updatedAt" | "settled"> & { settled?: boolean } }
  | { kind: "payable"; value: Omit<Payable, "id" | "createdAt" | "updatedAt" | "paid"> & { paid?: boolean } }
  | { kind: "sale"; value: Omit<Sale, "id" | "createdAt" | "updatedAt"> };

// Record CRUD ---------------------------------------------------------------

/**
 * Input payloads accepted by record server actions. The server action
 * validates + normalizes, then returns a fully-formed record (with `id`
 * and timestamps). The frontend then encrypts and persists it locally.
 */
export type NewRecordInput =
  | { kind: "contact"; value: Omit<Contact, "id" | "createdAt" | "updatedAt"> }
  | { kind: "debt"; value: Omit<Debt, "id" | "createdAt" | "updatedAt"> }
  | { kind: "payable"; value: Omit<Payable, "id" | "createdAt" | "updatedAt"> }
  | { kind: "sale"; value: Omit<Sale, "id" | "createdAt" | "updatedAt"> };

export type UpdateRecordInput =
  | { kind: "contact"; value: Contact }
  | { kind: "debt"; value: Debt }
  | { kind: "payable"; value: Payable }
  | { kind: "sale"; value: Sale };
