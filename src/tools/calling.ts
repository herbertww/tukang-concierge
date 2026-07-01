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
 *
 * Currency: SGD primary (Singapore market). RM/MYR accepted from MY contractors.
 */

import { z } from "zod";
import { randomUUID } from "crypto";
import { sendWhatsAppTemplate } from "../lib/whatsapp.js";
import { execute, queryOne } from "../db/database.js";
import { resolveHandymanPhone } from "../lib/contact.js";
import { config } from "../lib/config.js";

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const whatsappHandymanSchema = z.object({
  handyman_id: z.string().describe("Handyman ID from search results. The number is resolved server-side from this — you do NOT need to supply it."),
  handyman_name: z.string().describe("Handyman's name (for the message greeting)"),
  handyman_phone: z.string().optional().describe("ONLY for unverified web leads (web_* ids) that aren't in the directory. Ignored for directory contractors — their number is looked up server-side."),
  service_type: z.string().describe("Type of service needed (e.g. plumbing, electrical)"),
  address: z.string().optional().describe("Job location address"),
  datetime: z.string().optional().describe("Preferred datetime (e.g. Saturday 10am)"),
  max_budget: z.number().optional().describe("Customer's maximum budget in SGD"),
  session_id: z.string().optional().describe("Existing session ID to group quotes; auto-generated if not provided"),
});

export const whatsappMultipleHandymenSchema = z.object({
  handymen: z
    .array(
      z.object({
        handyman_id: z.string().describe("ID from search results; number resolved server-side."),
        handyman_name: z.string(),
        handyman_phone: z.string().optional().describe("ONLY for unverified web leads (web_* ids) not in the directory."),
      })
    )
    .min(1)
    .max(5)
    .describe("List of 1-5 handymen to contact simultaneously"),
  service_type: z.string().describe("Type of service needed"),
  address: z.string().optional().describe("Job location address"),
  datetime: z.string().optional().describe("Preferred datetime"),
  max_budget: z.number().optional().describe("Customer's maximum budget in SGD"),
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
    `I have a customer in Singapore looking for *${service}* services.`,
  ];

  if (params.datetime) {
    lines.push(`📅 Preferred time: *${params.datetime}*`);
  }
  if (params.address) {
    lines.push(`📍 Location: ${params.address}`);
  }
  if (params.maxBudget) {
    lines.push(`💰 Budget: up to *SGD ${params.maxBudget}*`);
  }

  lines.push(
    ``,
    `Are you available? If yes, please reply with:`,
    `1. Your *price quote* (SGD)`,
    `2. Your *available datetime*`,
    ``,
    `Reply *NO* if unavailable. Thank you! 🙏`
  );

  return lines.join("\n");
}

/**
 * Build the ordered body params for the approved utility template
 * `tukang_quote_request`: {{1}}=name, {{2}}=service, {{3}}=job details line.
 * Each param is collapsed to a single clean line — Meta rejects params with
 * newlines, tabs, or 5+ consecutive spaces, and every {{n}} must be non-empty.
 */
function buildOutreachParams(params: {
  handymanName: string;
  serviceType: string;
  address?: string;
  datetime?: string;
  maxBudget?: number;
}): string[] {
  const service = params.serviceType.replace(/_/g, " ");
  const bits: string[] = [];
  if (params.address) bits.push(`Location: ${params.address}`);
  if (params.datetime) bits.push(`Preferred time: ${params.datetime}`);
  if (params.maxBudget) bits.push(`Budget up to SGD ${params.maxBudget}`);
  const details = bits.length ? bits.join(" · ") : "Details to be confirmed with the customer.";

  const clean = (s: string) => s.replace(/\s+/g, " ").trim();
  return [clean(params.handymanName), clean(service), clean(details)];
}

// ─── Single Handyman Outreach ─────────────────────────────────────────────────

export async function whatsappHandyman(
  args: z.infer<typeof whatsappHandymanSchema>
): Promise<string> {
  const sessionId = args.session_id ?? randomUUID();
  const outreach = { handymanName: args.handyman_name, serviceType: args.service_type, address: args.address, datetime: args.datetime, maxBudget: args.max_budget };
  // Human-readable preview for the UI; the wire message is the approved template.
  const message = buildOutreachMessage(outreach);
  const templateParams = buildOutreachParams(outreach);

  // Resolve the real number server-side. Directory contractors are looked up by
  // id (client never sees the number); a passed phone is only honoured for web
  // leads that aren't in the directory. See lib/contact.ts.
  const phone = resolveHandymanPhone(args.handyman_id) ?? args.handyman_phone;

  let sendStatus = "sent";
  if (!phone) {
    sendStatus = "failed";
    console.error(`[WhatsApp Outreach] No number for ${args.handyman_name} (${args.handyman_id})`);
  } else {
    // Cold outreach is business-initiated → must use a pre-approved template.
    const res = await sendWhatsAppTemplate({
      toPhone: phone,
      templateName: config.whatsapp.outreachTemplate,
      languageCode: config.whatsapp.outreachTemplateLang,
      bodyParams: templateParams,
    });
    if (!res.success) {
      console.error(`[WhatsApp Outreach] Failed to message ${args.handyman_name}: ${res.error}`);
      sendStatus = "failed";
    }
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
      [randomUUID(), sessionId, args.handyman_id, phone ?? "",
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
      : "WhatsApp send failed — this contractor could not be reached right now. Never suggest the user contact them directly or visit their website; instead offer to retry with a different contractor or a broader discover_services_web search.",
  }, null, 2);
}

// ─── Parallel Multi-Handyman Outreach ─────────────────────────────────────────

export async function whatsappMultipleHandymen(
  args: z.infer<typeof whatsappMultipleHandymenSchema>
): Promise<string> {
  const sessionId = randomUUID();

  const results = await Promise.allSettled(
    args.handymen.map(async (h) => {
      const outreach = { handymanName: h.handyman_name, serviceType: args.service_type, address: args.address, datetime: args.datetime, maxBudget: args.max_budget };
      const templateParams = buildOutreachParams(outreach);

      const phone = resolveHandymanPhone(h.handyman_id) ?? h.handyman_phone;

      let sendStatus = "sent";
      if (!phone) {
        sendStatus = "failed";
        console.error(`[WhatsApp Outreach] No number for ${h.handyman_name} (${h.handyman_id})`);
      } else {
        const res = await sendWhatsAppTemplate({
          toPhone: phone,
          templateName: config.whatsapp.outreachTemplate,
          languageCode: config.whatsapp.outreachTemplateLang,
          bodyParams: templateParams,
        });
        if (!res.success) {
          console.error(`[WhatsApp Outreach] Failed to message ${h.handyman_name}: ${res.error}`);
          sendStatus = "failed";
        }
      }

      // Pre-insert pending row
      execute(
        `INSERT OR IGNORE INTO handyman_quotes
         (id, session_id, handyman_id, handyman_phone, raw_message, price_quoted, available, datetime_offered, wa_msg_id)
         VALUES (?, ?, ?, ?, ?, NULL, 0, NULL, NULL)`,
        [randomUUID(), sessionId, h.handyman_id, phone ?? "",
         sendStatus === "sent" ? "[PENDING — awaiting reply]" : "[SEND FAILED]"]
      );

      return { handyman_id: h.handyman_id, handyman_name: h.handyman_name, status: sendStatus };
    })
  );

  const summary = results.map((r) =>
    r.status === "fulfilled" ? r.value : { handyman_name: "unknown", status: "failed" }
  );

  const sentCount = summary.filter((r) => r.status === "sent").length;
  const failedCount = args.handymen.length - sentCount;

  const note = failedCount === 0
    ? `WhatsApp messages sent to ${sentCount}/${args.handymen.length} contractors simultaneously. Replies will arrive via webhook. Use present_bid_results with session_id "${sessionId}" to see responses as they come in.`
    : `WhatsApp messages sent to ${sentCount}/${args.handymen.length} contractors; ${failedCount} could not be reached right now. ` +
      `Never suggest the user contact an unreached provider directly or visit their website — all contact must stay inside Tukang. ` +
      `Instead offer to retry discover_services_web for more/different candidates, or proceed with whichever contractors did get messaged.`;

  return JSON.stringify({
    session_id: sessionId,
    messages_sent: sentCount,
    total: args.handymen.length,
    results: summary,
    note,
  }, null, 2);
}
