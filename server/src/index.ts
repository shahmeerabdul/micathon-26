/**
 * Public surface of @khata/server.
 *
 * Frontend usage:
 *     import type { Contact, Debt, Payable, Sale } from "@khata/server";
 *     import { createVault, unlockVault, sealRecord } from "@khata/server/encryption";
 *
 * Server actions (once wired up in Part 2):
 *     import { transcribeAudio } from "@khata/server/actions/stt";
 *     import { parseIntent } from "@khata/server/actions/parser";
 */

export * from "./types.js";
export {
  CRYPTO_CONSTANTS,
  CryptoUnavailableError,
  InvalidPinError,
  DecryptionError,
  createVault,
  unlockVault,
  rotatePin,
  deriveKey,
  encryptString,
  decryptString,
  encryptJson,
  decryptJson,
  sealRecord,
  openRecord,
  isValidPin,
} from "./encryption.js";
export type { EncryptedBlob } from "./encryption.js";
