/**
 * stripe.ts
 * Stripe integration for Tukang's $5 service fee.
 * Creates Checkout Sessions and handles webhook events.
 */

import Stripe from "stripe";
import { config } from "./config.js";

let stripeClient: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripeClient) {
    if (!config.stripe.secretKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured.");
    }
    stripeClient = new Stripe(config.stripe.secretKey, {
      apiVersion: "2024-04-10",
    });
  }
  return stripeClient;
}

export interface CheckoutSessionResult {
  sessionId: string;
  paymentUrl: string;
  expiresAt: number;
}

/**
 * Create a Stripe Checkout Session for the $5 service fee.
 */
export async function createServiceFeeCheckout(params: {
  bookingId: string;
  userId: string;
  handymanName: string;
  serviceType: string;
  userEmail?: string;
}): Promise<CheckoutSessionResult> {
  if (!config.stripe.secretKey) {
    // Dev mode — return a simulated link
    const fakeSessionId = `sim_cs_${Date.now()}`;
    return {
      sessionId: fakeSessionId,
      paymentUrl: `${config.stripe.publicUrl}/payment/simulate?session=${fakeSessionId}&booking=${params.bookingId}`,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    };
  }

  const stripe = getStripe();
  const service = params.serviceType.replace(/_/g, " ");

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: 500, // $5.00 in cents
          product_data: {
            name: "Tukang Service Fee",
            description: `Platform fee for connecting you with ${params.handymanName} for ${service} service. This is separate from the handyman's rate, which you pay directly upon job completion.`,
            images: [],
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      booking_id: params.bookingId,
      user_id: params.userId,
      handyman_name: params.handymanName,
      service_type: params.serviceType,
    },
    success_url: `${config.stripe.publicUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}&booking_id=${params.bookingId}`,
    cancel_url: `${config.stripe.publicUrl}/payment/cancel?booking_id=${params.bookingId}`,
    ...(params.userEmail ? { customer_email: params.userEmail } : {}),
    expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour
  };

  const session = await stripe.checkout.sessions.create(sessionParams);

  return {
    sessionId: session.id,
    paymentUrl: session.url!,
    expiresAt: session.expires_at,
  };
}

/**
 * Verify a Stripe webhook signature and return the event.
 */
export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  const stripe = getStripe();
  return stripe.webhooks.constructEvent(
    payload,
    signature,
    config.stripe.webhookSecret
  );
}

/**
 * Retrieve a Checkout Session by ID.
 */
export async function getCheckoutSession(
  sessionId: string
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  return stripe.checkout.sessions.retrieve(sessionId);
}
