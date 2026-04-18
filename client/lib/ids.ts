import type { Id, EpochMs } from "./types";

/**
 * UUIDv4 generator with a safe fallback for older runtimes / SSR.
 * Prefer `crypto.randomUUID()` when available (modern browsers + Node 20+).
 */
export function newId(): Id {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // RFC4122-ish fallback (not cryptographically strong — only used as a shim).
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function now(): EpochMs {
  return Date.now();
}
