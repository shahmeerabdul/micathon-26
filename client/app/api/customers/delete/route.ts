/**
 * POST /api/customers/delete
 *
 * Body: { mongoCustomerId?: string, whatsappNumber?: string }
 * Deletes all purchases for that customer, then the customer row.
 */

import { NextResponse } from "next/server";
import {
  deleteCustomerCascade,
  getCustomerByWhatsAppNumber,
} from "@khata/server/db/customers";
import { normalizeWhatsAppNumber } from "@khata/server/integrations/twilio-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const b = body as {
    mongoCustomerId?: string;
    whatsappNumber?: string;
  };

  let customerId = typeof b.mongoCustomerId === "string" ? b.mongoCustomerId.trim() : "";
  if (!customerId && typeof b.whatsappNumber === "string") {
    const normalized = normalizeWhatsAppNumber(b.whatsappNumber);
    if (normalized) {
      const found = await getCustomerByWhatsAppNumber(normalized);
      if (found) customerId = found.id;
    }
  }

  if (!customerId) {
    return NextResponse.json(
      { ok: false, error: "Missing valid mongoCustomerId or whatsappNumber." },
      { status: 400 },
    );
  }

  const deleted = await deleteCustomerCascade(customerId);
  return NextResponse.json({ ok: true, deleted });
}
