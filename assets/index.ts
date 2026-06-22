/**
 * index.ts
 * Tukang MCP Server — Entry Point
 *
 * Exposes 12 MCP tools for chat-native handyman booking:
 *   Category A: User Context & Memory (2 tools)
 *   Category B: Discovery & Search (3 tools)
 *   Category C: Quoting (1 tool)
 *   Category D: Introvert Mode — Vapi Proxy Calling (2 tools)
 *   Category E: Bid Results Presentation (2 tools)
 *   Category F: Booking & Payment (2 tools)
 *
 * Transport: HTTP (Streamable) on PORT 8000
 */

import "dotenv/config";
import express, { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "crypto";

import { initDatabase } from "./db/database.js";
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
} from "./tools/discovery.js";

import { quoteJob, quoteJobSchema } from "./tools/quoting.js";

import {
  callHandymanProxy,
  callHandymanProxySchema,
  callMultipleHandymenParallel,
  callMultipleHandymenParallelSchema,
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

// ─── MCP Server Setup ─────────────────────────────────────────────────────────

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "tukang",
    version: "1.0.0",
  });

  // ── Category A: User Context & Memory ──────────────────────────────────────

  server.tool(
    "get_saved_preferences",
    "Retrieve user's stored home info, budget, preferred handymen from Mem0 memory layer. Auto-fills future booking parameters.",
    getSavedPreferencesSchema.shape,
    async (args) => {
      const result = await getSavedPreferences(args);
      return { content: [{ type: "text", text: result }] };
    }
  );

  server.tool(
    "update_saved_preferences",
    "Save or update user preferences (address, budget, preferred handyman, access notes, language) in Mem0 for persistent storage across sessions.",
    updateSavedPreferencesSchema.shape,
    async (args) => {
      const result = await updateSavedPreferences(args);
      return { content: [{ type: "text", text: result }] };
    }
  );

  // ── Category B: Discovery & Search ─────────────────────────────────────────

  server.tool(
    "search_handymen",
    "Find handymen by service type, location, and budget. Mem0 auto-fills location and budget from saved preferences. Returns ranked list with ratings, prices, trust scores, and available times.",
    searchHandymenSchema.shape,
    async (args) => {
      const result = await searchHandymen(args);
      return { content: [{ type: "text", text: result }] };
    }
  );

  server.tool(
    "get_handyman_profile",
    "Get full handyman profile including reviews (5 most recent), ACRA business registration status, trust score breakdown (0-10), and available time slots.",
    getHandymanProfileSchema.shape,
    async (args) => {
      const result = await getHandymanProfile(args);
      return { content: [{ type: "text", text: result }] };
    }
  );

  server.tool(
    "compare_handyman_prices",
    "Compare pricing across all handymen for the same service type. Returns min/max/avg prices, best value recommendation (trust-score-to-price ratio), and full sorted comparison table.",
    compareHandymanPricesSchema.shape,
    async (args) => {
      const result = await compareHandymanPrices(args);
      return { content: [{ type: "text", text: result }] };
    }
  );

  // ── Category C: Quoting ─────────────────────────────────────────────────────

  server.tool(
    "quote_job",
    "Get estimated price range, duration, and inclusions for a specific job based on service type and complexity (basic/medium/complex). Applies location surcharges for remote areas.",
    quoteJobSchema.shape,
    async (args) => {
      const result = await quoteJob(args);
      return { content: [{ type: "text", text: result }] };
    }
  );

  // ── Category D: Introvert Mode — Vapi Proxy Calling ────────────────────────

  server.tool(
    "call_handyman_proxy",
    "INTROVERT MODE: Vapi calls ONE handyman ON YOUR BEHALF — you make ZERO phone calls. Vapi asks about availability, price, and datetime. Returns call status, transcription, price quoted, and availability.",
    callHandymanProxySchema.shape,
    async (args) => {
      const result = await callHandymanProxy(args);
      return { content: [{ type: "text", text: result }] };
    }
  );

  server.tool(
    "call_multiple_handymen_parallel",
    "INTROVERT MODE: Vapi calls 3-5 handymen IN PARALLEL on your behalf — you make ZERO calls. All calls happen simultaneously (Promise.all). Each handyman is told to standby for WhatsApp. Returns all responses ranked cheapest first.",
    callMultipleHandymenParallelSchema.shape,
    async (args) => {
      const result = await callMultipleHandymenParallel(args);
      return { content: [{ type: "text", text: result }] };
    }
  );

  // ── Category E: Bid Results Presentation ───────────────────────────────────

  server.tool(
    "present_bid_results",
    "Present call results from handymen in a chat-friendly ranked table with the cheapest highlighted. Shows total called, response times, prices, and availability. Formats output for direct display in Claude chat.",
    presentBidResultsSchema.shape,
    async (args) => {
      const result = await presentBidResults(args);
      return { content: [{ type: "text", text: result }] };
    }
  );

  server.tool(
    "accept_winning_bid",
    "User accepts the cheapest (or chosen) handyman. Triggers WhatsApp notification to winning handyman asking YES/NO confirmation. Sends rejection notices to runner-ups. Generates Stripe $5 platform fee payment link.",
    acceptWinningBidSchema.shape,
    async (args) => {
      const result = await acceptWinningBid(args);
      return { content: [{ type: "text", text: result }] };
    }
  );

  // ── Category F: Booking & Payment ──────────────────────────────────────────

  server.tool(
    "book_job",
    "Finalise booking after handyman accepts via WhatsApp. Creates confirmed booking record, generates Stripe $5 platform fee checkout link, and optionally triggers a Vapi confirmation call to the user. Explains the two-part payment structure.",
    bookJobSchema.shape,
    async (args) => {
      const result = await bookJob(args);
      return { content: [{ type: "text", text: result }] };
    }
  );

  server.tool(
    "notify_arrival",
    "Trigger WhatsApp voice/text alert when handyman is en_route, at_door, or delayed. Sends real-time notification to user's WhatsApp.",
    notifyArrivalSchema.shape,
    async (args) => {
      const result = await notifyArrival(args);
      return { content: [{ type: "text", text: result }] };
    }
  );

  return server;
}

// ─── Express HTTP Server ──────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Initialise SQLite database
  await initDatabase();
  console.log("✅ Database initialised");

  const app = express();
  app.use(express.json());

  // Session store for stateful transports
  const transports = new Map<string, StreamableHTTPServerTransport>();

  // ── MCP endpoint (POST /mcp) ────────────────────────────────────────────────
  app.post("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports.has(sessionId)) {
      transport = transports.get(sessionId)!;
    } else {
      // New session
      const newSessionId = randomUUID();
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
        onsessioninitialized: (id) => {
          transports.set(id, transport);
        },
      });

      transport.onclose = () => {
        if (transport.sessionId) {
          transports.delete(transport.sessionId);
        }
      };

      const server = createMcpServer();
      await server.connect(transport);
    }

    await transport.handleRequest(req, res, req.body);
  });

  // ── SSE endpoint (GET /mcp) — for streaming responses ──────────────────────
  app.get("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).json({ error: "Invalid or missing session ID" });
      return;
    }

    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res);
  });

  // ── DELETE /mcp — session cleanup ──────────────────────────────────────────
  app.delete("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res);
      transports.delete(sessionId);
    } else {
      res.status(404).json({ error: "Session not found" });
    }
  });

  // ── Stripe webhook endpoint ─────────────────────────────────────────────────
  app.post(
    "/webhooks/stripe",
    express.raw({ type: "application/json" }),
    async (req: Request, res: Response) => {
      const sig = req.headers["stripe-signature"] as string;
      try {
        const { constructWebhookEvent } = await import("./lib/stripe.js");
        const event = constructWebhookEvent(req.body as Buffer, sig);

        if (event.type === "checkout.session.completed") {
          const session = event.data.object as { metadata?: { booking_id?: string } };
          const bookingId = session.metadata?.booking_id;
          if (bookingId) {
            const { execute } = await import("./db/database.js");
            execute(
              "UPDATE bookings SET payment_status = 'paid', status = 'confirmed' WHERE id = ?",
              [bookingId]
            );
            console.log(`✅ Payment confirmed for booking ${bookingId}`);
          }
        }

        res.json({ received: true });
      } catch (err) {
        console.error("[Stripe Webhook] Error:", err);
        res.status(400).json({ error: "Webhook verification failed" });
      }
    }
  );

  // ── Payment success/cancel pages ────────────────────────────────────────────
  app.get("/payment/success", (req: Request, res: Response) => {
    const bookingId = req.query.booking_id as string;
    res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:40px">
        <h1>✅ Payment Successful!</h1>
        <p>Your $5 Tukang platform fee has been received.</p>
        <p>Booking ID: <strong>${bookingId}</strong></p>
        <p>Your handyman will arrive at the scheduled time. You will receive a WhatsApp notification when they are en route.</p>
      </body></html>
    `);
  });

  app.get("/payment/cancel", (req: Request, res: Response) => {
    const bookingId = req.query.booking_id as string;
    res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:40px">
        <h1>Payment Cancelled</h1>
        <p>Your booking (ID: <strong>${bookingId}</strong>) is still pending.</p>
        <p>Please return to the chat to complete payment.</p>
      </body></html>
    `);
  });

  // ── Health check ────────────────────────────────────────────────────────────
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      service: "tukang-mcp-server",
      version: "1.0.0",
      tools: 12,
      timestamp: new Date().toISOString(),
    });
  });

  // ── Start server ────────────────────────────────────────────────────────────
  app.listen(config.port, () => {
    console.log(`
🔨 Tukang MCP Server running on port ${config.port}

📡 MCP Endpoint:    http://localhost:${config.port}/mcp
🏥 Health Check:    http://localhost:${config.port}/health
💳 Stripe Webhook:  http://localhost:${config.port}/webhooks/stripe

🛠️  12 Tools Available:
   Category A — Memory:    get_saved_preferences, update_saved_preferences
   Category B — Discovery: search_handymen, get_handyman_profile, compare_handyman_prices
   Category C — Quoting:   quote_job
   Category D — Calling:   call_handyman_proxy, call_multiple_handymen_parallel
   Category E — Bids:      present_bid_results, accept_winning_bid
   Category F — Booking:   book_job, notify_arrival

💡 Zero context switching. Zero phone calls. Introvert mode ON.
    `);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
