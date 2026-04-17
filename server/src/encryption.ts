/**
 * Client-side encryption for the Voice Khata vault.
 *
 * Threat model:
 *   - Attacker with physical access to the device (or browser storage export)
 *     must not be able to read financial records or phone numbers.
 *   - The only "secret" is the user's 4-digit PIN. Everything else (salt,
 *     verifier, iteration count) is stored in plaintext in IndexedDB.
 *
 * Crypto choices:
 *   - Key derivation: PBKDF2-HMAC-SHA256, 600,000 iterations (OWASP 2023).
 *     A 4-digit PIN has only ~13 bits of entropy, so iteration count is
 *     our ONLY line of defense against offline brute force. Keep it high.
 *   - Cipher: AES-GCM-256 with a fresh random 96-bit IV per encryption
 *     (NIST SP 800-38D compliant).
 *   - Encoding on disk: base64 for both ciphertext and IV.
 *
 * IMPORTANT: this module intentionally avoids importing anything Node-only.
 * It runs in the browser. Do NOT add `fs`/`buffer` imports; the base64
 * helpers below are isomorphic.
 */

import type { EncryptedRecord, VaultMeta } from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const CRYPTO_CONSTANTS = {
  PBKDF2_ITERATIONS: 600_000,
  PBKDF2_HASH: "SHA-256" as const,
  KEY_ALGO: { name: "AES-GCM", length: 256 } as const satisfies AesKeyAlgorithm,
  IV_LENGTH_BYTES: 12,
  SALT_LENGTH_BYTES: 16,
  VERIFIER_MAGIC: "khata-vault-v1-ok",
  SCHEMA_VERSION: 1 as const,
} as const;

const PIN_REGEX = /^\d{4}$/;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class CryptoUnavailableError extends Error {
  constructor() {
    super(
      "Web Crypto API is not available. The app must run in a secure context (HTTPS or localhost).",
    );
    this.name = "CryptoUnavailableError";
  }
}

export class InvalidPinError extends Error {
  constructor() {
    super("PIN must be exactly 4 digits.");
    this.name = "InvalidPinError";
  }
}

export class DecryptionError extends Error {
  constructor(message = "Failed to decrypt. PIN is likely incorrect, or data is corrupted.") {
    super(message);
    this.name = "DecryptionError";
  }
}

// ---------------------------------------------------------------------------
// Isomorphic base64 + random bytes
// ---------------------------------------------------------------------------

function getCrypto(): Crypto {
  const g = globalThis as { crypto?: Crypto };
  if (!g.crypto || !g.crypto.subtle) throw new CryptoUnavailableError();
  return g.crypto;
}

function getSubtle(): SubtleCrypto {
  return getCrypto().subtle;
}

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  getCrypto().getRandomValues(out);
  return out;
}

/**
 * TS 5.7 changed `Uint8Array`'s default buffer parameter, which breaks
 * assignment to `BufferSource` in Web Crypto API signatures. This helper
 * is a pure, runtime no-op cast to keep the crypto calls type-safe.
 */
function buf(u: Uint8Array): BufferSource {
  return u as unknown as BufferSource;
}

function toBase64(bytes: Uint8Array): string {
  // Prefer browser btoa; fall back to Node Buffer when running in tests.
  if (typeof btoa === "function") {
    let bin = "";
    // Chunking avoids String.fromCharCode argument-count limits on large blobs.
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
  }
  return Buffer.from(bytes).toString("base64");
}

function fromBase64(s: string): Uint8Array {
  if (typeof atob === "function") {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(s, "base64"));
}

// ---------------------------------------------------------------------------
// Vault meta — created once when the user first sets their PIN
// ---------------------------------------------------------------------------

/**
 * Derive a non-extractable AES-GCM key from the user's PIN + salt.
 * The returned CryptoKey never leaves the Web Crypto boundary.
 */
export async function deriveKey(pin: string, saltBase64: string, iterations: number): Promise<CryptoKey> {
  if (!PIN_REGEX.test(pin)) throw new InvalidPinError();
  const subtle = getSubtle();

  const pinKey = await subtle.importKey(
    "raw",
    buf(new TextEncoder().encode(pin)),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );

  return subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: buf(fromBase64(saltBase64)),
      iterations,
      hash: CRYPTO_CONSTANTS.PBKDF2_HASH,
    },
    pinKey,
    CRYPTO_CONSTANTS.KEY_ALGO,
    false, // non-extractable
    ["encrypt", "decrypt"],
  );
}

/**
 * Create a brand-new vault. Call this only once — when the user first
 * sets their PIN. Returns the vault meta to persist in IndexedDB AND
 * the derived CryptoKey to hold in memory.
 */
export async function createVault(pin: string): Promise<{ meta: VaultMeta; key: CryptoKey }> {
  if (!PIN_REGEX.test(pin)) throw new InvalidPinError();

  const salt = toBase64(randomBytes(CRYPTO_CONSTANTS.SALT_LENGTH_BYTES));
  const iterations = CRYPTO_CONSTANTS.PBKDF2_ITERATIONS;
  const key = await deriveKey(pin, salt, iterations);
  const verifier = await encryptString(CRYPTO_CONSTANTS.VERIFIER_MAGIC, key);

  const meta: VaultMeta = {
    salt,
    iterations,
    verifier,
    createdAt: Date.now(),
    v: CRYPTO_CONSTANTS.SCHEMA_VERSION,
  };

  return { meta, key };
}

/**
 * Unlock an existing vault. Returns the derived key on success, throws
 * `DecryptionError` if the PIN is wrong.
 */
export async function unlockVault(pin: string, meta: VaultMeta): Promise<CryptoKey> {
  if (!PIN_REGEX.test(pin)) throw new InvalidPinError();
  const key = await deriveKey(pin, meta.salt, meta.iterations);

  let decoded: string;
  try {
    decoded = await decryptString(meta.verifier, key);
  } catch {
    throw new DecryptionError("Incorrect PIN.");
  }
  if (decoded !== CRYPTO_CONSTANTS.VERIFIER_MAGIC) {
    throw new DecryptionError("Incorrect PIN.");
  }
  return key;
}

/**
 * Change the user's PIN. Requires the old PIN to unlock, then re-derives
 * a fresh key + fresh salt for the new PIN. Returns the new vault meta
 * and new key. The CALLER is responsible for re-encrypting every stored
 * record under the new key (see `reencryptAll()` in the store module).
 */
export async function rotatePin(
  oldPin: string,
  newPin: string,
  currentMeta: VaultMeta,
): Promise<{ newMeta: VaultMeta; oldKey: CryptoKey; newKey: CryptoKey }> {
  const oldKey = await unlockVault(oldPin, currentMeta);
  const { meta: newMeta, key: newKey } = await createVault(newPin);
  return { newMeta, oldKey, newKey };
}

// ---------------------------------------------------------------------------
// Low-level primitives: encrypt / decrypt raw strings
// ---------------------------------------------------------------------------

export interface EncryptedBlob {
  ciphertext: string; // base64
  iv: string; // base64
}

export async function encryptString(plaintext: string, key: CryptoKey): Promise<EncryptedBlob> {
  const iv = randomBytes(CRYPTO_CONSTANTS.IV_LENGTH_BYTES);
  const ct = await getSubtle().encrypt(
    { name: "AES-GCM", iv: buf(iv) },
    key,
    buf(new TextEncoder().encode(plaintext)),
  );
  return { ciphertext: toBase64(new Uint8Array(ct)), iv: toBase64(iv) };
}

export async function decryptString(blob: EncryptedBlob, key: CryptoKey): Promise<string> {
  try {
    const pt = await getSubtle().decrypt(
      { name: "AES-GCM", iv: buf(fromBase64(blob.iv)) },
      key,
      buf(fromBase64(blob.ciphertext)),
    );
    return new TextDecoder().decode(pt);
  } catch {
    throw new DecryptionError();
  }
}

// ---------------------------------------------------------------------------
// High-level helpers: JSON round-trip + record envelopes
// ---------------------------------------------------------------------------

export async function encryptJson<T>(value: T, key: CryptoKey): Promise<EncryptedBlob> {
  return encryptString(JSON.stringify(value), key);
}

export async function decryptJson<T>(blob: EncryptedBlob, key: CryptoKey): Promise<T> {
  const text = await decryptString(blob, key);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new DecryptionError("Decrypted payload was not valid JSON.");
  }
}

/**
 * Wrap a domain record into the on-disk envelope. The record's `id`,
 * `kind`, and `updatedAt` leak in plaintext (for indexing); everything
 * else is encrypted.
 */
export async function sealRecord<R extends { id: string; updatedAt: number }>(
  record: R,
  kind: EncryptedRecord["kind"],
  key: CryptoKey,
): Promise<EncryptedRecord> {
  const blob = await encryptJson(record, key);
  return {
    id: record.id,
    kind,
    updatedAt: record.updatedAt,
    ciphertext: blob.ciphertext,
    iv: blob.iv,
    v: CRYPTO_CONSTANTS.SCHEMA_VERSION,
  };
}

export async function openRecord<R>(envelope: EncryptedRecord, key: CryptoKey): Promise<R> {
  return decryptJson<R>({ ciphertext: envelope.ciphertext, iv: envelope.iv }, key);
}

// ---------------------------------------------------------------------------
// Convenience: validators
// ---------------------------------------------------------------------------

export function isValidPin(pin: unknown): pin is string {
  return typeof pin === "string" && PIN_REGEX.test(pin);
}
