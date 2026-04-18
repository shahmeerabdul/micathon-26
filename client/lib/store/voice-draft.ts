"use client";

/**
 * Ephemeral (non-persisted) store that carries a parsed voice intent from
 * `/record` into `/record/confirm`. Kept separate from the ledger store so
 * it never pollutes localStorage — if the user navigates away without
 * confirming, the draft is gone.
 */

import { create } from "zustand";
import type { ConfirmationPayload } from "../types";

interface VoiceDraftState {
  transcript: string;
  payload: ConfirmationPayload | null;
  setDraft(transcript: string, payload: ConfirmationPayload): void;
  clear(): void;
}

export const useVoiceDraft = create<VoiceDraftState>()((set) => ({
  transcript: "",
  payload: null,
  setDraft: (transcript, payload) => set({ transcript, payload }),
  clear: () => set({ transcript: "", payload: null }),
}));
