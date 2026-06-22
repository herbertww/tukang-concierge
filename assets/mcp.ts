/**
 * Tukang MCP Server — 12 tools, zero user setup required.
 * All API keys are pre-configured server-side.
 * Introvert Mode uses WhatsApp text outreach — no phone calls, no call charges.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { nanoid } from "nanoid";
import type { Request, Response, NextFunction } from "express";
import {
  searchHandymen,
  getHandymanById,
  getHandymanReviews,
  createBooking,
  saveCallResult,
  getCallResultsBySession,
} from "./db";
import { getMemories, addMemory, parsePreferences } from "./lib/mem0";
import {
  requestQuoteViaWhatsApp,
  requestQuotesFromMultiple,
  sendAcceptanceNotice,
  sendRejectionNotice,
  sendArrivalAlert,
} from "./lib/whatsapp";
import { createPlatformFeeCheckout } from "./lib/stripe";

// ─── Quote logic ──────────────────────────────────────────────────────────────

const QUOTE_TABLE: Record<
  string,
  Record<string, { min: number; max: number; duration: string; inclusions: string[] }>
> = {
  plumbing: {
    simple: { min: 60, max: 100, duration: "1–2 hours", inclusions: ["Labour", "Basic parts"] },
    moderate: { min: 100, max: 200, duration: "2–4 hours", inclusions: ["Labour", "Parts", "Pipe replacement"] },
    complex: { min: 200, max: 400, duration: "Half day", inclusions: ["Labour", "All parts", "Full pipe rerouting"] },
  },
  electrical: {
    simple: { min: 80, max: 150, duration: "1–2 hours", inclusions: ["Labour", "Basic components"] },
    moderate: { min: 150, max: 300, duration: "2–4 hours", inclusions: ["Labour", "Components", "Testing"] },
    complex: { min: 300, max: 600, duration: "Full day", inclusions: ["Labour", "All materials", "Inspection cert"] },
  },
  aircon: {
    simple: { min: 50, max: 80, duration: "1 hour", inclusions: ["Chemical wash", "Filter clean"] },
    moderate: { min: 80, max: 200, duration: "2–3 hours", inclusions: ["Chemical overhaul", "Gas top-up check"] },
    complex: { min: 200, max: 500, duration: "Half day", inclusions: ["Full installation", "Piping", "Commissioning"] },
  },
  carpentry: {
    simple: { min: 70, max: 120, duration: "1–2 hours", inclusions: ["Labour", "Basic hardware"] },
    moderate: { min: 120, max: 250, duration: "2–4 hours", inclusions: ["Labour", "Materials", "Custom fitting"] },
    complex: { min: 250, max: 600, duration: "1–2 days", inclusions: ["Labour", "All materials", "Custom build"] },
  },
  painting: {
    simple: { min: 40, max: 100, duration: "2–3 hours", inclusions: ["Labour", "1 coat", "Touch-up"] },
    moderate: { min: 100, max: 300, duration: "1 day", inclusions: ["Labour", "2 coats", "Primer"] },
    complex: { min: 300, max: 800, duration: "2–3 days", inclusions: ["Labour", "Full repaint", "Primer", "Putty"] },
  },
  general: {
    simple: { min: 45, max: 80, duration: "1 hour", inclusions: ["Labour", "Basic hardware"] },
    moderate: { min: 80, max: 150, duration: "2–3 hours", inclusions: ["Labour", "Materials"] },
    complex: { min: 150, max: 300, duration: "Half day", inclusions: ["Labour", "All materials"] },
  },
};

function getQuote(serviceType: string, complexity: string) {
  const svc = serviceType.toLowerCase().replace(/[_\s]+/g, "");
  const key = Object.keys(QUOTE_TABLE).find((k) => svc.includes(k)) ?? "general";
  const level = (["simple", "moderate", "complex"].includes(complexity) ? complexity : "moderate") as
    | "simple"
    | "moderate"
    | "complex";
  return QUOTE_TABLE[key]![level]!;
}

// ─── MCP Server factory ───────────────────────────────────────────────────────

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "tukang",
    version: "1.0.0",
  });

  // ── Tool 1: get_saved_preferences ──────────────────────────────────────────
  server.tool(
    "get_saved_preferences",
    "Retrieve the user's saved preferences (address, budget, preferred handyman) from Mem0 memory.",
    { user_id: z.string().describe("A stable identifier for this user, e.g. their email or a session ID") },
    async ({ user_id }) => {
      const memories = await getMemories(user_id);
      const prefs = parsePreferences(memories);
      const raw = memories.map((m) => m.memory);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              user_id,
              preferences: prefs,
              raw_memories: raw,
              count: memories.length,
              note: memories.length === 0
                ? "No saved preferences yet. Use update_saved_preferences to save some."
                : `Found ${memories.length} memory entries.`,
            }, null, 2),
          },
        ],
      };
    }
  );

  // ── Tool 2: update_saved_preferences ──────────────────────────────────────
  server.tool(
    "update_saved_preferences",
    "Save or update the user's preferences (address, budget, preferred handyman) in Mem0 memory.",
    {
      user_id: z.string().describe("A stable identifier for this user"),
      preferences: z.object({
        address: z.string().optional().describe("Home or default service address"),
        budget: z.string().optional().describe("Budget range, e.g. '$100-$200'"),
        preferred_handyman: z.string().optional().describe("Name or ID of preferred handyman"),
        area: z.string().optional().describe("Preferred service area or district"),
        notes: z.string().optional().describe("Any other preferences"),
      }),
    },
    async ({ user_id, preferences }) => {
      const parts: string[] = [];
      if (preferences.address) parts.push(`My home address is: ${preferences.address}`);
      if (preferences.budget) parts.push(`My budget for handyman services is: ${preferences.budget}`);
      if (preferences.preferred_handyman) parts.push(`My preferred handyman is: ${preferences.preferred_handyman}`);
      if (preferences.area) parts.push(`I prefer handymen in: ${preferences.area}`);
      if (preferences.notes) parts.push(preferences.notes);

      if (parts.length === 0) {
        return { content: [{ type: "text", text: "No preferences provided to save." }] };
      }

      const content = parts.join(". ");
      const saved = await addMemory(user_id, content);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: saved,
              saved_content: content,
              message: saved
                ? "Preferences saved successfully. They will be auto-filled in future searches."
                : "Preferences noted locally (Mem0 not configured on server).",
            }, null, 2),
          },
        ],
      };
    }
  );

  // ── Tool 3: search_handymen ────────────────────────────────────────────────
  server.tool(
    "search_handymen",
    "Search for available handymen by service type, location, and budget. Returns matching handymen sorted by rating.",
    {
      service_type: z.string().optional().describe("Type of service needed, e.g. 'plumbing', 'aircon', 'electrical', 'carpentry', 'painting', 'general'"),
      area: z.string().optional().describe("District or area in Singapore, e.g. 'Tampines', 'Jurong', 'Tiong Bahru'"),
      max_budget: z.number().optional().describe("Maximum budget in SGD"),
      min_rating: z.number().optional().describe("Minimum rating (1–5)"),
    },
    async ({ service_type, area, max_budget, min_rating }) => {
      const results = await searchHandymen({
        service: service_type,
        area,
        maxRate: max_budget,
        minRating: min_rating,
      });

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                found: 0,
                message: "No handymen found matching your criteria. Try broadening your search.",
                suggestions: ["Remove area filter", "Increase max_budget", "Try a different service_type"],
              }, null, 2),
            },
          ],
        };
      }

      const sorted = results.sort((a, b) => Number(b.rating) - Number(a.rating));
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              found: sorted.length,
              handymen: sorted.map((h) => ({
                id: h.id,
                name: h.name,
                services: JSON.parse(h.services),
                areas: JSON.parse(h.areas),
                rate_range: `SGD $${h.rateMin}–$${h.rateMax}`,
                rating: Number(h.rating),
                review_count: h.reviewCount,
                acra_registered: h.acraRegistered,
                years_experience: h.yearsExperience,
                bio: h.bio,
              })),
            }, null, 2),
          },
        ],
      };
    }
  );

  // ── Tool 4: get_handyman_profile ───────────────────────────────────────────
  server.tool(
    "get_handyman_profile",
    "Get the full profile of a specific handyman including reviews, ACRA status, and trust score.",
    { handyman_id: z.number().describe("The handyman's ID from search results") },
    async ({ handyman_id }) => {
      const h = await getHandymanById(handyman_id);
      if (!h) {
        return { content: [{ type: "text", text: `Handyman with ID ${handyman_id} not found.` }] };
      }
      const revs = await getHandymanReviews(handyman_id);
      const trustScore =
        (h.acraRegistered ? 30 : 0) +
        Math.min(Number(h.rating) * 10, 50) +
        Math.min(h.yearsExperience * 2, 20);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              id: h.id,
              name: h.name,
              phone: h.phone,
              services: JSON.parse(h.services),
              areas: JSON.parse(h.areas),
              rate_range: `SGD $${h.rateMin}–$${h.rateMax}`,
              rating: Number(h.rating),
              review_count: h.reviewCount,
              years_experience: h.yearsExperience,
              acra_registered: h.acraRegistered,
              acra_number: h.acraNumber,
              bio: h.bio,
              available: h.available,
              trust_score: `${trustScore}/100`,
              trust_breakdown: {
                acra_registered: h.acraRegistered ? "+30 pts" : "0 pts",
                rating: `+${Math.min(Number(h.rating) * 10, 50)} pts`,
                experience: `+${Math.min(h.yearsExperience * 2, 20)} pts`,
              },
              recent_reviews: revs.map((r) => ({
                rating: r.rating,
                comment: r.comment,
                reviewer: r.reviewerName,
                date: r.createdAt,
              })),
            }, null, 2),
          },
        ],
      };
    }
  );

  // ── Tool 5: compare_handyman_prices ───────────────────────────────────────
  server.tool(
    "compare_handyman_prices",
    "Compare pricing across multiple handymen for a given service. Returns a ranked table with best-value recommendation.",
    {
      service_type: z.string().describe("Service type to compare, e.g. 'plumbing', 'aircon'"),
      handyman_ids: z.array(z.number()).optional().describe("Specific handyman IDs to compare. If omitted, compares all available."),
      area: z.string().optional().describe("Filter by area"),
    },
    async ({ service_type, handyman_ids, area }) => {
      let pool = handyman_ids
        ? await Promise.all(handyman_ids.map((id) => getHandymanById(id))).then((r) => r.filter(Boolean) as NonNullable<Awaited<ReturnType<typeof getHandymanById>>>[])
        : await searchHandymen({ service: service_type, area });

      if (pool.length === 0) {
        return { content: [{ type: "text", text: "No handymen found for comparison." }] };
      }

      const ranked = pool
        .map((h) => ({
          id: h.id,
          name: h.name,
          rate_min: Number(h.rateMin),
          rate_max: Number(h.rateMax),
          rating: Number(h.rating),
          review_count: h.reviewCount,
          acra_registered: h.acraRegistered,
        }))
        .sort((a, b) => a.rate_min - b.rate_min);

      const best = ranked[0]!;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              service_type,
              comparison_table: ranked.map((h, i) => ({
                rank: i + 1,
                name: h.name,
                id: h.id,
                min_rate: `SGD $${h.rate_min}`,
                max_rate: `SGD $${h.rate_max}`,
                rating: `${h.rating}⭐`,
                reviews: h.review_count,
                acra: h.acra_registered ? "✅" : "❌",
                badge: i === 0 ? "🏆 CHEAPEST" : "",
              })),
              recommendation: {
                best_value: best.name,
                id: best.id,
                reason: `Lowest starting rate at SGD $${best.rate_min} with ${best.rating}⭐ rating`,
              },
            }, null, 2),
          },
        ],
      };
    }
  );

  // ── Tool 6: quote_job ──────────────────────────────────────────────────────
  server.tool(
    "quote_job",
    "Get an estimated price range, duration, and inclusions for a job based on service type and complexity.",
    {
      service_type: z.string().describe("Type of service, e.g. 'plumbing', 'aircon', 'electrical', 'carpentry', 'painting', 'general'"),
      complexity: z.enum(["simple", "moderate", "complex"]).describe("Job complexity level"),
      description: z.string().optional().describe("Brief description of the specific job"),
    },
    async ({ service_type, complexity, description }) => {
      const quote = getQuote(service_type, complexity);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              service_type,
              complexity,
              description: description ?? "",
              estimate: {
                price_range: `SGD $${quote.min}–$${quote.max}`,
                min_price: quote.min,
                max_price: quote.max,
                duration: quote.duration,
                inclusions: quote.inclusions,
              },
              note: "Final price depends on actual site conditions. Use contact_handyman or contact_multiple_handymen to get real quotes via WhatsApp.",
              platform_fee: "SGD $5 platform fee applies upon booking (paid via Stripe).",
            }, null, 2),
          },
        ],
      };
    }
  );

  // ── Tool 7: contact_handyman ───────────────────────────────────────────────
  server.tool(
    "contact_handyman",
    "Send a WhatsApp quote-request message to a single handyman on the user's behalf. No phone calls — the user stays completely hands-off.",
    {
      handyman_id: z.number().describe("Handyman ID to contact"),
      service_type: z.string().describe("Service type to request a quote for"),
      area: z.string().describe("Service area/district"),
      scheduled_date: z.string().describe("Preferred date, e.g. 'Saturday' or '2024-12-21'"),
      budget: z.string().optional().describe("Budget range, e.g. 'SGD $80-$150'"),
      notes: z.string().optional().describe("Any specific requirements or notes for the handyman"),
      session_id: z.string().optional().describe("Session ID to group results. Auto-generated if omitted."),
    },
    async ({ handyman_id, service_type, area, scheduled_date, budget, notes, session_id }) => {
      const h = await getHandymanById(handyman_id);
      if (!h) return { content: [{ type: "text", text: `Handyman ID ${handyman_id} not found.` }] };

      const sid = session_id ?? nanoid(12);
      const result = await requestQuoteViaWhatsApp({
        handymanId: h.id,
        handymanName: h.name,
        handymanPhone: h.whatsappPhone ?? h.phone,
        serviceType: service_type,
        area,
        scheduledDate: scheduled_date,
        budget,
        notes,
      });

      await saveCallResult({
        sessionId: sid,
        handymanId: result.handymanId,
        handymanName: result.handymanName,
        callStatus: result.messageSent ? "completed" : "failed",
        available: result.messageSent,
        responseTimeSec: 0,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              session_id: sid,
              handyman: h.name,
              message_sent: result.messageSent,
              wa_message_id: result.waMessageId,
              simulated: result.simulated,
              message_preview: result.messageBody.substring(0, 200) + "...",
              note: `You made ZERO phone calls. A WhatsApp message was sent to ${h.name} on your behalf.${result.simulated ? " (Dev mode: simulated — WhatsApp not configured)" : ""}`,
              next_step: `Wait for ${h.name} to reply with their quote, then use present_bid_results or accept_winning_bid to proceed.`,
            }, null, 2),
          },
        ],
      };
    }
  );

  // ── Tool 8: contact_multiple_handymen ─────────────────────────────────────
  server.tool(
    "contact_multiple_handymen",
    "Send WhatsApp quote-request messages to 3–5 handymen simultaneously using Promise.all. The user stays completely hands-off — no phone calls, no texts to send.",
    {
      handyman_ids: z.array(z.number()).min(3).max(5).describe("Array of 3–5 handyman IDs to contact in parallel"),
      service_type: z.string().describe("Service type to request quotes for"),
      area: z.string().describe("Service area/district"),
      scheduled_date: z.string().describe("Preferred date"),
      budget: z.string().optional().describe("Budget range to share with handymen"),
      notes: z.string().optional().describe("Any specific requirements"),
    },
    async ({ handyman_ids, service_type, area, scheduled_date, budget, notes }) => {
      const handymenData = await Promise.all(handyman_ids.map((id) => getHandymanById(id)));
      const valid = handymenData.filter(Boolean) as NonNullable<typeof handymenData[0]>[];

      if (valid.length < 3) {
        return { content: [{ type: "text", text: "Need at least 3 valid handyman IDs." }] };
      }

      const sessionId = nanoid(12);
      const startTime = Date.now();

      const results = await requestQuotesFromMultiple(
        valid.map((h) => ({ id: h.id, name: h.name, phone: h.whatsappPhone ?? h.phone })),
        service_type,
        area,
        scheduled_date,
        budget,
        notes
      );

      const totalElapsed = Math.round((Date.now() - startTime) / 1000);

      // Save all results to DB
      await Promise.all(
        results.map((r) =>
          saveCallResult({
            sessionId,
            handymanId: r.handymanId,
            handymanName: r.handymanName,
            callStatus: r.messageSent ? "completed" : "failed",
            available: r.messageSent,
            responseTimeSec: 0,
          })
        )
      );

      const sent = results.filter((r) => r.messageSent);
      const failed = results.filter((r) => !r.messageSent);
      const simulated = results.some((r) => r.simulated);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              session_id: sessionId,
              total_contacted: results.length,
              messages_sent: sent.length,
              messages_failed: failed.length,
              elapsed_ms: totalElapsed * 1000,
              simulated,
              contacted: results.map((r) => ({
                handyman: r.handymanName,
                handyman_id: r.handymanId,
                sent: r.messageSent,
                wa_message_id: r.waMessageId,
              })),
              note: `You made ZERO phone calls. WhatsApp messages were sent to ${sent.length} handyman(s) in parallel on your behalf.${simulated ? " (Dev mode: simulated)" : ""}`,
              next_step: `Handymen will reply with their quotes via WhatsApp. Once you have quotes, use present_bid_results with session_id="${sessionId}" to compare, then accept_winning_bid to book.`,
            }, null, 2),
          },
        ],
      };
    }
  );

  // ── Tool 9: present_bid_results ────────────────────────────────────────────
  server.tool(
    "present_bid_results",
    "Display a formatted comparison of handymen contacted in a session. Use this after receiving WhatsApp replies to compare and pick the best option.",
    {
      session_id: z.string().describe("The session_id returned by contact_handyman or contact_multiple_handymen"),
      quotes: z.array(z.object({
        handyman_id: z.number().describe("Handyman ID"),
        quoted_price: z.number().describe("Price quoted by the handyman in SGD"),
        available_date: z.string().optional().describe("Date they are available"),
        available_time: z.string().optional().describe("Time they are available"),
      })).optional().describe("Manually enter quotes received via WhatsApp replies. If omitted, shows the contacted list without prices."),
    },
    async ({ session_id, quotes }) => {
      const contacted = await getCallResultsBySession(session_id);
      if (contacted.length === 0) {
        return { content: [{ type: "text", text: `No handymen found for session ${session_id}.` }] };
      }

      // Merge DB records with manually provided quotes
      const enriched = contacted.map((c) => {
        const q = quotes?.find((q) => q.handyman_id === c.handymanId);
        return {
          handymanId: c.handymanId,
          handymanName: c.handymanName,
          messageSent: c.callStatus === "completed",
          quotedPrice: q?.quoted_price ?? (c.quotedPrice ? Number(c.quotedPrice) : null),
          availableDate: q?.available_date ?? c.availableDate,
          availableTime: q?.available_time ?? c.availableTime,
        };
      });

      const withQuotes = enriched.filter((e) => e.quotedPrice !== null);
      const ranked = withQuotes.sort((a, b) => (a.quotedPrice ?? 999) - (b.quotedPrice ?? 999));
      const awaitingReply = enriched.filter((e) => e.quotedPrice === null && e.messageSent);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              session_id,
              total_contacted: contacted.length,
              quotes_received: ranked.length,
              awaiting_reply: awaitingReply.length,
              bid_table: ranked.map((r, i) => ({
                rank: i + 1,
                name: r.handymanName,
                handyman_id: r.handymanId,
                price: `SGD $${r.quotedPrice}`,
                date: r.availableDate ?? "TBD",
                time: r.availableTime ?? "TBD",
                badge: i === 0 ? "🏆 CHEAPEST — RECOMMENDED" : "",
              })),
              awaiting_reply_from: awaitingReply.map((r) => r.handymanName),
              winner: ranked.length > 0
                ? {
                    name: ranked[0]!.handymanName,
                    handyman_id: ranked[0]!.handymanId,
                    price: `SGD $${ranked[0]!.quotedPrice}`,
                    date: ranked[0]!.availableDate,
                    time: ranked[0]!.availableTime,
                  }
                : null,
              next_step: ranked.length > 0
                ? `Use accept_winning_bid with handyman_id=${ranked[0]!.handymanId} to book the cheapest option.`
                : "No quotes yet. Wait for handymen to reply via WhatsApp, then call this tool again with the quotes parameter.",
            }, null, 2),
          },
        ],
      };
    }
  );

  // ── Tool 10: accept_winning_bid ────────────────────────────────────────────
  server.tool(
    "accept_winning_bid",
    "Accept the winning handyman's bid. Sends acceptance WhatsApp to winner, rejection notices to all runner-ups, and generates a Stripe $5 checkout link.",
    {
      session_id: z.string().describe("The session_id from the contacting session"),
      winning_handyman_id: z.number().describe("The handyman ID of the winner"),
      service_type: z.string().describe("Service type"),
      address: z.string().describe("Service address"),
      scheduled_date: z.string().describe("Confirmed date"),
      agreed_price: z.number().describe("Agreed price in SGD"),
      user_id: z.string().describe("User identifier for Stripe metadata"),
      customer_note: z.string().optional().describe("Any note for the handyman"),
    },
    async ({
      session_id,
      winning_handyman_id,
      service_type,
      address,
      scheduled_date,
      agreed_price,
      user_id,
      customer_note,
    }) => {
      const winner = await getHandymanById(winning_handyman_id);
      if (!winner) return { content: [{ type: "text", text: `Handyman ID ${winning_handyman_id} not found.` }] };

      const allContacted = await getCallResultsBySession(session_id);
      const runnerUps = allContacted.filter((r) => r.handymanId !== winning_handyman_id);

      // Send acceptance to winner
      const acceptSent = await sendAcceptanceNotice({
        handymanPhone: winner.whatsappPhone ?? winner.phone,
        handymanName: winner.name,
        serviceType: service_type,
        address,
        scheduledDate: scheduled_date,
        agreedPrice: agreed_price,
        customerNote: customer_note,
      });

      // Send rejections to runner-ups
      const rejectionResults = await Promise.all(
        runnerUps.map(async (r) => {
          const h = await getHandymanById(r.handymanId);
          if (!h) return { name: r.handymanName, sent: false };
          const sent = await sendRejectionNotice({
            handymanPhone: h.whatsappPhone ?? h.phone,
            handymanName: h.name ?? r.handymanName ?? "Handyman",
            serviceType: service_type,
          });
          return { name: h.name, sent: !!sent };
        })
      );

      // Generate Stripe checkout
      const checkout = await createPlatformFeeCheckout({
        handymanName: winner.name,
        serviceType: service_type,
        userId: user_id,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              winner: {
                name: winner.name,
                id: winner.id,
                agreed_price: `SGD $${agreed_price}`,
                scheduled_date,
                address,
              },
              acceptance_sent: !!acceptSent,
              rejections_sent: rejectionResults,
              platform_fee: {
                amount: "SGD $5.00",
                checkout_url: checkout.url,
                session_id: checkout.sessionId,
                simulated: checkout.simulated,
                instruction: "Please complete the $5 platform fee payment via the link above. The handyman will be notified once payment is confirmed.",
              },
              summary: `✅ ${winner.name} has been notified via WhatsApp. ${runnerUps.length} runner-up(s) have received polite rejection notices. Pay the $5 platform fee to confirm your booking.`,
            }, null, 2),
          },
        ],
      };
    }
  );

  // ── Tool 11: book_job ──────────────────────────────────────────────────────
  server.tool(
    "book_job",
    "Finalise a booking in the database and generate a Stripe $5 platform fee checkout link.",
    {
      user_id: z.string().describe("User identifier"),
      handyman_id: z.number().describe("Handyman to book"),
      service_type: z.string().describe("Service type"),
      scheduled_date: z.string().describe("Booking date"),
      scheduled_time: z.string().optional().describe("Booking time"),
      address: z.string().describe("Service address"),
      agreed_price: z.number().describe("Agreed price in SGD"),
      notes: z.string().optional().describe("Additional notes"),
    },
    async ({
      user_id,
      handyman_id,
      service_type,
      scheduled_date,
      scheduled_time,
      address,
      agreed_price,
      notes,
    }) => {
      const h = await getHandymanById(handyman_id);
      if (!h) return { content: [{ type: "text", text: `Handyman ID ${handyman_id} not found.` }] };

      // Generate Stripe checkout
      const checkout = await createPlatformFeeCheckout({
        handymanName: h.name,
        serviceType: service_type,
        userId: user_id,
      });

      // Create booking record
      await createBooking({
        userId: user_id,
        handymanId: handyman_id,
        serviceType: service_type,
        scheduledDate: scheduled_date,
        scheduledTime: scheduled_time,
        address,
        agreedPrice: agreed_price,
        notes,
        stripeFeeUrl: checkout.url,
        stripeFeeSessionId: checkout.sessionId,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              booking_confirmed: true,
              handyman: h.name,
              service_type,
              scheduled: `${scheduled_date}${scheduled_time ? " at " + scheduled_time : ""}`,
              address,
              agreed_price: `SGD $${agreed_price}`,
              notes: notes ?? "",
              platform_fee: {
                amount: "SGD $5.00",
                checkout_url: checkout.url,
                simulated: checkout.simulated,
                instruction: "Pay the $5 platform fee to confirm your booking.",
              },
              next_steps: [
                `1. Pay the $5 platform fee: ${checkout.url}`,
                `2. ${h.name} will arrive at ${address} on ${scheduled_date}`,
                `3. Pay ${h.name} SGD $${agreed_price} directly after the job`,
                `4. Use notify_arrival to get WhatsApp alerts when ${h.name} is on the way`,
              ],
            }, null, 2),
          },
        ],
      };
    }
  );

  // ── Tool 12: notify_arrival ────────────────────────────────────────────────
  server.tool(
    "notify_arrival",
    "Send a WhatsApp arrival alert to the customer. Supports three statuses: en_route, at_door, delayed.",
    {
      customer_phone: z.string().describe("Customer's WhatsApp phone number with country code, e.g. +6591234567"),
      handyman_name: z.string().describe("Handyman's name"),
      status: z.enum(["en_route", "at_door", "delayed"]).describe("Arrival status"),
      eta: z.string().optional().describe("Estimated time of arrival, e.g. '15 minutes' or '2:30 PM'"),
    },
    async ({ customer_phone, handyman_name, status, eta }) => {
      const msgId = await sendArrivalAlert({
        customerPhone: customer_phone,
        handymanName: handyman_name,
        status,
        eta,
      });

      const statusMessages = {
        en_route: `${handyman_name} is on the way!`,
        at_door: `${handyman_name} has arrived at the door!`,
        delayed: `${handyman_name} is running late.`,
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              sent: !!msgId,
              status,
              message: statusMessages[status],
              eta: eta ?? null,
              wa_message_id: msgId,
              simulated: msgId?.startsWith("simulated_"),
              recipient: customer_phone,
            }, null, 2),
          },
        ],
      };
    }
  );

  return server;
}

// ─── Express middleware for /mcp ──────────────────────────────────────────────

const transports = new Map<string, StreamableHTTPServerTransport>();

export async function mcpHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.method === "POST") {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports.has(sessionId)) {
        transport = transports.get(sessionId)!;
      } else {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => nanoid(16),
          onsessioninitialized: (sid) => {
            transports.set(sid, transport);
          },
        });
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) transports.delete(sid);
        };
        const server = createMcpServer();
        await server.connect(transport);
      }

      await transport.handleRequest(req, res, req.body);
    } else if (req.method === "GET") {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      if (!sessionId || !transports.has(sessionId)) {
        res.status(400).json({ error: "Missing or invalid session ID for SSE" });
        return;
      }
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res);
    } else if (req.method === "DELETE") {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      if (sessionId && transports.has(sessionId)) {
        const transport = transports.get(sessionId)!;
        await transport.close();
        transports.delete(sessionId);
      }
      res.status(200).json({ ok: true });
    } else {
      next();
    }
  } catch (err) {
    console.error("[MCP] Handler error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "MCP handler error" });
    }
  }
}
