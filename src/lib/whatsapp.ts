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

/** Pull Meta's actual error body out of an Axios failure instead of just the HTTP status. */
function describeWaError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const apiError = err.response?.data?.error;
    if (apiError) {
      return `[${apiError.code ?? "?"}] ${apiError.message ?? "unknown"}${apiError.error_data?.details ? ` — ${apiError.error_data.details}` : ""}`;
    }
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
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
    const msg = describeWaError(err);
    console.error("[WhatsApp] Send error:", msg);
    return { messageId: null, success: false, error: msg };
  }
}

/**
 * Send a pre-approved TEMPLATE message. Required for business-initiated
 * (cold) outreach — Meta rejects free-form text outside an open 24h window.
 * `bodyParams` fill the template's {{1}}, {{2}}, … in order; each must be a
 * non-empty single-line string (Meta rejects empty params / newlines / 5+ spaces).
 */
export async function sendWhatsAppTemplate(params: {
  toPhone: string;
  templateName: string;
  languageCode?: string;
  bodyParams: string[];
}): Promise<WASendResult> {
  const { toPhone, templateName, bodyParams } = params;
  const languageCode = params.languageCode ?? "en";

  if (!config.whatsapp.token || !config.whatsapp.phoneNumberId) {
    console.log(
      `[WhatsApp SIM] To: ${toPhone}\nTemplate: ${templateName} (${languageCode})\nParams: ${JSON.stringify(bodyParams)}`
    );
    return { messageId: `sim_wa_tpl_${Date.now()}`, success: true };
  }

  try {
    const res = await waClient.post<{ messages: Array<{ id: string }> }>(
      `/${config.whatsapp.phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: toPhone.replace(/\D/g, ""),
        type: "template",
        template: {
          name: templateName,
          language: { code: languageCode },
          components: bodyParams.length
            ? [
                {
                  type: "body",
                  parameters: bodyParams.map((text) => ({ type: "text", text })),
                },
              ]
            : [],
        },
      }
    );

    return { messageId: res.data.messages[0]?.id ?? null, success: true };
  } catch (err: unknown) {
    const msg = describeWaError(err);
    console.error("[WhatsApp] Template send error:", msg);
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

If you accept, the customer will complete a $5 Concierge fee payment and you will receive full contact details.

_Powered by Tukang — Zero Phone Calls_
  `.trim();

  return sendWhatsAppMessage(params.handymanPhone, message);
}

/**
 * Sent to the contractor the moment the $5 Concierge fee is paid: hands over the
 * customer's number so the two can coordinate (and exchange photos) directly.
 * This is a free-form message inside the contractor's open 24h window (they
 * replied to accept), so it costs nothing.
 */
export async function sendCustomerConnectionNotice(params: {
  handymanName: string;
  handymanPhone: string;
  customerPhone: string;
  serviceType: string;
  datetime: string;
  address: string;
  bookingId: string;
}): Promise<WASendResult> {
  const service = params.serviceType.replace(/_/g, " ");
  const message = `
✅ *Payment received — you're connected!*

Hi ${params.handymanName}, the Concierge fee for booking *${params.bookingId}* is paid. You can now coordinate directly with the customer:

📱 *Customer WhatsApp:* ${params.customerPhone}
📋 *Service:* ${service}
📅 *When:* ${params.datetime}
📍 *Where:* ${params.address}

Message them directly to confirm details — they may send photos of the problem. Any rescheduling is between you and the customer.

_Powered by Tukang_
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
