/**
 * contact.ts
 * Single source of truth for contractor contact disclosure.
 *
 * Business rule (load-bearing): the contractor's phone/WhatsApp number is the
 * asset the $5 Concierge fee sells ("connects you with the handyman"). Names are
 * never sensitive; numbers are. A curated-directory contractor's number must
 * NEVER appear in a tool's output until the customer has actually PAID the fee
 * for a booking with that contractor.
 *
 * Every user-facing tool routes contact disclosure through `contactForOutput`.
 * Outreach resolves the real number server-side via `resolveHandymanPhone` so
 * the number never has to cross the wire to the client at all.
 */

import { queryOne } from "../db/database.js";

interface CountRow {
  cnt: number;
}

/**
 * Mask a phone number for display, keeping a short country prefix + last 4
 * digits (e.g. "+65 •••• 4567"). Enough for the user to recognise the right
 * contractor, not enough to contact them off-platform.
 */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  const last4 = digits.slice(-4);
  const prefix = phone.trim().startsWith("+") ? `+${digits.slice(0, 2)} ` : "";
  return `${prefix}•••• ${last4}`;
}

/**
 * True once the customer has PAID the Concierge fee for a booking with this
 * contractor. This is the gate — `payment_status='paid'` is set only by the
 * Stripe webhook (src/index.ts), so it cannot be forged from the client side.
 */
export function isContactUnlocked(handymanId: string): boolean {
  const row = queryOne<CountRow>(
    "SELECT COUNT(*) AS cnt FROM bookings WHERE handyman_id = ? AND payment_status = 'paid'",
    [handymanId]
  );
  return (row?.cnt ?? 0) > 0;
}

export interface ProviderCore {
  id: string;
  name: string;
  /** Outreach number (whatsapp preferred), empty string if none on record. */
  phone: string;
  source: "directory" | "web";
}

/**
 * Resolve a provider's core identity + outreach number server-side, from the
 * curated directory OR the web_leads table. Both sources are gated identically —
 * the number this returns is for server-side use (outreach/booking), never for
 * direct output. Use `contactForOutput` to decide what the client may see.
 */
export function resolveProvider(id: string): ProviderCore | null {
  const h = queryOne<{ id: string; name: string; phone: string; whatsapp: string | null }>(
    "SELECT id, name, phone, whatsapp FROM handymen WHERE id = ?",
    [id]
  );
  if (h) return { id: h.id, name: h.name, phone: h.whatsapp ?? h.phone, source: "directory" };

  const w = queryOne<{ id: string; name: string; phone: string | null }>(
    "SELECT id, name, phone FROM web_leads WHERE id = ?",
    [id]
  );
  if (w) return { id: w.id, name: w.name, phone: w.phone ?? "", source: "web" };

  return null;
}

/**
 * Server-side resolution of a provider's outreach number, curated or web. Used
 * by the WhatsApp outreach tools so the client never needs to hold the number.
 */
export function resolveHandymanPhone(handymanId: string): string | null {
  return resolveProvider(handymanId)?.phone || null;
}

/**
 * The ONLY way a contact number should reach a tool's output. Returns the real
 * number once the fee is paid for this contractor, otherwise a mask. Pass the
 * real number you looked up server-side; this decides whether to reveal it.
 */
export function contactForOutput(
  handymanId: string,
  realPhone: string | null
): string | null {
  if (!realPhone) return null;
  return isContactUnlocked(handymanId) ? realPhone : maskPhone(realPhone);
}
