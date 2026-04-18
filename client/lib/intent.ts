"use client";

/**
 * Heuristic intent parser — a dumb-but-demoable fallback for the real LLM
 * parser that lives in `server/src/actions/parser.ts`. When the teammate's
 * parser action lands, swap the body of `parseIntent()` below to call it
 * instead. The return shape (`ParsedIntent`) already matches.
 *
 * Covers the canonical hackathon phrases:
 *   - "Ahmed took five hundred rupees"                    → add_debt
 *   - "Ahmed paid back two hundred"                        → settle_debt
 *   - "Bought stock worth 2000 from Bilal Wholesale"      → add_payable
 *   - "Sold 2 tea and 1 sugar for 1200"                   → add_sale
 *   - "Add Ahmed 0300 1234567"                             → add_contact
 *
 * Strategy:
 *   1. Normalize case + digit words to integers.
 *   2. Run shallow keyword matches to pick an action.
 *   3. Extract amount + names with regexes.
 *   4. Low-confidence → `unknown` so the UI can fall back to manual entry.
 */

import type { ParsedIntent, RupeeAmount, SaleItem } from "./types";

const WORD_NUMBERS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90,
  hundred: 100, thousand: 1000, lakh: 100000, lac: 100000,
};

function wordsToNumber(tokens: string[]): number | null {
  let total = 0;
  let current = 0;
  let matched = false;
  for (const raw of tokens) {
    const w = raw.toLowerCase();
    const n = WORD_NUMBERS[w];
    if (n === undefined) continue;
    matched = true;
    if (n === 100 || n === 1000 || n === 100000) {
      current = (current || 1) * n;
      if (n >= 1000) {
        total += current;
        current = 0;
      }
    } else {
      current += n;
    }
  }
  const result = total + current;
  return matched ? result : null;
}

function extractAmount(text: string): RupeeAmount | null {
  // Prefer explicit digits ("500", "1,200", "2k", "1.5k").
  const digitMatch = text.match(
    /(?:rs\.?\s*)?(\d[\d,]*)(?:\.(\d+))?\s*(k|lakh|lac|hazaar)?/i
  );
  const rawInt = digitMatch?.[1];
  if (digitMatch && rawInt) {
    const int = Number(rawInt.replace(/,/g, ""));
    const frac = digitMatch[2] ? Number(`0.${digitMatch[2]}`) : 0;
    const suffix = digitMatch[3]?.toLowerCase();
    const multiplier =
      suffix === "k" || suffix === "hazaar"
        ? 1000
        : suffix === "lakh" || suffix === "lac"
          ? 100000
          : 1;
    const val = Math.round((int + frac) * multiplier);
    if (val > 0) return val;
  }
  // Fallback to word-number.
  const words = text.split(/\s+/);
  const wordNum = wordsToNumber(words);
  if (wordNum && wordNum > 0) return wordNum;
  return null;
}

function extractProperNoun(text: string): string | null {
  // Pick the first capitalized token that isn't a sentence starter.
  const tokens = text.trim().split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t || i === 0) continue;
    if (/^[A-Z][a-z]+$/.test(t)) return t;
  }
  // Last resort: first token (even if it's the sentence starter).
  const first = tokens[0];
  if (first && /^[A-Z][a-z]+$/.test(first)) return first;
  return null;
}

function extractPhone(text: string): string | null {
  const m = text.match(/(\+?92[-\s]?)?0?3\d{2}[-\s]?\d{7}/);
  return m ? m[0] : null;
}

/**
 * Best-effort sale parser: "sold 2 tea and 1 sugar for 1200" →
 *   items: [{name:"tea",qty:2,...},{name:"sugar",qty:1,...}], total: 1200
 */
function extractSaleItems(text: string, total: RupeeAmount): SaleItem[] {
  const beforeFor = text.split(/\s+for\s+/i)[0] ?? text;
  // Match patterns like "<digits> <word>"
  const re = /(\d+)\s+([a-zA-Z]+)/g;
  const items: SaleItem[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(beforeFor)) !== null) {
    const qty = Number(match[1]);
    const rawName = match[2];
    if (!rawName) continue;
    const name = rawName.toLowerCase();
    if (!qty || !name || name === "rs" || name === "rupees") continue;
    items.push({
      name,
      quantity: qty,
      unitPrice: 0,
      lineTotal: 0,
    });
  }
  if (items.length === 0) {
    return [{ name: "items", quantity: 1, unitPrice: total, lineTotal: total }];
  }
  // Split the total proportionally by quantity (heuristic).
  const totalQty = items.reduce((s, i) => s + i.quantity, 0) || 1;
  const perUnit = Math.round(total / totalQty);
  for (const it of items) {
    it.unitPrice = perUnit;
    it.lineTotal = perUnit * it.quantity;
  }
  return items;
}

export function parseIntent(transcript: string): ParsedIntent {
  const text = transcript.trim();
  if (!text) {
    return {
      action: "unknown",
      payload: { reason: "empty transcript", rawText: transcript },
      confidence: 0,
    };
  }
  const lower = text.toLowerCase();
  const amount = extractAmount(text);

  // --- settle_debt ---------------------------------------------------------
  if (/(paid\s+back|settle|cleared|wapas|chukay)/i.test(lower)) {
    const name = extractProperNoun(text);
    if (name) {
      return {
        action: "settle_debt",
        payload: {
          contactName: name,
          amount: amount ?? undefined,
        },
        confidence: amount ? 0.85 : 0.7,
      };
    }
  }

  // --- add_payable (restock / bought stock from wholesaler) ---------------
  if (/(bought|restock|stock|wholesale|wholesaler|kharida)/i.test(lower)) {
    const fromMatch = text.match(/from\s+([A-Z][\w\s]*?)(?:$|[.,;])/);
    const wholesaler =
      fromMatch?.[1]?.trim() || extractProperNoun(text) || "Wholesaler";
    if (amount) {
      return {
        action: "add_payable",
        payload: {
          wholesalerName: wholesaler,
          amount,
        },
        confidence: 0.82,
      };
    }
  }

  // --- add_sale (sold ... for ...) ----------------------------------------
  if (/(sold|bikri|bech|sale\s+of)/i.test(lower) && amount) {
    const items = extractSaleItems(text, amount);
    return {
      action: "add_sale",
      payload: {
        items,
        total: amount,
      },
      confidence: items.length > 1 ? 0.85 : 0.7,
    };
  }

  // --- add_contact --------------------------------------------------------
  if (/^(add|create|new)\s+contact/i.test(lower) || /^add\s+[A-Z]/.test(text)) {
    const name = extractProperNoun(text);
    const phone = extractPhone(text);
    if (name) {
      return {
        action: "add_contact",
        payload: { name, phone: phone ?? undefined },
        confidence: phone ? 0.9 : 0.7,
      };
    }
  }

  // --- add_debt (default when amount + name present) ----------------------
  if (amount) {
    const name = extractProperNoun(text);
    if (name) {
      return {
        action: "add_debt",
        payload: {
          contactName: name,
          amount,
          notes: text,
        },
        confidence: /took|owe|udhaar|kata|credit/i.test(lower) ? 0.9 : 0.65,
      };
    }
  }

  return {
    action: "unknown",
    payload: {
      reason: "could not extract action/amount/name with confidence",
      rawText: transcript,
    },
    confidence: 0.2,
  };
}
