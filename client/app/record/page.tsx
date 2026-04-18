"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, MicOff, AlertCircle, Edit3 } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { MobileShell } from "@/components/layout/MobileShell";
import { useSpeechRecognition } from "@/lib/hooks/useSpeechRecognition";
import { previewVoice, buildConfirmation } from "@/lib/actions";
import { useLedgerStore } from "@/lib/store/ledger-store";
import { useVoiceDraft } from "@/lib/store/voice-draft";

type Phase = "ready" | "recording" | "transcribing" | "error";

export default function RecordPage() {
  const router = useRouter();
  const contacts = useLedgerStore((s) => s.contacts);
  const setDraft = useVoiceDraft((s) => s.setDraft);

  const {
    status,
    transcript,
    interimTranscript,
    error,
    start,
    stop,
    reset,
    supported,
  } = useSpeechRecognition({ lang: "ur-PK", interim: true });

  const [phase, setPhase] = useState<Phase>("ready");

  // When speech recognition ends, promote to "transcribing" then parse.
  useEffect(() => {
    if (status === "processing" && phase === "recording") {
      setPhase("transcribing");
      const text = (transcript || interimTranscript).trim();
      if (!text) {
        setPhase("ready");
        reset();
        return;
      }
      (async () => {
        const intent = await previewVoice(text);
        const payload = await buildConfirmation(intent, contacts);
        setDraft(text, payload);
        router.push("/record/confirm");
      })();
    }
  }, [
    status,
    phase,
    transcript,
    interimTranscript,
    reset,
    contacts,
    setDraft,
    router,
  ]);

  const handlePressStart = () => {
    if (!supported) return;
    setPhase("recording");
    start();
  };
  const handlePressEnd = () => {
    if (!supported) return;
    if (phase !== "recording") return;
    stop();
  };

  if (!supported) {
    return (
      <>
        <AppHeader variant="page" title="Record" backHref="/" />
        <MobileShell>
          <div className="flex flex-1 flex-col items-center justify-center gap-4 pt-10 pb-24 text-center">
            <span className="flex size-16 items-center justify-center rounded-full bg-pending-bg text-pending">
              <AlertCircle className="size-7" />
            </span>
            <div>
              <p className="text-base font-semibold">
                Voice not supported here
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Your browser doesn&apos;t expose the Web Speech API. Try Chrome
                or Edge, or add this entry manually.
              </p>
            </div>
            <a
              href="/new"
              className="flex items-center gap-2 rounded-2xl bg-ink px-5 py-3 text-sm font-semibold text-background active:scale-95 transition"
            >
              <Edit3 className="size-4" />
              Add manually
            </a>
          </div>
        </MobileShell>
      </>
    );
  }

  const live = (transcript + " " + interimTranscript).trim();

  return (
    <>
      <AppHeader variant="page" title="Record" backHref="/" />
      <MobileShell>
        <div className="flex flex-1 flex-col items-center justify-between gap-6 pt-6 pb-24 text-center">
          {/* Transcript display */}
          <div className="w-full min-h-[8rem]">
            {phase === "ready" && !live ? (
              <p className="text-sm text-muted-foreground">
                Press and hold the mic, speak naturally in Urdu or English.
              </p>
            ) : phase === "error" || error ? (
              <p className="text-sm text-money-out">
                {error ?? "Something went wrong"}
              </p>
            ) : (
              <div className="rounded-[24px] bg-white p-4 text-left ring-1 ring-border shadow-sm min-h-[6rem]">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {phase === "transcribing" ? "Parsing…" : "Listening…"}
                </p>
                <p className="mt-1 text-base leading-snug">
                  {transcript}
                  {interimTranscript ? (
                    <span className="text-muted-foreground">
                      {" "}
                      {interimTranscript}
                    </span>
                  ) : null}
                </p>
              </div>
            )}
          </div>

          {/* Mic button */}
          <button
            type="button"
            aria-label="Hold to record"
            onPointerDown={handlePressStart}
            onPointerUp={handlePressEnd}
            onPointerLeave={handlePressEnd}
            onPointerCancel={handlePressEnd}
            disabled={phase === "transcribing"}
            className={
              "group relative flex size-40 items-center justify-center rounded-full text-background shadow-[0_30px_60px_-20px_rgba(0,0,0,0.5)] active:scale-95 transition select-none " +
              (phase === "recording"
                ? "bg-money-out"
                : phase === "transcribing"
                  ? "bg-muted text-muted-foreground"
                  : "bg-ink")
            }
          >
            {phase === "recording" ? (
              <>
                <span className="absolute inset-0 rounded-full bg-money-out animate-ping opacity-30" />
                <MicOff className="size-16" strokeWidth={2} />
              </>
            ) : (
              <Mic className="size-16" strokeWidth={2} />
            )}
          </button>

          <div>
            <p className="text-sm font-semibold">
              {phase === "recording"
                ? "Release to parse"
                : phase === "transcribing"
                  ? "Working…"
                  : "Press and hold to speak"}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Example: &ldquo;Ahmed took five hundred rupees&rdquo;
            </p>
          </div>
        </div>
      </MobileShell>
    </>
  );
}
