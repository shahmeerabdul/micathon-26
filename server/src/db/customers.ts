/**
 * Customer repository — MongoDB Atlas.
 *
 * Responsibilities:
 *   1. CRUD on the `customers` collection.
 *   2. Fuzzy name → customer lookup (so the voice pipeline can turn
 *      "Ahmed" into a stable `customerId` reference).
 *   3. Aggregate the running balance from the `purchases` ledger.
 *
 * Index strategy (created lazily on first use):
 *   - `name` (text) for Atlas/Mongo text search.
 *   - `aliases` (multikey) for matching nicknames the owner records
 *     over time.
 */

import { ObjectId } from "mongodb";
import { getCollection } from "./mongo";
import { deletePurchasesForCustomer } from "./purchases";
import {
  CustomerSchema,
  type CustomerDoc,
  type CustomerInput,
  type CustomerView,
  customerToView,
} from "./schemas";

const COLLECTION = "customers";

let indexesEnsured = false;
async function ensureIndexes() {
  if (indexesEnsured) return;
  const col = await getCollection<CustomerDoc>(COLLECTION);

  // Heal the whatsappNumber index. Early versions of this code created a
  // plain `unique` index (no sparse / partial filter), which treats a
  // missing OR null value as a real key and rejects the second customer
  // without a phone number. `createIndex` is a no-op when a same-keyed
  // index already exists, so we must drop and recreate to upgrade it.
  try {
    const existing = await col.listIndexes().toArray();
    const wa = existing.find((ix) => ix.name === "whatsapp_unique");
    const needsUpgrade =
      wa &&
      // Correct shape has a partialFilterExpression on whatsappNumber string.
      !wa.partialFilterExpression;
    if (needsUpgrade) {
      await col.dropIndex("whatsapp_unique");
    }
  } catch {
    // listIndexes can fail on a brand-new collection — that's fine, we'll
    // just create the correct index below.
  }

  await Promise.all([
    col.createIndex({ name: "text", aliases: "text" }, { name: "name_text" }),
    col.createIndex({ name: 1 }, { name: "name_asc" }),
    col.createIndex(
      { whatsappNumber: 1 },
      {
        name: "whatsapp_unique",
        unique: true,
        // Only enforce uniqueness on real phone numbers. Documents with
        // missing/null whatsappNumber are skipped entirely by this index.
        partialFilterExpression: { whatsappNumber: { $type: "string" } },
      },
    ),
  ]);
  indexesEnsured = true;
}

/* -------------------------------------------------------------------------- */
/*  Fuzzy matching                                                            */
/* -------------------------------------------------------------------------- */

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

/** Dice-coefficient bigram similarity — cheap, symmetric, good for names. */
function dice(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (s: string) => {
    const out = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      out.set(g, (out.get(g) ?? 0) + 1);
    }
    return out;
  };
  const ga = bigrams(a);
  const gb = bigrams(b);
  let intersection = 0;
  for (const [g, count] of ga) {
    const other = gb.get(g);
    if (other) intersection += Math.min(count, other);
  }
  return (2 * intersection) / (a.length - 1 + b.length - 1);
}

function scoreName(query: string, name: string, aliases: string[]): number {
  const q = normalize(query);
  const candidates = [name, ...aliases].map(normalize).filter(Boolean);
  let best = 0;
  for (const c of candidates) {
    if (!c) continue;
    if (c.includes(q) || q.includes(c)) {
      best = Math.max(best, 0.95);
      continue;
    }
    // First-token startsWith bonus.
    const firstTokenMatch =
      c.split(/\s+/).some((tok) => tok.startsWith(q)) ||
      q.split(/\s+/).some((tok) => c.startsWith(tok));
    const base = dice(q, c);
    best = Math.max(best, firstTokenMatch ? Math.max(base, 0.88) : base);
  }
  return best;
}

/* -------------------------------------------------------------------------- */
/*  Queries                                                                   */
/* -------------------------------------------------------------------------- */

export async function listCustomers(): Promise<CustomerView[]> {
  await ensureIndexes();
  const col = await getCollection<CustomerDoc>(COLLECTION);
  const docs = await col.find({}).sort({ name: 1 }).toArray();
  return docs.map(customerToView);
}

export async function getCustomerById(
  id: string,
): Promise<CustomerView | null> {
  if (!ObjectId.isValid(id)) return null;
  await ensureIndexes();
  const col = await getCollection<CustomerDoc>(COLLECTION);
  const doc = await col.findOne({ _id: new ObjectId(id) });
  return doc ? customerToView(doc) : null;
}

export interface MatchedCustomer {
  customer: CustomerView;
  similarity: number;
}

/**
 * Resolve a free-text name (from Gemini output) to the most likely existing
 * customer. Returns the top match along with a similarity score in 0..1.
 * Callers typically accept >=0.7 automatically and surface the rest as
 * "did you mean" suggestions.
 */
export async function findCustomerByName(
  query: string,
  opts?: { limit?: number; threshold?: number },
): Promise<MatchedCustomer[]> {
  const limit = opts?.limit ?? 5;
  const threshold = opts?.threshold ?? 0.3;
  const q = query.trim();
  if (!q) return [];
  await ensureIndexes();

  const col = await getCollection<CustomerDoc>(COLLECTION);
  // Pull a narrow candidate set via Mongo's text index first (cheap); fall
  // back to the full collection when the text query returns nothing (common
  // with 1–2 character queries). For a single-owner shop this is never
  // more than a few hundred docs so the full scan is still ~instant.
  let candidates = await col
    .find({ $text: { $search: q } })
    .limit(50)
    .toArray();
  if (candidates.length === 0) {
    candidates = await col.find({}).toArray();
  }

  const scored = candidates
    .map<MatchedCustomer>((doc) => ({
      customer: customerToView(doc),
      similarity: scoreName(q, doc.name, doc.aliases),
    }))
    .filter((m) => m.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
  return scored;
}

/* -------------------------------------------------------------------------- */
/*  Mutations                                                                 */
/* -------------------------------------------------------------------------- */

export async function upsertCustomerByName(
  rawInput: CustomerInput,
): Promise<{ customer: CustomerView; created: boolean }> {
  await ensureIndexes();
  const input = CustomerSchema.parse(rawInput);
  const col = await getCollection<CustomerDoc>(COLLECTION);
  const now = new Date();

  // ── PHONE-FIRST LOOKUP ────────────────────────────────────────────────
  // If the caller supplied a whatsappNumber, we MUST check for a doc with
  // that exact number before doing anything else. Otherwise a slightly
  // different spelling from Gemini ("Ahmad" vs "Ahmed Raza") slides past
  // the fuzzy name lookup and we try to insert a second row with the
  // same phone — which the `whatsapp_unique` partial index rejects with
  // E11000. Phones are unique in real life, so if the number already
  // exists, that's definitively the same person.
  if (input.whatsappNumber) {
    const byPhone = await col.findOne({
      whatsappNumber: input.whatsappNumber,
    });
    if (byPhone) {
      // Collect any new aliases we haven't seen before — this way the
      // next voice command with the new spelling matches immediately via
      // the text index, no more phone-collision surprises.
      const knownNames = new Set(
        [byPhone.name, ...byPhone.aliases].map((s) => s.toLowerCase().trim()),
      );
      const extraAliases = [input.name, ...input.aliases].filter(
        (n) => n && !knownNames.has(n.toLowerCase().trim()),
      );
      if (extraAliases.length > 0) {
        await col.updateOne(
          { _id: byPhone._id },
          {
            $addToSet: { aliases: { $each: extraAliases } },
            $set: { updatedAt: now },
          },
        );
      }
      const refreshed = await col.findOne({ _id: byPhone._id });
      return { customer: customerToView(refreshed!), created: false };
    }
  }

  // ── NAME LOOKUP (fallback) ───────────────────────────────────────────
  // No matching phone (or no phone supplied) — try fuzzy-matching by
  // name. Threshold 0.85 so near-exact duplicates still collapse.
  const existing = await findCustomerByName(input.name, {
    limit: 1,
    threshold: 0.85,
  });
  if (existing.length > 0 && existing[0]) {
    const match = existing[0].customer;
    // Backfill the phone on the existing record when we had none stored.
    if (input.whatsappNumber && !match.whatsappNumber) {
      await col.updateOne(
        { _id: new ObjectId(match.id) },
        { $set: { whatsappNumber: input.whatsappNumber, updatedAt: now } },
      );
    }
    const doc = await col.findOne({ _id: new ObjectId(match.id) });
    return { customer: customerToView(doc!), created: false };
  }

  // ── INSERT ───────────────────────────────────────────────────────────
  // Only write `whatsappNumber` when we actually have one. Writing
  // `undefined` (or worse, `null`) would collide with the partial unique
  // index the moment a second phone-less customer is inserted.
  const doc: CustomerDoc = {
    name: input.name,
    aliases: input.aliases,
    createdAt: now,
    updatedAt: now,
    ...(input.whatsappNumber ? { whatsappNumber: input.whatsappNumber } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
  };

  // Defence in depth: if two concurrent voice commands race and both
  // land here with the same phone, the index will still fire E11000.
  // Catch it and fall back to the phone-first lookup so the caller gets
  // a clean {customer, created:false} instead of a 500.
  try {
    const result = await col.insertOne(doc);
    return {
      customer: customerToView({ ...doc, _id: result.insertedId }),
      created: true,
    };
  } catch (err) {
    const e = err as { code?: number; keyPattern?: Record<string, number> };
    if (e.code === 11000 && e.keyPattern?.whatsappNumber && input.whatsappNumber) {
      const winner = await col.findOne({
        whatsappNumber: input.whatsappNumber,
      });
      if (winner) {
        return { customer: customerToView(winner), created: false };
      }
    }
    throw err;
  }
}

export async function updateCustomer(
  id: string,
  patch: Partial<CustomerInput>,
): Promise<CustomerView | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await getCollection<CustomerDoc>(COLLECTION);
  const parsed = CustomerSchema.partial().parse(patch);
  const res = await col.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: { ...parsed, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  return res ? customerToView(res) : null;
}

export async function deleteCustomer(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const col = await getCollection<CustomerDoc>(COLLECTION);
  const res = await col.deleteOne({ _id: new ObjectId(id) });
  return res.deletedCount === 1;
}

export async function getCustomerByWhatsAppNumber(
  whatsappNumber: string,
): Promise<CustomerView | null> {
  const trimmed = whatsappNumber.trim();
  if (!trimmed) return null;
  await ensureIndexes();
  const col = await getCollection<CustomerDoc>(COLLECTION);
  const doc = await col.findOne({ whatsappNumber: trimmed });
  return doc ? customerToView(doc) : null;
}

/** Deletes all purchases for this customer, then the customer document. */
export async function deleteCustomerCascade(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  await deletePurchasesForCustomer(id);
  return deleteCustomer(id);
}
