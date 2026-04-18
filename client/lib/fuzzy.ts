import type { Contact, ContactMatch } from "./types";

/**
 * Tiny dependency-free fuzzy matcher for contact names.
 *
 * The backend will eventually replace this with a proper fuzzy index (fuse.js or
 * a server-side embedding match) when real parsing lands. For the demo this is
 * good enough: it handles transliteration noise ("ahmad" vs "Ahmed Khan"),
 * partial first-name matches, and normalizes casing/spacing.
 */

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

function tokens(s: string): string[] {
  return normalize(s).split(/\s+/).filter(Boolean);
}

/**
 * Dice-coefficient bigram similarity. Cheap, symmetrical, and robust for
 * short personal names.
 */
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

/**
 * Compute a 0..1 score for how well `query` matches `contactName`.
 * Blends full-string similarity with best-token match so "Ahmed" still
 * finds "Ahmed Khan" without needing a full name.
 */
export function scoreContact(query: string, contactName: string): number {
  const q = normalize(query);
  const c = normalize(contactName);
  if (!q || !c) return 0;
  if (c.includes(q) || q.includes(c)) return 0.95;

  const full = dice(q, c);
  const qTokens = tokens(query);
  const cTokens = tokens(contactName);
  let bestToken = 0;
  for (const qt of qTokens) {
    for (const ct of cTokens) {
      const s = ct.startsWith(qt) || qt.startsWith(ct) ? 0.9 : dice(qt, ct);
      if (s > bestToken) bestToken = s;
    }
  }
  return Math.max(full, bestToken);
}

/**
 * Rank contacts by relevance to a free-text name query. Returns the top N
 * above `threshold` (default 0.3) sorted descending by similarity.
 */
export function matchContacts(
  query: string,
  contacts: Contact[],
  opts?: { limit?: number; threshold?: number }
): ContactMatch[] {
  const limit = opts?.limit ?? 5;
  const threshold = opts?.threshold ?? 0.3;
  return contacts
    .map<ContactMatch>((c) => ({
      contactId: c.id,
      name: c.name,
      similarity: scoreContact(query, c.name),
    }))
    .filter((m) => m.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}
