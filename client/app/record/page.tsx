"use client";

/**
 * /record — "hold to speak" screen, server-backed flow.
 *
 * Flow:
 *   1. User holds the big mic button (pointerdown → start MediaRecorder).
 *   2. User releases (pointerup → stop recording, get audio Blob).
 *   3. We POST the Blob to /api/voice/record. The server:
 *        a. Sends the audio to Gemini 3 Flash.
 *        b. Resolves the customer name (fuzzy match on Mongo).
 *        c. Inserts a purchase document in Mongo.
 *      and returns the saved record.
 *   4. We stash the result in `useVoiceReceipt` and navigate to
 *      /record/receipt, which renders the confirmation with an Undo.
 *
 * The browser Web-Speech path is retained as a graceful fallback: if
 * MediaRecorder is unavailable we send the user to /new for manual entry.
 */

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, MicOff, AlertCircle, Edit3 } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { MobileShell } from "@/components/layout/MobileShell";
import { useAudioRecorder } from "@/lib/hooks/useAudioRecorder";
import { uploadVoiceAudio } from "@/lib/actions";
import { useVoiceReceipt } from "@/lib/store/voice-receipt";

type Phase = "ready" | "recording" | "uploading" | "error";

export default function RecordPage() {
  const router = useRouter();
  const rec = useAudioRecorder();
  const setReceipt = useVoiceReceipt((s) => s.setResult);
  const [phase, setPhase] = useState<Phase>("ready");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const holdingRef = useRef(false);

  const handlePressStart = async () => {
    if (!rec.isSupported || phase === "uploading") return;
    holdingRef.current = true;
    setErrMsg(null);
    setPhase("recording");
    await rec.start();
  };

  const handlePressEnd = async () => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    if (phase !== "recording") return;
    setPhase("uploading");
    const clip = await rec.stop();
    if (!clip || clip.blob.size === 0) {
      setPhase("ready");
      return;
    }
    // Super-short taps (< 500ms) are almost certainly accidental.
    if (clip.durationMs < 500) {
      setPhase("ready");
      setErrMsg("Hold a bit longer and speak clearly.");
      return;
    }
    try {
      const result = await uploadVoiceAudio(clip.blob, clip.mimeType);
      setReceipt(result);
      if (result.action === "disambiguate") {
        router.push("/record/choose");
      } else {
        router.push("/record/receipt");
      }
    } catch (err) {
      const e = err as Error;
      setErrMsg(e.message || "Couldn't process that recording.");
      setPhase("error");
    }
  };

  if (!rec.isSupported) {
    return (
      <>
        <AppHeader variant="page" title="Record" urduTitle="بولیں" backHref="/" />
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
                Your browser doesn&apos;t support audio recording. Try Chrome
                on Android, or Safari on iOS, or add this entry manually.
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

  const level = rec.level; // 0..1

  return (
    <>
      <AppHeader variant="page" title="Record" urduTitle="بولیں" backHref="/" />
      <MobileShell>
        <div className="flex flex-1 flex-col items-center justify-between gap-6 pt-6 pb-24 text-center">
          {/* Status / transcript placeholder */}
          <div className="w-full min-h-[8rem]">
            {phase === "ready" && !errMsg ? (
              <div className="flex flex-col items-center gap-1">
                <p className="text-sm font-medium text-muted-foreground">
                  Speak in Urdu or English
                </p>
                <p
                  lang="ur"
                  dir="rtl"
                  className="text-sm text-muted-foreground/80"
                >
                  اردو یا انگریزی میں بولیں
                </p>
              </div>
            ) : phase === "error" || errMsg ? (
              <div className="rounded-[18px] bg-money-out-bg p-4 text-left ring-1 ring-money-out/20">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-money-out">
                  Try again
                </p>
                <p className="mt-0.5 text-sm">
                  {errMsg ?? "Something went wrong"}
                </p>
              </div>
            ) : (
              <div className="rounded-[24px] bg-white p-4 text-left ring-1 ring-border shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {phase === "uploading" ? "Processing…" : "Listening…"}
                </p>
                {phase === "uploading" ? (
                  <>
                    <p className="mt-1 text-base leading-snug">
                      Your query is being processed, please wait.
                    </p>
                    <p
                      lang="ur"
                      dir="rtl"
                      className="mt-0.5 text-sm leading-snug text-muted-foreground"
                    >
                      آپ کی درخواست پر کارروائی ہو رہی ہے، براہ کرم انتظار کریں۔
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-base leading-snug">
                    Go ahead — I&apos;m picking you up.
                  </p>
                )}
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
            disabled={phase === "uploading"}
            className={
              "group relative flex size-40 items-center justify-center rounded-full text-background shadow-[0_30px_60px_-20px_rgba(0,0,0,0.5)] active:scale-95 transition select-none " +
              (phase === "recording"
                ? "bg-money-out"
                : phase === "uploading"
                  ? "bg-muted text-muted-foreground"
                  : "bg-ink")
            }
          >
            {phase === "recording" ? (
              <>
                <span
                  className="absolute inset-0 rounded-full bg-money-out opacity-30"
                  style={{
                    transform: `scale(${1 + level * 0.35})`,
                    transition: "transform 60ms linear",
                  }}
                />
                <MicOff className="size-16 relative" strokeWidth={2} />
              </>
            ) : phase === "uploading" ? (
              <span className="size-8 rounded-full border-2 border-background/40 border-t-background animate-spin" />
            ) : (
              <Mic className="size-16" strokeWidth={2} />
            )}
          </button>

          <div>
            <p className="text-sm font-semibold">
              {phase === "recording"
                ? "Release to save"
                : phase === "uploading"
                  ? "Working…"
                  : "Press and hold to speak"}
            </p>
          </div>
        </div>
      </MobileShell>
    </>
  );
}
