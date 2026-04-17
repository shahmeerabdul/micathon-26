/**
 * One-off smoke test for the encryption utility. Not wired into any test
 * runner — run with:
 *     node --experimental-strip-types server/scripts/smoke-crypto.mjs
 * or via the provided pnpm script.
 *
 * Verifies:
 *   1. create vault -> unlock round trip
 *   2. encrypt / decrypt JSON
 *   3. wrong-PIN rejection
 *   4. ciphertext is non-deterministic (fresh IV)
 */
import {
  createVault,
  unlockVault,
  encryptJson,
  decryptJson,
  sealRecord,
  openRecord,
  DecryptionError,
} from "../src/encryption.ts";

const PIN = "4729";
const BAD = "0000";

const { meta, key } = await createVault(PIN);
console.log("vault created, salt bytes (b64):", meta.salt.length);

const key2 = await unlockVault(PIN, meta);
console.log("unlock ok");

try {
  await unlockVault(BAD, meta);
  throw new Error("bad PIN should have been rejected");
} catch (e) {
  if (!(e instanceof DecryptionError)) throw e;
  console.log("bad PIN correctly rejected");
}

const sample = { id: "abc", amount: 1500, notes: "udhaar for aam" };
const blob1 = await encryptJson(sample, key);
const blob2 = await encryptJson(sample, key);
if (blob1.ciphertext === blob2.ciphertext) throw new Error("IV reuse detected");
console.log("fresh IV each encrypt ok");

const back = await decryptJson(blob1, key2);
if (JSON.stringify(back) !== JSON.stringify(sample)) throw new Error("round-trip mismatch");
console.log("json round-trip ok");

const record = {
  id: "rec_1",
  contactId: "c_1",
  amount: 500,
  date: Date.now(),
  notes: "test",
  settled: false,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};
const env = await sealRecord(record, "debt", key);
if (env.kind !== "debt" || env.id !== record.id) throw new Error("envelope meta wrong");
const opened = await openRecord(env, key);
if (JSON.stringify(opened) !== JSON.stringify(record)) throw new Error("record round-trip mismatch");
console.log("record envelope round-trip ok");

console.log("\nAll crypto smoke tests passed.");
