/**
 * booking.ts
 * Tool 11: book_job
 * Tool 12: notify_arrival
 */

import { z } from "zod";
import { execute, queryOne } from "../db/database.js";
import { createServiceFeeCheckout } from "../lib/stripe.js";
import { makeVapiCall } from "../lib/vapi.js";
import { sendArrivalNotification } from "../lib/whatsapp.js";

// ─── Tool 11: book_job ────────────────────────────────────────────────────────

export const bookJobSchema = z.object({
  booking_id: z.string().describe("Booking ID from accept_winning_bid."),
  user_phone: z.string().optional().describe("User's phone number for Vapi confirmation call."),
  user_id: z.string().optional().describe("User ID."),
  user_email: z.string().optional().describe("User email for Stripe receipt."),
});

export type BookJobInput = z.infer<typeof bookJobSchema>;

interface BookingRow {
  id: string;
  user_id: string;
  handyman_id: string;
  service_type: string;
  address: string;
  datetime: string;
  price: number;
  status: string;
  stripe_session: string | null;
  payment_status: string;
}

interface HandymanRow {
  id: string;
  name: string;
  phone: string;
  whatsapp: string | null;
}

export async function bookJob(input: BookJobInput): Promise<string> {
  const booking = queryOne<BookingRow>(
    "SELECT * FROM bookings WHERE id = ?",
    [input.booking_id]
  );

  if (!booking) {
    return JSON.stringify({ error: `Booking ${input.booking_id} not found.` });
  }

  if (booking.status === "confirmed") {
    return JSON.stringify({
      message: "Booking already confirmed.",
      booking_id: booking.id,
      stripe_link: booking.stripe_session
        ? `Payment session: ${booking.stripe_session}`
        : null,
    });
  }

  const handyman = queryOne<HandymanRow>(
    "SELECT id, name, phone, whatsapp FROM handymen WHERE id = ?",
    [booking.handyman_id]
  );

  // Create or retrieve Stripe session
  let stripeLink: string | null = null;
  let stripeSessionId = booking.stripe_session;

  if (!stripeSessionId) {
    try {
      const checkout = await createServiceFeeCheckout({
        bookingId: booking.id,
        userId: input.user_id ?? booking.user_id,
        handymanName: handyman?.name ?? "Handyman",
        serviceType: booking.service_type,
        userEmail: input.user_email,
      });
      stripeLink = checkout.paymentUrl;
      stripeSessionId = checkout.sessionId;

      execute(
        "UPDATE bookings SET stripe_session = ? WHERE id = ?",
        [stripeSessionId, booking.id]
      );
    } catch (err) {
      console.error("[Stripe] Error:", err);
    }
  }

  // Update booking status to confirmed
  execute(
    "UPDATE bookings SET status = 'confirmed' WHERE id = ?",
    [booking.id]
  );

  // Optional: Vapi confirmation call to user
  let confirmationCall = null;
  if (input.user_phone && handyman) {
    try {
      const callResult = await makeVapiCall({
        handymanId: handyman.id,
        handymanName: handyman.name,
        handymanPhone: input.user_phone,
        purpose: "booking",
        serviceType: booking.service_type,
        datetime: booking.datetime,
        address: booking.address,
        bookingId: booking.id,
      });
      confirmationCall = {
        call_id: callResult.callId,
        status: callResult.callStatus,
      };
    } catch (err) {
      console.error("[Vapi] Confirmation call error:", err);
    }
  }

  const service = booking.service_type.replace(/_/g, " ");

  return JSON.stringify({
    booking_id: booking.id,
    status: "confirmed",
    handyman: handyman
      ? { id: handyman.id, name: handyman.name, whatsapp: handyman.whatsapp ?? handyman.phone }
      : null,
    service_type: service,
    datetime: booking.datetime,
    address: booking.address,
    handyman_rate: booking.price,
    stripe_link: stripeLink,
    stripe_session_id: stripeSessionId,
    confirmation_call: confirmationCall,
    payment_explanation: [
      `💳 Platform fee: $5 (pay via Stripe link above)`,
      `💰 Handyman rate: $${booking.price} (pay ${handyman?.name ?? "handyman"} directly upon completion)`,
      `📋 Booking ID: ${booking.id}`,
    ],
    what_happens_next: [
      "1. Pay the $5 platform fee via the Stripe link.",
      `2. ${handyman?.name ?? "Your handyman"} will arrive at ${booking.datetime}.`,
      "3. You will receive a WhatsApp notification when they are en route.",
      `4. Pay $${booking.price} directly to ${handyman?.name ?? "the handyman"} after the job is done.`,
    ],
  });
}

// ─── Tool 12: notify_arrival ──────────────────────────────────────────────────

export const notifyArrivalSchema = z.object({
  booking_id: z.string().describe("Booking ID."),
  notification_type: z
    .enum(["en_route", "at_door", "delayed"])
    .describe("Type of arrival notification."),
  user_phone: z.string().optional().describe("User's phone for WhatsApp notification."),
});

export type NotifyArrivalInput = z.infer<typeof notifyArrivalSchema>;

export async function notifyArrival(input: NotifyArrivalInput): Promise<string> {
  const booking = queryOne<BookingRow>(
    "SELECT * FROM bookings WHERE id = ?",
    [input.booking_id]
  );

  if (!booking) {
    return JSON.stringify({ error: `Booking ${input.booking_id} not found.` });
  }

  const handyman = queryOne<HandymanRow>(
    "SELECT id, name FROM handymen WHERE id = ?",
    [booking.handyman_id]
  );

  const handymanName = handyman?.name ?? "Your handyman";

  // Send WhatsApp notification to user
  let waResult = null;
  if (input.user_phone) {
    waResult = await sendArrivalNotification(
      input.user_phone,
      handymanName,
      input.notification_type
    );
  }

  const messages: Record<string, string> = {
    en_route: `${handymanName} is on the way to ${booking.address}.`,
    at_door: `${handymanName} has arrived at ${booking.address}.`,
    delayed: `${handymanName} is running late. They will update you shortly.`,
  };

  return JSON.stringify({
    booking_id: booking.id,
    notification_type: input.notification_type,
    handyman_name: handymanName,
    message: messages[input.notification_type],
    whatsapp_sent: waResult?.success ?? false,
    whatsapp_message_id: waResult?.messageId ?? null,
    timestamp: new Date().toISOString(),
  });
}
