/**
 * POST /api/voice/undo
 *
 * Body: { "purchaseId": "<mongo oid hex>" }
 *
 * Deletes the purchase document created by the preceding /api/voice/record
 * call. The owner triggers this from the "Undo" button on the confirmation
 * screen. We don't delete the customer even if it was freshly created —
 * that way, if the owner immediately re-records the same instruction, the
 * customer lookup resolves cleanly.
 */

import { NextResponse } from "next/server";
import { undoVoiceIntent } from "@khata/server/actions/voice-intent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { purchaseId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Expected JSON body with `purchaseId`." },
      { status: 400 },
    );
  }

  const id = body.purchaseId;
  if (!id || typeof id !== "string") {
    return NextResponse.json(
      { error: "`purchaseId` is required." },
      { status: 400 },
    );
  }

  try {
    const deleted = await undoVoiceIntent(id);
    return NextResponse.json({ ok: deleted });
  } catch (err) {
    const error = err as Error;
    console.error("[/api/voice/undo] delete failed:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Undo failed." },
      { status: 500 },
    );
  }
}
