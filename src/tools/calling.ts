/**
 * calling.ts
 * WhatsApp-native contractor outreach for Tukang.
 *
 * Replaces Vapi voice calls entirely. Sends structured WhatsApp messages to
 * contractors asking for availability, price, and datetime. Replies are
 * captured automatically by the inbound WhatsApp webhook in index.ts and
 * stored in the handyman_quotes table.
 *
 * Flow:
 *   1. Build a WhatsApp message for the contractor
 *   2. Send via WhatsApp Business API
 *   3. Return session_id so the LLM can poll present_bid_results later
 *      (replies arrive asynchronously via webhook)
 */

import { z } from "zod";
import { randomUUID } from "crypto";
import { sendWhatsAppMessage } from "../lib/whatsapp.js";
import { execute, queryOne } from "../db/database.js";

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const whatsappHandymanSchema = z.object({
  handyman_id: z.string().describe("Handyman ID from the database"),
  handyman_name: z.string().describe("Handyman's name"),
  handyman_phone: z.string().describe("Handyman's WhatsApp number in E.164 format (e.g. +60123456789)"),
  service_type: z.string().describe("Type of service needed (e.g. plumbing, electrical)"),
  address: z.string().optional().describe("Job location address"),
  datetime: z.string().optional().describe("Preferred datetime (e.g. Saturday 10am)"),
  max_budget: z.number().optional().describe("Customer's maximum budget in local currency"),
  session_id: z.string().optional().describe("Existing session ID to group quotes; auto-generated if not provided"),
});

export const whatsappMultipleHandymenSchema = z.object({
  handymen: z
    .array(
      z.object({
        handyman_id: z.string(),
        handyman_name: z.string(),
        handyman_phone: z.string(),
      })
    )
    .min(1)
    .max(5)
    .describe("List of 1-5 handymen to contact simultaneously"),
  service_type: z.string().describe("Type of service needed"),
  address: z.string().optional().describe("Job location address"),
  datetime: z.string().optional().describe("Preferred datetime"),
  max_budget: z.number().optional().describe("Customer's maximum budget"),
});

// ─── Message Builder ──────────────────────────────────────────────────────────

function buildOutreachMessage(params: {
  handymanName: string;
  serviceType: string;
  address?: string;
  datetime?: string;
  maxBudget?: number;
}): string {
  const service = params.serviceType.replace(/_/g, " ");
  const lines: string[] = [
    `Hi ${params.handymanName} 👋`,
    ``,
    `I have a customer looking for *${service}* services.`,
  ];

  if (params.datetime) {
    lines.push(`📅 Preferred time: *${params.datetime}*`);
  }
  if (params.address) {
    lines.push(`📍 Location: ${params.address}`);
  }
  if (params.maxBudget) {
    lines.push(`💰 Budget: up to *${params.maxBudget}*`);
  }

  lines.push(
    ``,
    `Are you available? If yes, please reply with:`,
    `1. Your *price quote*`,
    `2. Your *available datetime*`,
    ``,
    `Reply *NO* if unavailable. Thank you! 🙏`
  );

  return lines.join("\n");
}

// ─── Single Handyman Outreach ─────────────────────────────────────────────────

export async function whatsappHandyman(
  args: z.infer<typeof whatsappHandymanSchema>
): Promise<string> {
  const sessionId = args.session_id ?? randomUUID();
  const message = buildOutreachMessage({
    handymanName: args.handyman_name,
    serviceType: args.service_type,
    address: args.address,
    datetime: args.datetime,
    maxBudget: args.max_budget,
  });

  let sendStatus = "sent";
  try {
    await sendWhatsAppMessage(args.handyman_phone, message);
  } catch (err) {
    console.error(`[WhatsApp Outreach] Failed to message ${args.handyman_name}:`, err);
    sendStatus = "failed";
  }

  // Pre-insert a pending quote row so present_bid_results can show "waiting"
  const existing = queryOne(
    "SELECT id FROM handyman_quotes WHERE session_id = ? AND handyman_id = ?",
    [sessionId, args.handyman_id]
  );
  if (!existing) {
    execute(
      `INSERT INTO handyman_quotes
       (id, session_id, handyman_id, handyman_phone, raw_message, price_quoted, available, datetime_offered, wa_msg_id)
       VALUES (?, ?, ?, ?, ?, NULL, 0, NULL, NULL)`,
      [randomUUID(), sessionId, args.handyman_id, args.handyman_phone,
       sendStatus === "sent" ? "[PENDING — awaiting reply]" : "[SEND FAILED]"]
    );
  }

  return JSON.stringify({
    status: sendStatus,
    session_id: sessionId,
    handyman_id: args.handyman_id,
    handyman_name: args.handyman_name,
    message_sent: message,
    note: sendStatus === "sent"
      ? "WhatsApp sent. Contractor reply will arrive via webhook and be stored automatically. Use present_bid_results with this session_id to check responses."
      : "WhatsApp send failed. Check WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID.",
  }, null, 2);
}

// ─── Parallel Multi-Handyman Outreach ─────────────────────────────────────────

export async function whatsappMultipleHandymen(
  args: z.infer<typeof whatsappMultipleHandymenSchema>
): Promise<string> {
  const sessionId = randomUUID();

  const results = await Promise.allSettled(
    args.handymen.map(async (h) => {
      const message = buildOutreachMessage({
        handymanName: h.handyman_name,
        serviceType: args.service_type,
        address: args.address,
        datetime: args.datetime,
        maxBudget: args.max_budget,
      });

      let sendStatus = "sent";
      try {
        await sendWhatsAppMessage(h.handyman_phone, message);
      } catch (err) {
        console.error(`[WhatsApp Outreach] Failed to message ${h.handyman_name}:`, err);
        sendStatus = "failed";
      }

      // Pre-insert pending row
      execute(
        `INSERT OR IGNORE INTO handyman_quotes
         (id, session_id, handyman_id, handyman_phone, raw_message, price_quoted, available, datetime_offered, wa_msg_id)
         VALUES (?, ?, ?, ?, ?, NULL, 0, NULL, NULL)`,
        [randomUUID(), sessionId, h.handyman_id, h.handyman_phone,
         sendStatus === "sent" ? "[PENDING — awaiting reply]" : "[SEND FAILED]"]
      );

      return { handyman_id: h.handyman_id, handyman_name: h.handyman_name, status: sendStatus };
    })
  );

  const summary = results.map((r) =>
    r.status === "fulfilled" ? r.value : { handyman_name: "unknown", status: "failed" }
  );

  const sentCount = summary.filter((r) => r.status === "sent").length;

  return JSON.stringify({
    session_id: sessionId,
    messages_sent: sentCount,
    total: args.handymen.length,
    results: summary,
    note: `WhatsApp messages sent to ${sentCount}/${args.handymen.length} contractors simultaneously. Replies will arrive via webhook. Use present_bid_results with session_id "${sessionId}" to see responses as they come in.`,
  }, null, 2);
}
