"use client";

/**
 * `useAudioRecorder` — browser MediaRecorder wrapper.
 *
 * Exposes a tiny API the "hold to speak" UI can drive:
 *
 *     const rec = useAudioRecorder();
 *     rec.start();          // ask for mic, begin capture
 *     rec.stop();           // finalise → returns { blob, mimeType, durationMs }
 *     rec.isSupported       // false on ancient browsers
 *     rec.state             // "idle" | "starting" | "recording" | "stopping"
 *     rec.level             // 0..1 live VU meter for the mic ring animation
 *     rec.error             // last error message, if any
 *
 * Design notes:
 *   - We negotiate the MIME type the browser actually supports (Chrome →
 *     audio/webm, Safari → audio/mp4). Gemini accepts both.
 *   - `level` is derived from an AnalyserNode on an extra WebAudio tap,
 *     NOT from the recorded stream, so we can keep it smooth even while
 *     the MediaRecorder is flushing chunks.
 *   - Permissions / device changes are surfaced via `error`.
 */

import { useCallback, useEffect, useRef, useState } from "react";

type State = "idle" | "starting" | "recording" | "stopping";

export interface RecordedAudio {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

export interface UseAudioRecorderResult {
  isSupported: boolean;
  state: State;
  level: number;
  error: string | null;
  start: () => Promise<void>;
  stop: () => Promise<RecordedAudio | null>;
  cancel: () => void;
}

const CANDIDATE_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
];

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const t of CANDIDATE_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

export function useAudioRecorder(): UseAudioRecorderResult {
  const [state, setState] = useState<State>("idle");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const stopResolverRef = useRef<((result: RecordedAudio | null) => void) | null>(null);

  useEffect(() => {
    const supported =
      typeof window !== "undefined" &&
      typeof MediaRecorder !== "undefined" &&
      !!navigator?.mediaDevices?.getUserMedia &&
      !!pickMimeType();
    setIsSupported(supported);
  }, []);

  const teardownStream = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
    setLevel(0);
  }, []);

  const start = useCallback(async () => {
    if (state !== "idle") return;
    setError(null);
    setState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.addEventListener("dataavailable", (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      });
      recorder.addEventListener("stop", () => {
        const durationMs = Date.now() - startedAtRef.current;
        const finalType = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: finalType });
        chunksRef.current = [];
        const resolver = stopResolverRef.current;
        stopResolverRef.current = null;
        teardownStream();
        setState("idle");
        resolver?.({ blob, mimeType: finalType, durationMs });
      });
      recorder.addEventListener("error", (ev: Event) => {
        const e = ev as Event & { error?: { message?: string } };
        setError(e.error?.message || "Recorder error");
      });

      // Live VU meter via a tap on the mic stream.
      const AudioContextCtor =
        (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
          .AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextCtor) {
        const ctx = new AudioContextCtor();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;
        const buffer = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteTimeDomainData(buffer);
          // RMS of the waveform, mapped to 0..1 with a bit of headroom.
          let sum = 0;
          for (let i = 0; i < buffer.length; i++) {
            const v = (buffer[i] ?? 128) - 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / buffer.length) / 128;
          setLevel(Math.min(1, rms * 2.5));
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      }

      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      recorder.start(250); // flush every 250 ms for low-latency stop
      setState("recording");
    } catch (err) {
      const e = err as Error & { name?: string };
      const msg =
        e.name === "NotAllowedError"
          ? "Microphone permission denied."
          : e.name === "NotFoundError"
            ? "No microphone was found on this device."
            : e.message || "Couldn't start the recorder.";
      setError(msg);
      teardownStream();
      setState("idle");
    }
  }, [state, teardownStream]);

  const stop = useCallback(async (): Promise<RecordedAudio | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      teardownStream();
      setState("idle");
      return null;
    }
    setState("stopping");
    return new Promise<RecordedAudio | null>((resolve) => {
      stopResolverRef.current = resolve;
      try {
        recorder.stop();
      } catch {
        resolve(null);
      }
    });
  }, [teardownStream]);

  const cancel = useCallback(() => {
    stopResolverRef.current?.(null);
    stopResolverRef.current = null;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {}
    }
    teardownStream();
    chunksRef.current = [];
    setState("idle");
  }, [teardownStream]);

  useEffect(() => () => cancel(), [cancel]);

  return { isSupported, state, level, error, start, stop, cancel };
}
