/**
 * MongoDB document shapes + zod schemas.
 *
 * Keep document types DISTINCT from the domain types in `../types.ts`:
 *   - Domain types use UUIDv4 strings (generated client-side, for the
 *     offline-first local vault). Mongo documents use ObjectId string
 *     projections (serializable to JSON) for the server-backed path.
 *   - The purchase document is an aggregated record that mirrors the
 *     "sale" + "debt" semantics of the UI — one row covers "Ahmed took
 *     lays wave costing Rs. 100" whether the store owner intends it as
 *     an immediate cash sale or a debt-on-tab.
 */

import { z } from "zod";
import { ObjectId } from "mongodb";

// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------

export const CustomerSchema = z.object({
  name: z.string().trim().min(1, "name is required"),
  whatsappNumber: z
    .string()
    .trim()
    .regex(/^\+92\d{10}$/, "whatsappNumber must be E.164 Pakistan format")
    .optional(),
  /** Free-text aliases Gemini may have heard (e.g. "Ahmad", "Ahmed Bhai"). */
  aliases: z.array(z.string().trim()).default([]),
  notes: z.string().optional(),
});
export type CustomerInput = z.infer<typeof CustomerSchema>;

export interface CustomerDoc {
  _id?: ObjectId;
  name: string;
  whatsappNumber?: string;
  aliases: string[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerView {
  id: string;
  name: string;
  whatsappNumber?: string;
  aliases: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
  /** Running totals projected from the purchase ledger. */
  totalOwed?: number;
  totalSpent?: number;
}

export function customerToView(doc: CustomerDoc): CustomerView {
  return {
    id: doc._id!.toHexString(),
    name: doc.name,
    whatsappNumber: doc.whatsappNumber,
    aliases: doc.aliases,
    notes: doc.notes,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Purchase (a single "Ahmed took X for Rs. Y" event)
// ---------------------------------------------------------------------------

export const PurchaseItemSchema = z.object({
  name: z.string().trim().min(1),
  quantity: z.number().int().positive().default(1),
  unitPrice: z.number().int().nonnegative().default(0),
  lineTotal: z.number().int().nonnegative(),
});
export type PurchaseItemInput = z.infer<typeof PurchaseItemSchema>;

/**
 * A purchase can be either:
 *   - "debt"  → customer took on credit (default when store owner says
 *               "took", "udhaar", "kata", or amount without explicit
 *               payment cue).
 *   - "cash"  → customer paid right away.
 *   - "payment" → customer paid back toward their tab (reduces owed).
 */
export const PurchaseKindEnum = z.enum(["debt", "cash", "payment"]);
export type PurchaseKind = z.infer<typeof PurchaseKindEnum>;

export const PurchaseSchema = z.object({
  customerId: z.string().min(1), // hex string of Mongo ObjectId
  kind: PurchaseKindEnum.default("debt"),
  items: z.array(PurchaseItemSchema).default([]),
  amount: z.number().int().positive(),
  notes: z.string().optional(),
  /** Raw transcript text Gemini produced from the audio (audit trail). */
  audioTranscript: z.string().optional(),
  /** True once the debt portion has been fully paid back. */
  settled: z.boolean().default(false),
});
export type PurchaseInput = z.infer<typeof PurchaseSchema>;

export interface PurchaseDoc {
  _id?: ObjectId;
  customerId: ObjectId;
  kind: PurchaseKind;
  items: PurchaseItemInput[];
  amount: number;
  notes?: string;
  audioTranscript?: string;
  settled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PurchaseView {
  id: string;
  customerId: string;
  kind: PurchaseKind;
  items: PurchaseItemInput[];
  amount: number;
  notes?: string;
  audioTranscript?: string;
  settled: boolean;
  createdAt: string;
  updatedAt: string;
}

export function purchaseToView(doc: PurchaseDoc): PurchaseView {
  return {
    id: doc._id!.toHexString(),
    customerId: doc.customerId.toHexString(),
    kind: doc.kind,
    items: doc.items,
    amount: doc.amount,
    notes: doc.notes,
    audioTranscript: doc.audioTranscript,
    settled: doc.settled,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Gemini structured output schema
// ---------------------------------------------------------------------------

/**
 * The exact JSON shape Gemini is forced to return. Expanded to support
 * four action types that map to tool-like operations:
 *   - "purchase"     — customer bought items (debt or cash).
 *   - "payment"      — customer paid money back toward an existing tab.
 *   - "new_customer" — register a new customer (with optional phone).
 *   - "query_bills"  — show the outstanding bills for a customer.
 *   - "unknown"      — couldn't confidently extract an action.
 *
 * Amounts are integer PKR. Phone numbers may be in any form the shop
 * owner speaks; we normalise them to E.164 server-side.
 */
export const GeminiIntentSchema = z.object({
  transcript: z.string(),
  language: z.string().default("ur-PK"),
  action: z.enum([
    "purchase",
    "payment",
    "new_customer",
    "query_bills",
    "supplier_payment",
    "supplier_credit",
    "cash_sale",
    "unknown",
  ]),
  customerName: z.string().optional(),
  /** Wholesaler/supplier name for `supplier_payment` or `supplier_credit`. */
  supplierName: z.string().optional(),
  whatsappNumber: z.string().optional(),
  items: z.array(PurchaseItemSchema.partial({ unitPrice: true, lineTotal: true })).default([]),
  amount: z.number().int().nonnegative().default(0),
  notes: z.string().optional(),
  confidence: z.number().min(0).max(1).default(0.5),
});
export type GeminiIntent = z.infer<typeof GeminiIntentSchema>;
