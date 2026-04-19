/**
 * POST /api/voice/record
 *
 * Accepts a single audio file as multipart/form-data under the field
 * name "audio". Runs it through the voice-intent pipeline:
 *     audio → Gemini → Mongo customer → Mongo purchase
 * and returns the saved record plus supporting context for the
 * confirmation screen.
 *
 * This runs in the Node.js runtime (the `mongodb` driver + the
 * `@google/genai` SDK are not edge-compatible).
 */

import { NextResponse } from "next/server";
import { runVoiceIntent } from "@khata/server/actions/voice-intent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Gemini inline-data limit is 20 MB; pick a friendly cap below that.
const MAX_AUDIO_BYTES = 18 * 1024 * 1024;

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (err) {
    return NextResponse.json(
      { error: "Expected multipart/form-data with an `audio` field." },
      { status: 400 },
    );
  }

  const file = formData.get("audio");
  if (!file || typeof file === "string") {
    return NextResponse.json(
      { error: "Missing `audio` file in form data." },
      { status: 400 },
    );
  }

  const blob = file as File;
  if (blob.size === 0) {
    return NextResponse.json(
      { error: "Audio file is empty." },
      { status: 400 },
    );
  }
  if (blob.size > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      {
        error: `Audio file is too large (${Math.round(blob.size / 1024 / 1024)}MB). Max 18MB.`,
      },
      { status: 413 },
    );
  }

  const mimeType = blob.type || "audio/webm";
  const buffer = Buffer.from(await blob.arrayBuffer());

  try {
    const result = await runVoiceIntent({ audio: buffer, mimeType });
    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    const error = err as Error & { code?: string; intent?: unknown };
    console.error("[/api/voice/record] pipeline failed:", error);
    const status = error.code === "AMBIGUOUS_INTENT" || error.code === "MISSING_AMOUNT" ? 422 : 500;
    return NextResponse.json(
      {
        ok: false,
        error: error.message || "Voice pipeline failed.",
        code: error.code,
        intent: error.intent ?? null,
      },
      { status },
    );
  }
}
