"use client";

/**
 * /record/choose — disambiguation picker.
 *
 * Reached when the voice pipeline hits two or more near-exact customer
 * name matches (e.g. "Zuhaib" spoken when both `Zuhaib` and `Zuhaib
 * Akhtar` are in the ledger). Shows every candidate with their current
 * balance so the shopkeeper can tell them apart, then commits the
 * original Gemini intent against the chosen one and continues to the
 * usual receipt.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { HelpCircle, Sparkles, TrendingDown, Wallet } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { MobileShell } from "@/components/layout/MobileShell";
import { ContactAvatar } from "@/components/shared/ContactAvatar";
import { useVoiceReceipt } from "@/lib/store/voice-receipt";
import { commitDisambiguatedIntent } from "@/lib/actions";
import { formatPKR } from "@/lib/format";

function pendingActionLabel(
  pendingAction: "purchase" | "payment" | "query_bills",
): string {
  if (pendingAction === "payment") return "record a payment from";
  if (pendingAction === "query_bills") return "look up bills for";
  return "add to the tab of";
}

export default function ChoosePage() {
  const router = useRouter();
  const result = useVoiceReceipt((s) => s.result);
  const setReceipt = useVoiceReceipt((s) => s.setResult);
  const [pickingId, setPickingId] = useState<string | null>(null);

  useEffect(() => {
    if (!result || result.action !== "disambiguate") {
      router.replace("/record");
    }
  }, [result, router]);

  if (!result || result.action !== "disambiguate" || !result.disambiguation) {
    return null;
  }

  const { disambiguation, intent } = result;
  const { originalName, pendingAction, candidates } = disambiguation;

  const handlePick = async (customerId: string) => {
    if (pickingId) return;
    setPickingId(customerId);
    try {
      const committed = await commitDisambiguatedIntent(intent, customerId);
      setReceipt(committed);
      router.replace("/record/receipt");
    } catch (err) {
      const e = err as Error;
      toast.error(e.message || "Couldn't save that pick. Try again.");
      setPickingId(null);
    }
  };

  return (
    <>
      <AppHeader
        variant="page"
        title="Which one?"
        urduTitle="کون سا؟"
        subtitle="Two customers matched"
        backHref="/record"
      />
      <MobileShell>
        <div className="space-y-4 pb-24">
          {/* Hero: the question */}
          <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#5b8def] via-[#8ba7ff] to-[#c7dbff] p-5 text-white shadow-[0_20px_45px_-18px_rgba(0,0,0,0.35)]">
            <span
              aria-hidden
              className="pointer-events-none absolute -top-10 -right-6 size-40 rounded-full bg-white/25 blur-2xl"
            />
            <div className="relative mb-3 flex items-center justify-between">
              <span className="flex size-11 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/40">
                <HelpCircle className="size-5" strokeWidth={2.25} />
              </span>
              <span className="rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider backdrop-blur-sm">
                Pick one
              </span>
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-85">
              Kaunsa {originalName}?
            </p>
            <p className="mt-1 text-[22px] leading-tight font-bold">
              You said &ldquo;{originalName}&rdquo; — we found{" "}
              {candidates.length} matches.
            </p>
            <p className="mt-1 text-xs opacity-90">
              Tap the right person to {pendingActionLabel(pendingAction)} them.
            </p>
          </div>

          {/* Transcript recap */}
          <div className="rounded-[18px] bg-sage-soft px-4 py-3 ring-1 ring-black/5">
            <div className="flex items-center gap-2">
              <Sparkles className="size-3.5 text-muted-foreground" />
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Gemini heard
              </p>
            </div>
            <p className="mt-1 text-sm italic leading-snug">
              &ldquo;{intent.transcript}&rdquo;
            </p>
          </div>

          {/* Candidate cards */}
          <ul className="space-y-2">
            {candidates.map((c) => {
              const isPicking = pickingId === c.customer.id;
              const isDisabled = pickingId !== null && !isPicking;
              return (
                <li key={c.customer.id}>
                  <button
                    type="button"
                    onClick={() => handlePick(c.customer.id)}
                    disabled={pickingId !== null}
                    className={
                      "w-full rounded-[22px] bg-white p-4 text-left ring-1 ring-border shadow-[0_6px_16px_-12px_rgba(0,0,0,0.15)] transition active:scale-[0.99] " +
                      (isDisabled ? "opacity-40" : "")
                    }
                  >
                    <div className="flex items-center gap-3">
                      <ContactAvatar name={c.customer.name} size="lg" />
                      <div className="min-w-0 flex-1 leading-tight">
                        <p className="truncate text-base font-bold">
                          {c.customer.name}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {c.customer.whatsappNumber ?? "No WhatsApp on file"}
                          {" · "}
                          Match{" "}
                          <span className="tabular">
                            {Math.round(c.similarity * 100)}%
                          </span>
                        </p>
                      </div>
                      {isPicking ? (
                        <span className="size-5 rounded-full border-2 border-ink/30 border-t-ink animate-spin" />
                      ) : null}
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-2xl bg-money-out-bg px-3 py-2 ring-1 ring-black/5">
                        <div className="flex items-center gap-1.5 text-money-out opacity-80">
                          <TrendingDown className="size-3.5" />
                          <p className="text-[10px] uppercase tracking-wider">
                            Owes now
                          </p>
                        </div>
                        <p className="tabular mt-0.5 text-sm font-bold text-money-out">
                          {formatPKR(c.balance.totalOwed)}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-money-in-bg px-3 py-2 ring-1 ring-black/5">
                        <div className="flex items-center gap-1.5 text-money-in opacity-80">
                          <Wallet className="size-3.5" />
                          <p className="text-[10px] uppercase tracking-wider">
                            Lifetime spend
                          </p>
                        </div>
                        <p className="tabular mt-0.5 text-sm font-bold text-money-in">
                          {formatPKR(c.balance.totalSpent)}
                        </p>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Cancel */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                useVoiceReceipt.getState().clear();
                router.push("/record");
              }}
              disabled={pickingId !== null}
              className="w-full rounded-2xl bg-white px-5 py-3 text-sm font-semibold ring-1 ring-border active:scale-95 transition disabled:opacity-40"
            >
              Cancel &amp; re-record
            </button>
          </div>
        </div>
      </MobileShell>
    </>
  );
}
