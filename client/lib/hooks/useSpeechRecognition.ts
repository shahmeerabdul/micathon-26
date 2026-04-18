"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Thin wrapper around the browser Web Speech API.
 *
 * Why not the backend STT action?
 *   - Web Speech API is free, low-latency, and works on Chrome/Edge/Safari —
 *     perfect for the hackathon demo. It also keeps audio entirely on-device
 *     unless we fall back to the server path.
 *   - When the backend STT action lands, we'll layer it as a fallback for
 *     unsupported browsers (Firefox) and for non-English/Urdu models with
 *     higher accuracy. The public hook shape (start/stop/transcript/status)
 *     won't change.
 */

type Status = "idle" | "listening" | "processing" | "error" | "unsupported";

// Browser prefix shim — all available under `any` since Web Speech API lacks
// first-class TS types in `lib.dom.d.ts`.
type AnySpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onend: ((ev: unknown) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

interface UseSpeechRecognitionOptions {
  /** BCP-47 tag. Default `"ur-PK"`; try `"en-PK"` or `"en-US"` as fallback. */
  lang?: string;
  /** Use interim results for the visual ticker feel. */
  interim?: boolean;
}

export function useSpeechRecognition(opts: UseSpeechRecognitionOptions = {}) {
  const [status, setStatus] = useState<Status>("idle");
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<AnySpeechRecognition | null>(null);
  const finalRef = useRef("");

  // Feature detection once on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const W = window as unknown as {
      SpeechRecognition?: new () => AnySpeechRecognition;
      webkitSpeechRecognition?: new () => AnySpeechRecognition;
    };
    const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!Ctor) {
      setStatus("unsupported");
      return;
    }
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = opts.interim ?? true;
    rec.lang = opts.lang ?? "ur-PK";

    rec.onresult = (ev: unknown) => {
      // SpeechRecognitionEvent has `results` (SpeechRecognitionResultList)
      const results = (ev as { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> })
        .results;
      let interim = "";
      let final = finalRef.current;
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (!result) continue;
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) {
          final += text + " ";
        } else {
          interim += text;
        }
      }
      finalRef.current = final;
      setTranscript(final.trim());
      setInterimTranscript(interim);
    };

    rec.onerror = (ev: unknown) => {
      const msg =
        (ev as { error?: string })?.error ?? "Unknown recognition error";
      setError(msg);
      setStatus("error");
    };

    rec.onend = () => {
      setStatus((prev) => (prev === "listening" ? "processing" : prev));
    };

    recognitionRef.current = rec;

    return () => {
      try {
        rec.abort();
      } catch {
        // noop
      }
      recognitionRef.current = null;
    };
  }, [opts.lang, opts.interim]);

  const start = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    setError(null);
    finalRef.current = "";
    setTranscript("");
    setInterimTranscript("");
    try {
      rec.start();
      setStatus("listening");
    } catch (e) {
      setError((e as Error).message);
      setStatus("error");
    }
  }, []);

  const stop = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    try {
      rec.stop();
    } catch {
      // already stopped
    }
  }, []);

  const reset = useCallback(() => {
    finalRef.current = "";
    setTranscript("");
    setInterimTranscript("");
    setError(null);
    setStatus("idle");
  }, []);

  return {
    status,
    transcript,
    interimTranscript,
    error,
    start,
    stop,
    reset,
    supported: status !== "unsupported",
  };
}
