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

// Database layer (MongoDB Atlas) ------------------------------------------------
export {
  listCustomers,
  getCustomerById,
  findCustomerByName,
  upsertCustomerByName,
  updateCustomer,
  deleteCustomer,
} from "./db/customers";
export {
  listPurchases,
  getPurchaseById,
  getCustomerBalance,
  createPurchase,
  markPurchaseSettled,
  deletePurchase,
} from "./db/purchases";
export type {
  CustomerDoc,
  CustomerInput,
  CustomerView,
  PurchaseDoc,
  PurchaseInput,
  PurchaseItemInput,
  PurchaseKind,
  PurchaseView,
  GeminiIntent,
} from "./db/schemas";

// Voice pipeline --------------------------------------------------------------
export {
  runVoiceIntent,
  commitVoiceIntent,
  undoVoiceIntent,
} from "./actions/voice-intent";
export type {
  VoiceIntentResult,
  VoiceAction,
  MessagingStatus,
  DisambiguationCandidate,
  DisambiguationPayload,
} from "./actions/voice-intent";

// Messaging (Twilio WhatsApp) --------------------------------------------------
export {
  isTwilioConfigured,
  normalizeWhatsAppNumber,
  sendWelcomeMessage,
  sendPurchaseReceipt,
  sendBillsSummary,
} from "./integrations/twilio-client";
