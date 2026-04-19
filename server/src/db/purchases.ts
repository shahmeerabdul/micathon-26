/**
 * Purchase repository — MongoDB Atlas.
 *
 * Stores every "Ahmed took X for Rs. Y" event the voice pipeline produces,
 * plus any manual adjustments. Each purchase references a customer by
 * ObjectId so outstanding-balance queries are a single aggregation.
 *
 * Index strategy:
 *   - `customerId + createdAt` compound for the contact timeline view.
 *   - `settled + kind` for dashboards ("unpaid debts").
 */

import { ObjectId } from "mongodb";
import { getCollection } from "./mongo";
import {
  PurchaseSchema,
  purchaseToView,
  type PurchaseDoc,
  type PurchaseInput,
  type PurchaseView,
} from "./schemas";

const COLLECTION = "purchases";

let indexesEnsured = false;
async function ensureIndexes() {
  if (indexesEnsured) return;
  const col = await getCollection<PurchaseDoc>(COLLECTION);
  await Promise.all([
    col.createIndex(
      { customerId: 1, createdAt: -1 },
      { name: "customer_timeline" },
    ),
    col.createIndex({ settled: 1, kind: 1 }, { name: "dashboard_filter" }),
    col.createIndex({ createdAt: -1 }, { name: "recent" }),
  ]);
  indexesEnsured = true;
}

/* -------------------------------------------------------------------------- */
/*  Queries                                                                   */
/* -------------------------------------------------------------------------- */

export async function listPurchases(
  opts?: { customerId?: string; limit?: number },
): Promise<PurchaseView[]> {
  await ensureIndexes();
  const col = await getCollection<PurchaseDoc>(COLLECTION);
  const filter: Record<string, unknown> = {};
  if (opts?.customerId && ObjectId.isValid(opts.customerId)) {
    filter.customerId = new ObjectId(opts.customerId);
  }
  const docs = await col
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(opts?.limit ?? 100)
    .toArray();
  return docs.map(purchaseToView);
}

export async function getPurchaseById(
  id: string,
): Promise<PurchaseView | null> {
  if (!ObjectId.isValid(id)) return null;
  await ensureIndexes();
  const col = await getCollection<PurchaseDoc>(COLLECTION);
  const doc = await col.findOne({ _id: new ObjectId(id) });
  return doc ? purchaseToView(doc) : null;
}

export interface CustomerBalance {
  customerId: string;
  totalOwed: number;
  totalSpent: number;
  openCount: number;
}

/**
 * Aggregate a single customer's running balance from their purchase ledger.
 * `totalOwed` = sum of unsettled debts (minus any payments applied to them).
 * `totalSpent` = lifetime sum of cash purchases.
 */
export async function getCustomerBalance(
  customerId: string,
): Promise<CustomerBalance> {
  if (!ObjectId.isValid(customerId)) {
    return { customerId, totalOwed: 0, totalSpent: 0, openCount: 0 };
  }
  await ensureIndexes();
  const col = await getCollection<PurchaseDoc>(COLLECTION);
  const pipeline = [
    { $match: { customerId: new ObjectId(customerId) } },
    {
      $group: {
        _id: null,
        totalOwed: {
          $sum: {
            $switch: {
              branches: [
                {
                  case: {
                    $and: [{ $eq: ["$kind", "debt"] }, { $eq: ["$settled", false] }],
                  },
                  then: "$amount",
                },
                {
                  case: { $eq: ["$kind", "payment"] },
                  then: { $multiply: ["$amount", -1] },
                },
              ],
              default: 0,
            },
          },
        },
        totalSpent: {
          $sum: {
            $cond: [{ $eq: ["$kind", "cash"] }, "$amount", 0],
          },
        },
        openCount: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ["$kind", "debt"] }, { $eq: ["$settled", false] }] },
              1,
              0,
            ],
          },
        },
      },
    },
  ];
  const [row] = await col.aggregate(pipeline).toArray();
  return {
    customerId,
    totalOwed: Math.max(0, (row?.totalOwed as number) ?? 0),
    totalSpent: (row?.totalSpent as number) ?? 0,
    openCount: (row?.openCount as number) ?? 0,
  };
}

/* -------------------------------------------------------------------------- */
/*  Mutations                                                                 */
/* -------------------------------------------------------------------------- */

export async function createPurchase(
  rawInput: PurchaseInput,
): Promise<PurchaseView> {
  await ensureIndexes();
  const input = PurchaseSchema.parse(rawInput);
  if (!ObjectId.isValid(input.customerId)) {
    throw new Error("Invalid customerId");
  }
  const col = await getCollection<PurchaseDoc>(COLLECTION);
  const now = new Date();
  const doc: PurchaseDoc = {
    customerId: new ObjectId(input.customerId),
    kind: input.kind,
    items: input.items,
    amount: input.amount,
    notes: input.notes,
    audioTranscript: input.audioTranscript,
    settled: input.settled,
    createdAt: now,
    updatedAt: now,
  };
  const result = await col.insertOne(doc);
  return purchaseToView({ ...doc, _id: result.insertedId });
}

export async function markPurchaseSettled(
  id: string,
  settled: boolean,
): Promise<PurchaseView | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await getCollection<PurchaseDoc>(COLLECTION);
  const res = await col.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: { settled, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  return res ? purchaseToView(res) : null;
}

export async function deletePurchase(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const col = await getCollection<PurchaseDoc>(COLLECTION);
  const res = await col.deleteOne({ _id: new ObjectId(id) });
  return res.deletedCount === 1;
}

/** Remove every purchase row for a customer (before deleting the customer). */
export async function deletePurchasesForCustomer(
  customerId: string,
): Promise<number> {
  if (!ObjectId.isValid(customerId)) return 0;
  await ensureIndexes();
  const col = await getCollection<PurchaseDoc>(COLLECTION);
  const res = await col.deleteMany({
    customerId: new ObjectId(customerId),
  });
  return res.deletedCount;
}
