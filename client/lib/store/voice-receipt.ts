"use client";

/**
 * Ephemeral store that carries a `VoiceIntentResult` (already persisted to
 * MongoDB by the server) from `/record` into `/record/receipt`. Not
 * persisted to disk — if the user closes the page, the receipt is gone
 * (the purchase record itself remains safe in Mongo).
 */

import { create } from "zustand";
import type { VoiceIntentResult } from "@khata/server";

interface VoiceReceiptState {
  result: VoiceIntentResult | null;
  setResult(result: VoiceIntentResult): void;
  clear(): void;
}

export const useVoiceReceipt = create<VoiceReceiptState>()((set) => ({
  result: null,
  setResult: (result) => set({ result }),
  clear: () => set({ result: null }),
}));
