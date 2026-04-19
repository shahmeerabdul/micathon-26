/**
 * Twilio WhatsApp client.
 *
 * Used by the voice pipeline to send two kinds of messages:
 *   1. Welcome message when a brand-new customer is added.
 *   2. Purchase confirmation after a sale/debt is recorded.
 *
 * Environment variables:
 *   TWILIO_ACCOUNT_SID            Twilio account SID (starts with "AC").
 *   TWILIO_AUTH_TOKEN             Twilio auth token.
 *   TWILIO_WHATSAPP_FROM          Twilio WhatsApp-enabled sender number
 *                                  in E.164 (e.g. "+14155238886" for the
 *                                  Twilio sandbox).
 *   TWILIO_WHATSAPP_ENABLED       "true" | "false" (default true when
 *                                  SID+TOKEN+FROM are all set).
 *
 * All send functions are intentionally forgiving: if Twilio isn't
 * configured, we log a warning and return `{ sent: false }` so the voice
 * pipeline keeps working. Messaging is a nice-to-have, not a hard
 * dependency.
 */

import twilio from "twilio";
import { loadServerEnvFallback } from "../env/load-env";

type TwilioClient = ReturnType<typeof twilio>;

interface TwilioConfig {
  accountSid: string;
  authToken: string;
  from: string;
}

let cachedClient: TwilioClient | null = null;
let cachedConfig: TwilioConfig | null = null;

function readConfig(): TwilioConfig | null {
  loadServerEnvFallback();
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_WHATSAPP_FROM?.trim();
  const enabledRaw = process.env.TWILIO_WHATSAPP_ENABLED?.toLowerCase();
  if (enabledRaw === "false" || enabledRaw === "0") return null;
  if (!accountSid || !authToken || !from) return null;
  if (!accountSid.startsWith("AC")) return null;
  return { accountSid, authToken, from };
}

function getClient(): { client: TwilioClient; config: TwilioConfig } | null {
  if (cachedClient && cachedConfig) {
    return { client: cachedClient, config: cachedConfig };
  }
  const config = readConfig();
  if (!config) return null;
  cachedConfig = config;
  cachedClient = twilio(config.accountSid, config.authToken);
  return { client: cachedClient, config };
}

/**
 * Normalise a raw phone number (as spoken by the shopkeeper) into
 * E.164 Pakistan form: `+92XXXXXXXXXX` (13 chars total).
 * Returns null if we can't confidently build one.
 */
export function normalizeWhatsAppNumber(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, "");
  if (!digits) return null;
  if (digits.startsWith("92") && digits.length === 12) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 11) return `+92${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith("3")) return `+92${digits}`;
  if (raw.startsWith("+") && digits.length >= 10) return `+${digits}`;
  return null;
}

function toWhatsappAddr(e164: string): string {
  return e164.startsWith("whatsapp:") ? e164 : `whatsapp:${e164}`;
}

export interface SendResult {
  sent: boolean;
  sid?: string;
  error?: string;
  skippedReason?: string;
}

async function sendRaw(to: string, body: string): Promise<SendResult> {
  const ctx = getClient();
  if (!ctx) {
    console.warn(
      "[twilio] skipping send — TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM missing.",
    );
    return { sent: false, skippedReason: "not_configured" };
  }
  const normalizedTo = normalizeWhatsAppNumber(to);
  if (!normalizedTo) {
    return { sent: false, skippedReason: "invalid_number" };
  }
  try {
    const msg = await ctx.client.messages.create({
      from: toWhatsappAddr(ctx.config.from),
      to: toWhatsappAddr(normalizedTo),
      body,
    });
    return { sent: true, sid: msg.sid };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[twilio] send failed:", message);
    return { sent: false, error: message };
  }
}

/* -------------------------------------------------------------------------- */
/*  Message templates                                                         */
/* -------------------------------------------------------------------------- */

function formatPkr(n: number): string {
  return `Rs. ${n.toLocaleString("en-PK")}`;
}

/**
 * Short branding footer appended to every outbound message so recipients
 * immediately see which app this WhatsApp message came from.
 */
const APP_SIGNATURE = "— Sent via *Khata* (کھاتہ) · Voice ledger for shopkeepers";

function withSignature(body: string): string {
  return `${body}\n\n${APP_SIGNATURE}`;
}

export async function sendWelcomeMessage(
  to: string,
  customerName: string,
): Promise<SendResult> {
  const body =
    `Welcome to *E-Karyana Store*, ${customerName}! 🛍️\n\n` +
    `You've been added to our ledger. You'll get a WhatsApp confirmation each ` +
    `time a purchase is recorded against your account. Thank you for shopping with us!`;
  return sendRaw(to, withSignature(body));
}

export interface PurchaseReceiptInput {
  customerName: string;
  items: { name: string; quantity: number; lineTotal: number }[];
  amount: number;
  kind: "debt" | "cash" | "payment";
  totalOwed?: number;
}

export async function sendPurchaseReceipt(
  to: string,
  input: PurchaseReceiptInput,
): Promise<SendResult> {
  const lines: string[] = [];
  lines.push(`Hi ${input.customerName}, here's your receipt from E-Karyana Store:`);
  lines.push("");
  if (input.items.length > 0) {
    for (const it of input.items) {
      lines.push(`• ${it.quantity}× ${it.name} — ${formatPkr(it.lineTotal)}`);
    }
    lines.push("");
  }
  if (input.kind === "payment") {
    lines.push(`*Payment received:* ${formatPkr(input.amount)}`);
  } else {
    lines.push(`*Total:* ${formatPkr(input.amount)}`);
    if (input.kind === "debt") {
      lines.push(`_Added to your tab (udhaar)._`);
    } else {
      lines.push(`_Paid in cash. Thank you!_`);
    }
  }
  if (typeof input.totalOwed === "number" && input.totalOwed > 0) {
    lines.push("");
    lines.push(`Outstanding balance: ${formatPkr(input.totalOwed)}`);
  }
  return sendRaw(to, withSignature(lines.join("\n")));
}

export async function sendBillsSummary(
  to: string,
  customerName: string,
  openDebts: { amount: number; createdAt: string; notes?: string }[],
  totalOwed: number,
): Promise<SendResult> {
  if (openDebts.length === 0) {
    const body = `Hi ${customerName}, you have no outstanding bills at E-Karyana Store. You're all cleared! ✅`;
    return sendRaw(to, withSignature(body));
  }
  const lines: string[] = [];
  lines.push(`Hi ${customerName}, here's your outstanding balance at E-Karyana Store:`);
  lines.push("");
  for (const d of openDebts.slice(0, 10)) {
    const date = new Date(d.createdAt).toLocaleDateString("en-PK", {
      day: "2-digit",
      month: "short",
    });
    lines.push(`• ${date} — ${formatPkr(d.amount)}${d.notes ? ` (${d.notes})` : ""}`);
  }
  lines.push("");
  lines.push(`*Total owed:* ${formatPkr(totalOwed)}`);
  return sendRaw(to, withSignature(lines.join("\n")));
}

export function isTwilioConfigured(): boolean {
  return readConfig() !== null;
}
