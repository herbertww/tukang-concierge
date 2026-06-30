/**
 * index.ts
 * Tukang MCP Server — Entry Point
 *
 * Exposes 16 MCP tools for chat-native booking:
 *   Category A: User Context & Memory (2 tools)
 *   Category B: Discovery & Search (4 tools)
 *   Category C: Quoting (1 tool)
 *   Category D: Contractor Outreach via WhatsApp (2 tools)
 *   Category E: Bid Results Presentation (2 tools)
 *   Category F: Booking & Payment (2 tools)
 *   Category G: Provider Self-Registration & Reviews (3 tools)
 *
 * Transport: HTTP (Streamable) on PORT 8000
 */

import "dotenv/config";
import express, { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "crypto";
import path from "path";

import { initDatabase, execute, queryOne } from "./db/database.js";
import { config } from "./lib/config.js";

// ── Tool Handlers ─────────────────────────────────────────────────────────────
import {
  getSavedPreferences,
  getSavedPreferencesSchema,
  updateSavedPreferences,
  updateSavedPreferencesSchema,
} from "./tools/preferences.js";

import {
  searchHandymen,
  searchHandymenSchema,
  getHandymanProfile,
  getHandymanProfileSchema,
  compareHandymanPrices,
  compareHandymanPricesSchema,
  discoverServicesWeb,
  discoverServicesWebSchema,
} from "./tools/discovery.js";

import { quoteJob, quoteJobSchema } from "./tools/quoting.js";

import {
  whatsappHandyman,
  whatsappHandymanSchema,
  whatsappMultipleHandymen,
  whatsappMultipleHandymenSchema,
} from "./tools/calling.js";

import {
  presentBidResults,
  presentBidResultsSchema,
  acceptWinningBid,
  acceptWinningBidSchema,
} from "./tools/bids.js";

import {
  bookJob,
  bookJobSchema,
  notifyArrival,
  notifyArrivalSchema,
} from "./tools/booking.js";

import {
  registerProvider,
  registerProviderSchema,
  submitProviderReview,
  submitProviderReviewSchema,
  getProviderReviews,
  getProviderReviewsSchema,
} from "./tools/registration.js";

// ─── WhatsApp Inbound Message Parser ─────────────────────────────────────────

interface WAInboundMessage {
  from: string;
  text?: { body: string };
  id: string;
}

interface WAEntry {
  changes: Array<{
    value: {
      messages?: WAInboundMessage[];
      metadata: { phone_number_id: string };
    };
  }>;
}

/**
 * Attempts to parse a price from a handyman's WhatsApp reply.
 * Handles formats like: "RM80", "$80", "80 ringgit", "I can do it for 80"
 */
function parsePrice(text: string): number | null {
  const patterns = [
    /RM\s*([\d.]+)/i,                         // RM80
    /\$([\d.]+)/,                              // $80
    /SGD\s*([\d.]+)/i,                         // SGD 80
    /([\d.]+)\s*(?:dollars?|ringgit|sgd|bucks)/i, // 80 ringgit
    /(?:for|at|quote[sd]?:?)\s*RM?\$?([\d.]+)/i,  // for 80 / for RM80
    /^([\d.]+)$/,                              // bare number
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return parseFloat(m[1]);
  }
  return null;
}

/**
 * Attempts to parse availability from a handyman's WhatsApp reply.
 */
function parseAvailability(text: string): boolean {
  const unavailable = /(not available|unavailable|cannot|can't|no slot|fully booked|busy|no\b)/i.test(text);
  if (unavailable) return false;
  const available = /(available|yes|can do|sure|ok|confirm|accept|on board|boleh)/i.test(text);
  return available;
}

/**
 * Attempts to parse a datetime string from a handyman's WhatsApp reply.
 */
function parseDatetime(text: string): string | null {
  const m = text.match(
    /(?:today|tomorrow|esok|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)[^\n]*?(?:\d{1,2}(?::\d{2})?\s*(?:am|pm))/i
  );
  return m ? m[0].trim() : null;
}

// ─── MCP Server Setup ─────────────────────────────────────────────────────────

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "tukang",
    version: "1.2.0",
  });

  // ── Category A: User Context & Memory ──────────────────────────────────────
  server.tool(
    "get_saved_preferences",
    "Retrieve user's stored home info, budget, preferred handymen from Mem0 memory layer. Auto-fills future booking parameters.",
    getSavedPreferencesSchema.shape,
    async (args) => ({ content: [{ type: "text", text: await getSavedPreferences(args) }] })
  );
  server.tool(
    "update_saved_preferences",
    "Save or update user preferences (address, budget, preferred handyman, access notes, language) in Mem0 for persistent storage across sessions.",
    updateSavedPreferencesSchema.shape,
    async (args) => ({ content: [{ type: "text", text: await updateSavedPreferences(args) }] })
  );

  // ── Category B: Discovery & Search ─────────────────────────────────────────
  server.tool(
    "search_handymen",
    "Find handymen by service type, location, and budget. Mem0 auto-fills location and budget from saved preferences. Returns ranked list with ratings, prices, trust scores, and available times.",
    searchHandymenSchema.shape,
    async (args) => ({ content: [{ type: "text", text: await searchHandymen(args) }] })
  );
  server.tool(
    "get_handyman_profile",
    "Get full handyman profile including reviews (5 most recent), business registration status, trust score breakdown (0-10), and available time slots.",
    getHandymanProfileSchema.shape,
    async (args) => ({ content: [{ type: "text", text: await getHandymanProfile(args) }] })
  );
  server.tool(
    "compare_handyman_prices",
    "Compare pricing across all handymen for the same service type. Returns min/max/avg prices, best value recommendation (trust-score-to-price ratio), and full sorted comparison table.",
    compareHandymanPricesSchema.shape,
    async (args) => ({ content: [{ type: "text", text: await compareHandymanPrices(args) }] })
  );
  server.tool(
    "discover_services_web",
    "Search the LIVE WEB (via Exa) for real local service providers beyond the seeded directory. Returns unverified leads normalized to the same shape as search_handymen (tagged source:'web') with their contact MASKED. Use when the seeded directory has no/too few matches; reach a lead with whatsapp_multiple_handymen using its id — the number is resolved server-side and only revealed after the platform fee is paid.",
    discoverServicesWebSchema.shape,
    async (args) => ({ content: [{ type: "text", text: await discoverServicesWeb(args) }] })
  );

  // ── Category C: Quoting ─────────────────────────────────────────────────────
  server.tool(
    "quote_job",
    "Get estimated price range, duration, and inclusions for a specific job based on service type and complexity (basic/medium/complex). Applies location surcharges for remote areas.",
    quoteJobSchema.shape,
    async (args) => ({ content: [{ type: "text", text: await quoteJob(args) }] })
  );

  // ── Category D: Contractor Outreach via WhatsApp ────────────────────────────
  server.tool(
    "whatsapp_handyman",
    "Send a WhatsApp message to ONE contractor on the customer's behalf asking for availability, price, and datetime. Pass the handyman_id — the number is resolved server-side, so you never need (and won't receive) the contractor's number. Returns session_id to track replies. Contractor replies are captured automatically by the inbound webhook.",
    whatsappHandymanSchema.shape,
    async (args) => ({ content: [{ type: "text", text: await whatsappHandyman(args) }] })
  );
  server.tool(
    "whatsapp_multiple_handymen",
    "Send WhatsApp messages to 1-5 contractors IN PARALLEL on the customer's behalf. Pass handyman_id for each — numbers are resolved server-side, never exposed to you. All messages sent simultaneously. Returns a shared session_id — use present_bid_results with it to see contractor replies as they arrive via webhook.",
    whatsappMultipleHandymenSchema.shape,
    async (args) => ({ content: [{ type: "text", text: await whatsappMultipleHandymen(args) }] })
  );

  // ── Category E: Bid Results Presentation ───────────────────────────────────
  server.tool(
    "present_bid_results",
    "Present bid results in a chat-friendly ranked table. Pass session_id to auto-fetch live WhatsApp replies from DB (no manual input). Falls back to manual call_results array if no session_id.",
    presentBidResultsSchema.shape,
    async (args) => ({ content: [{ type: "text", text: await presentBidResults(args) }] })
  );
  server.tool(
    "accept_winning_bid",
    "User accepts the cheapest (or chosen) contractor. Triggers WhatsApp confirmation message to winner asking YES/NO. Sends rejection notices to runner-ups. Generates Stripe $5 platform fee payment link.",
    acceptWinningBidSchema.shape,
    async (args) => ({ content: [{ type: "text", text: await acceptWinningBid(args) }] })
  );

  // ── Category F: Booking & Payment ──────────────────────────────────────────
  server.tool(
    "book_job",
    "Finalise booking after contractor accepts via WhatsApp. Creates confirmed booking record, generates Stripe $5 platform fee checkout link.",
    bookJobSchema.shape,
    async (args) => ({ content: [{ type: "text", text: await bookJob(args) }] })
  );
  server.tool(
    "notify_arrival",
    "Send WhatsApp notification when contractor is en_route, at_door, or delayed. Sends real-time update to user's WhatsApp.",
    notifyArrivalSchema.shape,
    async (args) => ({ content: [{ type: "text", text: await notifyArrival(args) }] })
  );

  // ── Category G: Provider Self-Registration & Reviews ───────────────────────
  server.tool(
    "register_provider",
    "Self-registration for handymen, beauticians, and facialists. Submits an application to join the Tukang network. Supports all provider types with ratings, business verification, and portfolio links.",
    registerProviderSchema.shape,
    async (args) => ({ content: [{ type: "text", text: await registerProvider(args) }] })
  );
  server.tool(
    "submit_provider_review",
    "Submit a star rating (1-5) and written review for a handyman or provider after a completed job. Automatically recalculates their average rating.",
    submitProviderReviewSchema.shape,
    async (args) => ({ content: [{ type: "text", text: await submitProviderReview(args) }] })
  );
  server.tool(
    "get_provider_reviews",
    "Fetch all reviews for a specific provider, including average rating, total review count, and formatted review history.",
    getProviderReviewsSchema.shape,
    async (args) => ({ content: [{ type: "text", text: await getProviderReviews(args) }] })
  );

  return server;
}

// ─── Express HTTP Server ──────────────────────────────────────────────────────

async function main(): Promise<void> {
  await initDatabase();
  console.log("✅ Database initialised");

  const app = express();
  app.use(express.json());

  const transports = new Map<string, StreamableHTTPServerTransport>();

  // ── MCP endpoint ────────────────────────────────────────────────────────────
  app.post("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport: StreamableHTTPServerTransport;
    if (sessionId && transports.has(sessionId)) {
      transport = transports.get(sessionId)!;
    } else {
      const newSessionId = randomUUID();
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
        onsessioninitialized: (id) => { transports.set(id, transport); },
      });
      transport.onclose = () => { if (transport.sessionId) transports.delete(transport.sessionId); };
      const server = createMcpServer();
      await server.connect(transport);
    }
    await transport.handleRequest(req, res, req.body);
  });

  app.get("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).json({ error: "Invalid or missing session ID" });
      return;
    }
    await transports.get(sessionId)!.handleRequest(req, res);
  });

  app.delete("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (sessionId && transports.has(sessionId)) {
      await transports.get(sessionId)!.handleRequest(req, res);
      transports.delete(sessionId);
    } else {
      res.status(404).json({ error: "Session not found" });
    }
  });

  // ── WhatsApp Webhook — GET (Meta verification handshake) ────────────────────
  app.get("/webhooks/whatsapp", (req: Request, res: Response) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      console.log("✅ WhatsApp webhook verified");
      res.status(200).send(challenge);
    } else {
      console.warn("[WhatsApp Webhook] Verification failed — token mismatch");
      res.status(403).json({ error: "Forbidden" });
    }
  });

  // ── WhatsApp Webhook — POST (inbound messages from contractors) ─────────────
  app.post("/webhooks/whatsapp", async (req: Request, res: Response) => {
    try {
      const body = req.body as { object: string; entry: WAEntry[] };

      if (body.object !== "whatsapp_business_account") {
        res.sendStatus(404);
        return;
      }

      for (const entry of body.entry ?? []) {
        for (const change of entry.changes ?? []) {
          const messages = change.value?.messages ?? [];
          for (const msg of messages) {
            const fromPhone = msg.from;
            const text = msg.text?.body ?? "";
            const waId = msg.id;

            if (!text) continue;

            // Look up contractor by phone
            const handyman = queryOne<{ id: string; name: string }>(
              "SELECT id, name FROM handymen WHERE REPLACE(phone, '+', '') = ? OR REPLACE(whatsapp, '+', '') = ?",
              [fromPhone, fromPhone]
            );

            if (!handyman) {
              console.log(`[WhatsApp] Inbound from unknown number ${fromPhone}: ${text}`);
              continue;
            }

            // Find latest open session for this contractor
            const latestSession = queryOne<{ session_id: string }>(
              `SELECT session_id FROM handyman_quotes
               WHERE handyman_id = ?
               ORDER BY received_at DESC LIMIT 1`,
              [handyman.id]
            );

            const sessionId = latestSession?.session_id ?? randomUUID();
            const price = parsePrice(text);
            const available = parseAvailability(text);
            const datetime = parseDatetime(text);

            // Upsert quote
            const existing = queryOne(
              "SELECT id FROM handyman_quotes WHERE session_id = ? AND handyman_id = ?",
              [sessionId, handyman.id]
            );

            if (existing) {
              execute(
                `UPDATE handyman_quotes SET raw_message = ?, price_quoted = ?, available = ?,
                 datetime_offered = ?, wa_msg_id = ?, received_at = datetime('now')
                 WHERE session_id = ? AND handyman_id = ?`,
                [text, price, available ? 1 : 0, datetime, waId, sessionId, handyman.id]
              );
            } else {
              execute(
                `INSERT INTO handyman_quotes
                 (id, session_id, handyman_id, handyman_phone, raw_message, price_quoted, available, datetime_offered, wa_msg_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [randomUUID(), sessionId, handyman.id, fromPhone, text, price, available ? 1 : 0, datetime, waId]
              );
            }

            // Log to whatsapp_messages
            execute(
              `INSERT INTO whatsapp_messages (id, handyman_id, direction, message, wa_msg_id)
               VALUES (?, ?, 'inbound', ?, ?)`,
              [randomUUID(), handyman.id, text, waId]
            );

            console.log(
              `[WhatsApp] 📩 ${handyman.name}: "${text}" | price=RM${price ?? 'n/a'} available=${available} datetime=${datetime ?? 'n/a'}`
            );
          }
        }
      }

      res.sendStatus(200);
    } catch (err) {
      console.error("[WhatsApp Webhook] Error:", err);
      res.sendStatus(500);
    }
  });

  // ── Stripe webhook ──────────────────────────────────────────────────────────
  // On successful payment we mark the booking paid/confirmed and auto-connect the
  // customer with the contractor. Shared by both the checkout.session.completed and
  // payment_intent.succeeded paths (a Checkout Session in mode:payment creates a
  // PaymentIntent, so either event can fulfil the booking).
  async function fulfilPaidBooking(bookingId: string): Promise<void> {
    execute(
      "UPDATE bookings SET payment_status = 'paid', status = 'confirmed' WHERE id = ?",
      [bookingId]
    );
    console.log(`✅ Payment confirmed for booking ${bookingId}`);

    // Fee paid → hand the customer's number to the contractor so the two
    // can coordinate (and exchange photos) directly. Free in-window msg.
    const booking = queryOne<{
      handyman_id: string;
      user_phone: string | null;
      service_type: string;
      datetime: string;
      address: string;
    }>(
      "SELECT handyman_id, user_phone, service_type, datetime, address FROM bookings WHERE id = ?",
      [bookingId]
    );
    if (booking?.user_phone) {
      const { resolveProvider } = await import("./lib/contact.js");
      const { sendCustomerConnectionNotice } = await import("./lib/whatsapp.js");
      const provider = resolveProvider(booking.handyman_id);
      if (provider?.phone) {
        await sendCustomerConnectionNotice({
          handymanName: provider.name,
          handymanPhone: provider.phone,
          customerPhone: booking.user_phone,
          serviceType: booking.service_type,
          datetime: booking.datetime,
          address: booking.address,
          bookingId,
        });
      }
    } else {
      console.warn(`[Stripe Webhook] No user_phone on booking ${bookingId}; contractor not auto-connected.`);
    }
  }

  async function handleStripeWebhook(req: Request, res: Response): Promise<void> {
    const sig = req.headers["stripe-signature"] as string;
    try {
      const { constructWebhookEvent } = await import("./lib/stripe.js");
      const event = constructWebhookEvent(req.body as Buffer, sig);

      switch (event.type) {
        case "checkout.session.completed":
        case "payment_intent.succeeded": {
          // Both event payloads carry our booking metadata (see createServiceFeeCheckout).
          const obj = event.data.object as { metadata?: { booking_id?: string } };
          const bookingId = obj.metadata?.booking_id;
          if (bookingId) {
            await fulfilPaidBooking(bookingId);
          } else {
            console.warn(`[Stripe Webhook] ${event.type} had no booking_id metadata.`);
          }
          break;
        }
        case "payment_intent.payment_failed": {
          const obj = event.data.object as { metadata?: { booking_id?: string } };
          const bookingId = obj.metadata?.booking_id;
          if (bookingId) {
            execute(
              "UPDATE bookings SET payment_status = 'failed' WHERE id = ?",
              [bookingId]
            );
            console.warn(`[Stripe Webhook] Payment failed for booking ${bookingId}.`);
          }
          break;
        }
        case "payment_intent.created":
          // Informational only — payment kicked off, nothing to fulfil yet.
          break;
        default:
          break;
      }
      res.json({ received: true });
    } catch (err) {
      console.error("[Stripe Webhook] Error:", err);
      res.status(400).json({ error: "Webhook verification failed" });
    }
  }

  // Primary route (matches the registered Stripe endpoint); /webhooks/stripe kept as alias.
  app.post(
    "/api/payments/webhook",
    express.raw({ type: "application/json" }),
    handleStripeWebhook
  );
  app.post(
    "/webhooks/stripe",
    express.raw({ type: "application/json" }),
    handleStripeWebhook
  );

  // ── Payment pages ───────────────────────────────────────────────────────────
  app.get("/payment/success", async (req: Request, res: Response) => {
    const bookingId = req.query.booking_id as string;

    // Reaching this page means Stripe checkout succeeded, so it's a legitimate
    // moment to hand the contractor's number to the customer.
    let contactBlock = "";
    const booking = queryOne<{ handyman_id: string }>(
      "SELECT handyman_id FROM bookings WHERE id = ?",
      [bookingId]
    );
    if (booking) {
      const { resolveProvider } = await import("./lib/contact.js");
      const provider = resolveProvider(booking.handyman_id);
      if (provider?.phone) {
        contactBlock = `<p>You're now connected with <strong>${provider.name}</strong>.</p>
      <p>WhatsApp them directly: <strong>${provider.phone}</strong><br>
      <small>You can send photos of the problem and sort out timing together.</small></p>`;
      }
    }

    res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:40px">
      <h1>✅ Payment Successful!</h1>
      <p>Your platform fee has been received.</p>
      <p>Booking ID: <strong>${bookingId}</strong></p>
      ${contactBlock}
    </body></html>`);
  });

  app.get("/payment/cancel", (req: Request, res: Response) => {
    const bookingId = req.query.booking_id as string;
    res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:40px">
      <h1>Payment Cancelled</h1>
      <p>Your booking (ID: <strong>${bookingId}</strong>) is still pending.</p>
      <p>Please return to the chat to complete payment.</p>
    </body></html>`);
  });

  // ── Health check ────────────────────────────────────────────────────────────
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      service: "tukang-mcp-server",
      version: "1.2.0",
      tools: 16,
      webhooks: ["/webhooks/whatsapp", "/api/payments/webhook", "/webhooks/stripe"],
      timestamp: new Date().toISOString(),
    });
  });

  // ── Landing page (static marketing site) ─────────────────────────────────────
  // Registered last so all API/MCP/webhook routes take precedence. Serves
  // tukang-site/index.html at "/" and static assets (logo, etc.) so visitors
  // hitting tukang.app land on the marketing page.
  app.use(express.static(path.join(process.cwd(), "tukang-site")));

  app.listen(config.port, () => {
    console.log(`
🔨 Tukang MCP Server v1.2.0 running on port ${config.port}

📡 MCP Endpoint:       http://localhost:${config.port}/mcp
🏥 Health Check:       http://localhost:${config.port}/health
💳 Stripe Webhook:     http://localhost:${config.port}/api/payments/webhook
📲 WhatsApp Webhook:   http://localhost:${config.port}/webhooks/whatsapp

🛠️  16 Tools Available:
   Category A — Memory:        get_saved_preferences, update_saved_preferences
   Category B — Discovery:     search_handymen, get_handyman_profile, compare_handyman_prices, discover_services_web
   Category C — Quoting:       quote_job
   Category D — Outreach:      whatsapp_handyman, whatsapp_multiple_handymen
   Category E — Bids:          present_bid_results, accept_winning_bid
   Category F — Booking:       book_job, notify_arrival
   Category G — Registration:  register_provider, submit_provider_review, get_provider_reviews

💡 Contractor WhatsApp replies are captured automatically via inbound webhook.
    `);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
