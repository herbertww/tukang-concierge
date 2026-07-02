/**
 * concierge.ts
 * Onsite Concierge — backend for the landing-page chat widget (POST /api/concierge).
 *
 * Same Qwen Cloud brain as the MCP flow, scoped for an anonymous web visitor:
 * short replies, providers grounded in the seeded directory, and a
 * [[CHECKOUT: <provider> | <service>]] marker in the model output that the
 * server converts into a pending booking + Stripe checkout link. Contact
 * details never appear in replies — the S$5 fee unlocks them (same gate as
 * the MCP tools; the directory snapshot below carries no phone numbers).
 *
 * Degrades without QWEN_API_KEY to a scripted demo flow, and without
 * STRIPE_SECRET_KEY createServiceFeeCheckout already returns a simulated link,
 * so the widget works end-to-end on an empty .env.
 */

import { randomUUID } from "crypto";
import { queryAll, queryOne, execute } from "../db/database.js";
import { qwenChatCompletion, QwenMessage } from "./qwen.js";
import { createServiceFeeCheckout } from "./stripe.js";
import { config } from "./config.js";

export interface ConciergeCheckout {
  bookingId: string;
  sessionId: string;
  paymentUrl: string;
}

export interface ConciergeResult {
  reply: string;
  checkout?: ConciergeCheckout;
  model: string;
}

interface DirectoryRow {
  id: string;
  name: string;
  service_types: string;
  location: string;
  rating: number;
  price_min: number;
  price_max: number;
}

const CHECKOUT_RE = /\[\[\s*CHECKOUT:\s*([^|\]]+?)\s*\|\s*([^\]]+?)\s*\]\]/i;

function topProviders(limit = 12): DirectoryRow[] {
  return queryAll<DirectoryRow>(
    `SELECT id, name, service_types, location, rating, price_min, price_max
     FROM handymen WHERE available = 1
     ORDER BY trust_score DESC, rating DESC LIMIT ?`,
    [limit]
  );
}

function describeServices(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.join(", ");
  } catch {
    /* stored as plain text */
  }
  return raw;
}

function buildSystemPrompt(): string {
  const rows = topProviders();
  const directory = rows.length
    ? rows
        .map(
          (r) =>
            `- ${r.name} — ${describeServices(r.service_types)} — ${r.location} — ⭐${r.rating} — S$${r.price_min}–${r.price_max}`
        )
        .join("\n")
    : "(directory is empty — apologise and suggest connecting Tukang to an AI app instead)";

  return `You are the Tukang onsite Concierge — the chat widget on tukang.app, Singapore's chat-native home-services booking service.

RULES
- Singapore home services only. Currency is always SGD.
- Keep every reply under 90 words. Warm, direct, no markdown headings.
- First gather the essentials in ONE message: what the job is, where (neighbourhood), and when.
- Then recommend 2-3 providers ONLY from the directory below, with rating and price range.
- NEVER reveal any provider's phone or WhatsApp. Contact is unlocked only after the S$5 Concierge fee is paid via Stripe — that fee is the product.
- When the user clearly confirms which provider to book, end your reply with exactly: [[CHECKOUT: <provider name> | <service type>]] — it is replaced by a Stripe payment button. Never mention the marker or show it as text otherwise.
- After payment, the success page shows the provider's direct WhatsApp so they can coordinate.

PROVIDER DIRECTORY (contact withheld)
${directory}`;
}

// ─── Scripted fallback (no QWEN_API_KEY / API error) ─────────────────────────

function simulatedConcierge(messages: QwenMessage[]): string {
  const userTurns = messages.filter((m) => m.role === "user").length;
  const last = (messages[messages.length - 1]?.content ?? "").toLowerCase();
  const rows = topProviders(3);

  if (rows.length === 0) {
    return "Our provider directory is warming up — try again shortly, or add Tukang to your AI app above for the full experience.";
  }

  if (userTurns <= 1) {
    return "Can do! Quick details so I get you accurate bids: 1) What exactly needs fixing? 2) Which neighbourhood are you in? 3) When do you want it done?";
  }

  const picked =
    rows.find((r) => last.includes(r.name.toLowerCase().split(" ")[0])) ??
    (/\b(book|yes|ok|confirm|first|cheapest|go)\b/.test(last) ? rows[0] : undefined);

  if (userTurns >= 3 && picked) {
    const service = describeServices(picked.service_types).split(",")[0].trim() || "handyman";
    return `Great choice — ${picked.name} it is. Pay the S$5 Concierge fee below to lock it in and unlock their direct WhatsApp. [[CHECKOUT: ${picked.name} | ${service}]]`;
  }

  const bids = rows
    .map((r) => `${r.name} (⭐${r.rating}, S$${r.price_min}–${r.price_max}, ${r.location})`)
    .join(" · ");
  return `Here's who's available: ${bids}. Reply with a name to book — the S$5 fee unlocks their direct contact.`;
}

// ─── Checkout ────────────────────────────────────────────────────────────────

async function buildCheckout(
  providerName: string,
  serviceType: string,
  userId: string
): Promise<ConciergeCheckout> {
  const name = providerName.trim().slice(0, 80);
  const service = serviceType.trim().slice(0, 40) || "general";
  const provider = queryOne<{ id: string; name: string }>(
    "SELECT id, name FROM handymen WHERE LOWER(name) = LOWER(?)",
    [name]
  );

  const bookingId = `web_chat_${randomUUID().slice(0, 8)}`;
  execute(
    `INSERT INTO bookings (id, user_id, handyman_id, service_type, address, datetime, status, payment_status, notes)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', 'unpaid', ?)`,
    [
      bookingId,
      userId,
      provider?.id ?? "web-unmatched",
      service,
      "TBC — collected after payment",
      "TBC",
      "Created via onsite Concierge chat widget",
    ]
  );

  const checkout = await createServiceFeeCheckout({
    bookingId,
    userId,
    handymanName: provider?.name ?? name,
    serviceType: service,
  });
  execute("UPDATE bookings SET stripe_session = ? WHERE id = ?", [
    checkout.sessionId,
    bookingId,
  ]);

  return { bookingId, sessionId: checkout.sessionId, paymentUrl: checkout.paymentUrl };
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function handleConciergeChat(
  messages: QwenMessage[],
  userId = "web-visitor"
): Promise<ConciergeResult> {
  let reply: string;
  let model: string;

  if (!config.qwen.apiKey) {
    reply = simulatedConcierge(messages);
    model = "concierge-sim";
  } else {
    const res = await qwenChatCompletion(
      [{ role: "system", content: buildSystemPrompt() }, ...messages],
      { temperature: 0.6 }
    );
    // qwenChatCompletion falls back to its own placeholder on API errors —
    // swap that for the scripted flow so the widget stays usable.
    if (res.model.endsWith("-sim")) {
      reply = simulatedConcierge(messages);
      model = "concierge-sim";
    } else {
      reply = res.content;
      model = res.model;
    }
  }

  let checkout: ConciergeCheckout | undefined;
  const marker = reply.match(CHECKOUT_RE);
  if (marker) {
    reply = reply.replace(CHECKOUT_RE, "").trim();
    try {
      checkout = await buildCheckout(marker[1], marker[2], userId);
    } catch (err) {
      console.error("[Concierge] checkout creation failed:", err);
      reply += "\n\n(Payment link couldn't be created just now — please try again.)";
    }
  }

  return { reply, checkout, model };
}
