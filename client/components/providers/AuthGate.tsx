"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store/auth-store";

/**
 * Demo auth gate. Redirects unauthenticated users to `/login` (except
 * while they're already on `/login`). Runs once the auth store has
 * rehydrated from localStorage so we don't bounce freshly-logged-in
 * users on a refresh.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const isAuthed = useAuthStore((s) => s.isAuthed);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!isAuthed && pathname !== "/login") {
      router.replace("/login");
    } else if (isAuthed && pathname === "/login") {
      router.replace("/");
    }
  }, [hasHydrated, isAuthed, pathname, router]);

  // While we wait for hydration, block rendering to avoid a flash of
  // protected content for users who aren't actually signed in.
  if (!hasHydrated) return null;
  if (!isAuthed && pathname !== "/login") return null;

  return <>{children}</>;
}
