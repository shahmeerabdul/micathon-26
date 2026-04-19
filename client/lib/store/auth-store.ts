"use client";

/**
 * Demo-only auth store.
 *
 * Single hardcoded shopkeeper account:
 *   email:    shopkeeper@gmail.com
 *   password: shopkeeper
 *
 * Persisted to localStorage so the "session" survives page reloads during
 * the demo. Swap this out for real auth later.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export const DEMO_EMAIL = "shopkeeper@gmail.com";
export const DEMO_PASSWORD = "shopkeeper";

interface AuthState {
  isAuthed: boolean;
  email: string | null;
  hasHydrated: boolean;
  login(email: string, password: string): { ok: true } | { ok: false; error: string };
  logout(): void;
  setHasHydrated(v: boolean): void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthed: false,
      email: null,
      hasHydrated: false,
      login: (email, password) => {
        const normalized = email.trim().toLowerCase();
        if (normalized !== DEMO_EMAIL || password !== DEMO_PASSWORD) {
          return { ok: false, error: "Wrong email or password." };
        }
        set({ isAuthed: true, email: normalized });
        return { ok: true };
      },
      logout: () => set({ isAuthed: false, email: null }),
      setHasHydrated: (v) => set({ hasHydrated: v }),
    }),
    {
      name: "khata-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ isAuthed: s.isAuthed, email: s.email }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
