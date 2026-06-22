/**
 * bids.ts
 * Tool 9: present_bid_results  — auto-reads from handyman_quotes DB table
 * Tool 10: accept_winning_bid
 */

import { z } from "zod";
import { execute, queryAll, queryOne } from "../db/database.js";
import {
  sendAcceptanceNotification,
  sendRejectionNotice,
} from "../lib/whatsapp.js";
import { createServiceFeeCheckout } from "../lib/stripe.js";
import { v4 as uuidv4 } from "uuid";

// ─── Tool 9: present_bid_results ──────────────────────────────────────────────

const CallResultItemSchema = z.object({
  handyman_id: z.string(),
  name: z.string(),
  call_status: z.string(),
  availability: z.boolean(),
  price_quoted: z.number().nullable(),
  datetime_offered: z.string().nullable(),
  rating: z.number().optional(),
  trust_score: z.number().optional(),
  response_time_seconds: z.number().optional(),
  whatsapp: z.string().optional().nullable(),
  is_cheapest: z.boolean().optional(),
});

export const presentBidResultsSchema = z.object({
  session_id: z
    .string()
    .optional()
    .describe(
      "Session ID from contact_multiple_handymen / call_multiple_handymen_parallel. " +
      "If provided, results are auto-fetched from the database (no manual input needed)."
    ),
  call_results: z
    .array(CallResultItemSchema)
    .optional()
    .describe(
      "Manual call results array. Only required if session_id is not provided."
    ),
  sort_by: z
    .enum(["price", "datetime", "rating"])
    .default("price")
    .describe("Sort order for the bid table."),
  total_called: z.number().optional().describe("Total number of handymen called."),
  names_called: z.array(z.string()).optional().describe("Names of all handymen called."),
  total_time_seconds: z.number().optional().describe("Total time taken for parallel calls."),
});

export type PresentBidResultsInput = z.infer<typeof presentBidResultsSchema>;

interface QuoteRow {
  id: string;
  handyman_id: string;
  handyman_phone: string;
  raw_message: string;
  price_quoted: number | null;
  available: number;
  datetime_offered: string | null;
  received_at: string;
}

interface HandymanRow {
  id: string;
  name: string;
  rating: number;
  trust_score: number;
  whatsapp: string | null;
}

export async function presentBidResults(
  input: PresentBidResultsInput
): Promise<string> {
  let results: Array<{
    handyman_id: string;
    name: string;
    call_status: string;
    availability: boolean;
    price_quoted: number | null;
    datetime_offered: string | null;
    rating?: number;
    trust_score?: number;
    response_time_seconds?: number;
    whatsapp?: string | null;
  }> = [];

  // ── Auto-fetch from DB if session_id provided ──────────────────────────────
  if (input.session_id) {
    const quotes = queryAll<QuoteRow>(
      `SELECT * FROM handyman_quotes WHERE session_id = ? ORDER BY price_quoted ASC`,
      [input.session_id]
    );

    results = quotes.map((q) => {
      const handyman = queryOne<HandymanRow>(
        "SELECT id, name, rating, trust_score, whatsapp FROM handymen WHERE id = ?",
        [q.handyman_id]
      );
      return {
        handyman_id: q.handyman_id,
        name: handyman?.name ?? q.handyman_phone,
        call_status: q.available ? "success" : "unavailable",
        availability: q.available === 1,
        price_quoted: q.price_quoted,
        datetime_offered: q.datetime_offered,
        rating: handyman?.rating,
        trust_score: handyman?.trust_score,
        whatsapp: handyman?.whatsapp ?? q.handyman_phone,
      };
    });
  } else if (input.call_results?.length) {
    // ── Fallback: use manually-passed results ────────────────────────────────
    results = input.call_results.map((r) => ({
      ...r,
      availability: r.availability,
    }));
  } else {
    return JSON.stringify({
      error: "Provide either session_id (auto DB lookup) or call_results array.",
    });
  }

  const available = results
    .filter((r) => r.availability && r.price_quoted !== null)
    .sort((a, b) => {
      if (input.sort_by === "price") return (a.price_quoted ?? 999) - (b.price_quoted ?? 999);
      if (input.sort_by === "rating") return (b.rating ?? 0) - (a.rating ?? 0);
      return 0;
    });

  const totalCalled = input.total_called ?? results.length;
  const namesCalled = input.names_called ?? results.map((r) => r.name);
  const timeSeconds = input.total_time_seconds ?? 0;

  const tableRows = available
    .slice(0, 5)
    .map((r, i) => {
      const rank = i === 0 ? "1⭐" : `${i + 1}`;
      const badge = i === 0 ? " 🏆 CHEAPEST" : "";
      const price = r.price_quoted ? `$${r.price_quoted}` : "TBD";
      const time = r.datetime_offered ?? "TBD";
      const rating = r.rating ? `${r.rating}⭐` : "N/A";
      const response = r.response_time_seconds ? `${r.response_time_seconds}s` : "N/A";
      return `| ${rank}   | ${r.name.padEnd(8)} | ${price.padEnd(6)} | ${time.padEnd(11)} | ${rating.padEnd(6)} | ${response.padEnd(8)} |${badge}`;
    })
    .join("\n");

  const cheapest = available[0];
  const source = input.session_id ? "📲 Live WhatsApp replies (auto-fetched)" : "📞 Vapi call results";

  const formattedOutput = `
✅ Source: ${source}

📞 TOTAL CONTACTED: ${totalCalled} (${namesCalled.join(", ")})
${timeSeconds ? `⏱️ Time: ${timeSeconds} seconds` : ""}

👍 RESPONSIVE + AVAILABLE: ${available.length}

🏆 TOP ${Math.min(available.length, 5)} (CHEAPEST FIRST):

| Rank | Name     | Price  | Time        | Rating | Response |
|------|----------|--------|-------------|--------|----------|
${tableRows || "| — | No responses yet | — | — | — | — |"}

💡 You made ZERO calls. Tukang handled all outreach for you.
${cheapest ? `💬 Reply "Book ${cheapest.name}" to accept cheapest ($${cheapest.price_quoted}).` : "No handymen available at this time. Try expanding your search area."}
  `.trim();

  return JSON.stringify({
    formatted_output: formattedOutput,
    source: input.session_id ? "db" : "manual",
    available_count: available.length,
    cheapest: cheapest
      ? {
          handyman_id: cheapest.handyman_id,
          name: cheapest.name,
          price: cheapest.price_quoted,
          datetime: cheapest.datetime_offered,
          whatsapp: cheapest.whatsapp,
        }
      : null,
    all_available: available.map((r, i) => ({
      rank: i + 1,
      handyman_id: r.handyman_id,
      name: r.name,
      price: r.price_quoted,
      datetime: r.datetime_offered,
      rating: r.rating,
      whatsapp: r.whatsapp,
    })),
  });
}

// ─── Tool 10: accept_winning_bid ──────────────────────────────────────────────

export const acceptWinningBidSchema = z.object({
  handyman_id: z.string().describe("ID of the winning handyman."),
  booking_details: z.object({
    datetime: z.string().describe("Agreed datetime for the job."),
    address: z.string().describe("Service address."),
    price: z.number().describe("Agreed price in SGD."),
    service_type: z.string().describe("Service type."),
  }),
  user_id: z.string().optional().describe("User ID for Stripe metadata."),
  runner_up_handymen: z
    .array(
      z.object({
        handyman_id: z.string(),
        name: z.string(),
        whatsapp: z.string().optional().nullable(),
      })
    )
    .optional()
    .describe("Other handymen who responded (will receive rejection notices)."),
});

export type AcceptWinningBidInput = z.infer<typeof acceptWinningBidSchema>;

interface HandymanRowFull {
  id: string;
  name: string;
  phone: string;
  whatsapp: string | null;
}

export async function acceptWinningBid(
  input: AcceptWinningBidInput
): Promise<string> {
  const handyman = queryOne<HandymanRowFull>(
    "SELECT id, name, phone, whatsapp FROM handymen WHERE id = ?",
    [input.handyman_id]
  );

  if (!handyman) {
    return JSON.stringify({ error: `Handyman ${input.handyman_id} not found.` });
  }

  const bookingId = uuidv4();
  const userId = input.user_id ?? "default_user";

  execute(
    `INSERT INTO bookings (id, user_id, handyman_id, service_type, address, datetime, price, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [
      bookingId,
      userId,
      handyman.id,
      input.booking_details.service_type,
      input.booking_details.address,
      input.booking_details.datetime,
      input.booking_details.price,
    ]
  );

  const waPhone = handyman.whatsapp ?? handyman.phone;
  const waResult = await sendAcceptanceNotification({
    handymanName: handyman.name,
    handymanPhone: waPhone,
    serviceType: input.booking_details.service_type,
    datetime: input.booking_details.datetime,
    address: input.booking_details.address,
    price: input.booking_details.price,
    bookingId,
  });

  if (input.runner_up_handymen?.length) {
    for (const ru of input.runner_up_handymen) {
      const ruPhone = ru.whatsapp ?? "";
      if (ruPhone) {
        await sendRejectionNotice(ru.name, ruPhone, bookingId);
      }
    }
  }

  let stripeLink: string | null = null;
  let stripeSessionId: string | null = null;
  try {
    const checkout = await createServiceFeeCheckout({
      bookingId,
      userId,
      handymanName: handyman.name,
      serviceType: input.booking_details.service_type,
    });
    stripeLink = checkout.paymentUrl;
    stripeSessionId = checkout.sessionId;
    execute(
      "UPDATE bookings SET stripe_session = ? WHERE id = ?",
      [stripeSessionId, bookingId]
    );
  } catch (err) {
    console.error("[Stripe] Checkout creation failed:", err);
  }

  return JSON.stringify({
    booking_id: bookingId,
    status: "pending_acceptance",
    handyman: { id: handyman.id, name: handyman.name, whatsapp: waPhone },
    whatsapp_sent: waResult.success,
    whatsapp_message_id: waResult.messageId,
    stripe_payment_link: stripeLink,
    stripe_session_id: stripeSessionId,
    acceptance_status: "waiting_for_handyman_reply",
    payment_explanation:
      "The $5 Tukang platform fee connects you with the handyman. " +
      "The handyman's rate ($" +
      input.booking_details.price +
      ") is paid directly to them upon job completion.",
    next_steps: [
      `${handyman.name} has been notified via WhatsApp and asked to reply YES or NO.`,
      "Once they confirm, complete the $5 platform fee via the Stripe link.",
      "You will receive a WhatsApp confirmation once payment is complete.",
    ],
  });
}
