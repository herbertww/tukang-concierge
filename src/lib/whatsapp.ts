/**
 * whatsapp.ts
 * WhatsApp Business API integration for Tukang.
 * Sends acceptance/rejection notifications to handymen.
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 */

import axios from "axios";
import { config } from "./config.js";

const waClient = axios.create({
  baseURL: config.whatsapp.baseUrl,
  headers: {
    Authorization: `Bearer ${config.whatsapp.token}`,
    "Content-Type": "application/json",
  },
  timeout: 15_000,
});

export interface WASendResult {
  messageId: string | null;
  success: boolean;
  error?: string;
}

/**
 * Send a text message to a WhatsApp number.
 */
export async function sendWhatsAppMessage(
  toPhone: string,
  message: string
): Promise<WASendResult> {
  if (!config.whatsapp.token || !config.whatsapp.phoneNumberId) {
    console.log(`[WhatsApp SIM] To: ${toPhone}\nMessage: ${message}`);
    return { messageId: `sim_wa_${Date.now()}`, success: true };
  }

  try {
    const res = await waClient.post<{
      messages: Array<{ id: string }>;
    }>(`/${config.whatsapp.phoneNumberId}/messages`, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: toPhone.replace(/\D/g, ""),
      type: "text",
      text: { body: message },
    });

    return {
      messageId: res.data.messages[0]?.id ?? null,
      success: true,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[WhatsApp] Send error:", msg);
    return { messageId: null, success: false, error: msg };
  }
}

/**
 * Send a booking acceptance notification to a handyman.
 */
export async function sendAcceptanceNotification(params: {
  handymanName: string;
  handymanPhone: string;
  serviceType: string;
  datetime: string;
  address: string;
  price: number;
  bookingId: string;
  stripeLink?: string;
}): Promise<WASendResult> {
  const service = params.serviceType.replace(/_/g, " ");
  const message = `
🎉 *Booking Confirmed — Tukang*

Hello ${params.handymanName}!

A customer has selected YOUR bid. Here are the details:

📋 *Service:* ${service}
📅 *Date/Time:* ${params.datetime}
📍 *Address:* ${params.address}
💰 *Agreed Price:* $${params.price}
🔖 *Booking ID:* ${params.bookingId}

Please reply *YES* to confirm you accept this booking, or *NO* to decline.

If you accept, the customer will complete a $5 platform fee payment and you will receive full contact details.

_Powered by Tukang — Zero Phone Calls_
  `.trim();

  return sendWhatsAppMessage(params.handymanPhone, message);
}

/**
 * Send a booking rejection / next-handyman notice.
 */
export async function sendRejectionNotice(
  handymanName: string,
  handymanPhone: string,
  bookingId: string
): Promise<WASendResult> {
  const message = `
Hello ${handymanName},

Thank you for your quote on booking *${bookingId}*.

Unfortunately, the customer has selected another handyman for this job.

We will keep you in mind for future bookings!

_Tukang Team_
  `.trim();

  return sendWhatsAppMessage(handymanPhone, message);
}

/**
 * Send an arrival/status notification to a user.
 */
export async function sendArrivalNotification(
  userPhone: string,
  handymanName: string,
  notificationType: "en_route" | "at_door" | "delayed"
): Promise<WASendResult> {
  const messages: Record<string, string> = {
    en_route: `🚗 *${handymanName} is on the way!*\n\nYour handyman is en route and will arrive shortly.\n\n_Tukang_`,
    at_door: `🚪 *${handymanName} has arrived!*\n\nYour handyman is at the door. Please let them in.\n\n_Tukang_`,
    delayed: `⏰ *${handymanName} is running late*\n\nYour handyman has been delayed. They will update you shortly.\n\n_Tukang_`,
  };

  return sendWhatsAppMessage(userPhone, messages[notificationType]);
}
