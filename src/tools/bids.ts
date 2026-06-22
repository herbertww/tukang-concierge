/**
 * bids.ts
 * Tool 9: present_bid_results
 * Tool 10: accept_winning_bid
 */

import { z } from "zod";
import { execute, queryOne } from "../db/database.js";
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
  call_results: z
    .array(CallResultItemSchema)
    .describe("Array of call results from call_multiple_handymen_parallel."),
  sort_by: z
    .enum(["price", "datetime", "rating"])
    .default("price")
    .describe("Sort order for the bid table."),
  total_called: z.number().optional().describe("Total number of handymen called."),
  names_called: z.array(z.string()).optional().describe("Names of all handymen called."),
  total_time_seconds: z.number().optional().describe("Total time taken for parallel calls."),
});

export type PresentBidResultsInput = z.infer<typeof presentBidResultsSchema>;

export async function presentBidResults(
  input: PresentBidResultsInput
): Promise<string> {
  const available = input.call_results
    .filter((r) => r.availability && r.price_quoted !== null)
    .sort((a, b) => {
      if (input.sort_by === "price") return (a.price_quoted ?? 999) - (b.price_quoted ?? 999);
      if (input.sort_by === "rating") return (b.rating ?? 0) - (a.rating ?? 0);
      return 0; // datetime sort — keep original order
    });

  const totalCalled = input.total_called ?? input.call_results.length;
  const namesCalled = input.names_called ?? input.call_results.map((r) => r.name);
  const timeSeconds = input.total_time_seconds ?? 0;

  // Build chat-friendly formatted table
  const tableRows = available
    .slice(0, 5)
    .map((r, i) => {
      const rank = i === 0 ? "1⭐" : `${i + 1}`;
      const badge = i === 0 ? " 🏆 CHEAPEST" : "";
      const price = `$${r.price_quoted}`;
      const time = r.datetime_offered ?? "TBD";
      const rating = r.rating ? `${r.rating}⭐` : "N/A";
      const response = r.response_time_seconds ? `${r.response_time_seconds}s` : "N/A";
      return `| ${rank}   | ${r.name.padEnd(8)} | ${price.padEnd(6)} | ${time.padEnd(11)} | ${rating.padEnd(6)} | ${response.padEnd(8)} |${badge}`;
    })
    .join("\n");

  const cheapest = available[0];

  const formattedOutput = `
✅ Vapi called ${totalCalled} handymen parallel on YOUR BEHALF:

📞 TOTAL CALLED: ${totalCalled} (${namesCalled.join(", ")})
⏱️ Time: ${timeSeconds} seconds (parallel)

👍 RESPONSIVE + AVAILABLE: ${available.length}

🏆 TOP ${Math.min(available.length, 5)} (CHEAPEST FIRST):

| Rank | Name     | Price  | Time        | Rating | Response |
|------|----------|--------|-------------|--------|----------|
${tableRows}

💡 You made ZERO calls. Vapi did all calling for you.
${cheapest ? `💬 Reply "Book ${cheapest.name}" to accept cheapest.` : "No handymen available at this time."}
  `.trim();

  return JSON.stringify({
    formatted_output: formattedOutput,
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

interface HandymanRow {
  id: string;
  name: string;
  phone: string;
  whatsapp: string | null;
}

export async function acceptWinningBid(
  input: AcceptWinningBidInput
): Promise<string> {
  const handyman = queryOne<HandymanRow>(
    "SELECT id, name, phone, whatsapp FROM handymen WHERE id = ?",
    [input.handyman_id]
  );

  if (!handyman) {
    return JSON.stringify({ error: `Handyman ${input.handyman_id} not found.` });
  }

  const bookingId = uuidv4();
  const userId = input.user_id ?? "default_user";

  // Create pending booking
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

  // Send WhatsApp acceptance notification to winning handyman
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

  // Send rejection notices to runner-ups
  if (input.runner_up_handymen?.length) {
    for (const ru of input.runner_up_handymen) {
      const ruPhone = ru.whatsapp ?? "";
      if (ruPhone) {
        await sendRejectionNotice(ru.name, ruPhone, bookingId);
      }
    }
  }

  // Create Stripe checkout session
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
    handyman: {
      id: handyman.id,
      name: handyman.name,
      whatsapp: waPhone,
    },
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
