"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, Lock, AtSign, Eye, EyeOff, AlertCircle } from "lucide-react";
import { useAuthStore } from "@/lib/store/auth-store";
import { MobileShell } from "@/components/layout/MobileShell";

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = login(email, password);
    if (result.ok) {
      router.replace("/");
      return;
    }
    setError(result.error);
    setBusy(false);
  };

  return (
    <MobileShell flush className="px-6 pt-10 pb-8">
      <div className="flex h-full flex-col">
        <div className="flex flex-col items-center gap-3 pt-6 text-center">
          <span className="flex size-16 items-center justify-center rounded-[22px] bg-ink text-background shadow-[0_18px_36px_-12px_rgba(0,0,0,0.45)]">
            <Mic className="size-8" strokeWidth={2} />
          </span>
          <h1 className="mt-1 flex items-baseline gap-2 text-2xl font-bold leading-tight">
            <span>Khata</span>
            <span
              lang="ur"
              dir="rtl"
              className="text-lg font-semibold text-muted-foreground/80"
            >
              کھاتہ
            </span>
          </h1>
          <p className="max-w-[22rem] text-sm text-muted-foreground">
            Voice-first ledger for shopkeepers. Sign in to continue.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-8 flex flex-1 flex-col justify-between gap-6"
        >
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Email
              </span>
              <div className="relative">
                <AtSign className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-2xl border-0 bg-white py-3.5 pl-10 pr-4 text-base shadow-sm ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-sage"
                  required
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Password
              </span>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-2xl border-0 bg-white py-3.5 pl-10 pr-12 text-base shadow-sm ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-sage"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-sage-soft"
                >
                  {showPw ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </label>

            {error ? (
              <div className="flex items-center gap-2 rounded-2xl bg-money-out-bg px-3.5 py-3 text-sm text-money-out ring-1 ring-money-out/20">
                <AlertCircle className="size-4 shrink-0" />
                <p>{error}</p>
              </div>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={busy || !email || !password}
            className="w-full rounded-2xl bg-ink px-5 py-4 text-base font-semibold text-background shadow-[0_14px_30px_-14px_rgba(0,0,0,0.5)] active:scale-95 transition disabled:opacity-40"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </MobileShell>
  );
}
