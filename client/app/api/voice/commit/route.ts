/**
 * POST /api/voice/commit
 *
 * Follow-up to /api/voice/record when the original utterance was
 * ambiguous (two or more near-exact customer matches). The client sends
 * back the raw Gemini intent plus the customerId the shopkeeper picked
 * on the disambiguation screen; the server re-runs the purchase /
 * payment / query_bills handler with the customer forced — no second
 * Gemini call, no fuzzy matching.
 *
 * Request body: { intent: GeminiIntent, customerId: string }
 */

import { NextResponse } from "next/server";
import { commitVoiceIntent } from "@khata/server/actions/voice-intent";
import type { GeminiIntent } from "@khata/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CommitBody {
  intent?: GeminiIntent;
  customerId?: string;
}

export async function POST(request: Request) {
  let body: CommitBody;
  try {
    body = (await request.json()) as CommitBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Body must be JSON." },
      { status: 400 },
    );
  }

  if (!body.intent || typeof body.customerId !== "string" || !body.customerId) {
    return NextResponse.json(
      { ok: false, error: "Missing `intent` or `customerId` in body." },
      { status: 400 },
    );
  }

  try {
    const result = await commitVoiceIntent({
      intent: body.intent,
      customerId: body.customerId,
    });
    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    const error = err as Error & { code?: string };
    console.error("[/api/voice/commit] failed:", error);
    const status = error.code === "CUSTOMER_NOT_FOUND" ? 404 : 400;
    return NextResponse.json(
      { ok: false, error: error.message, code: error.code },
      { status },
    );
  }
}
