/**
 * calling.ts
 * Tool 7: call_handyman_proxy
 * Tool 8: call_multiple_handymen_parallel
 *
 * The "Introvert Mode" — Vapi calls handymen ON THE USER'S BEHALF.
 * User makes ZERO phone calls.
 */

import { z } from "zod";
import { makeVapiCall, VapiCallResult } from "../lib/vapi.js";
import { queryOne, queryAll, execute } from "../db/database.js";
import { v4 as uuidv4 } from "uuid";

const SERVICE_TYPES = ["ac_repair", "plumbing", "electrical", "cleaning", "carpentry", "painting"] as const;

interface HandymanRow {
  id: string;
  name: string;
  phone: string;
  whatsapp: string | null;
  service_types: string;
  location: string;
  rating: number;
  bookings: number;
  trust_score: number;
  price_min: number;
  price_max: number;
}

// ─── Tool 7: call_handyman_proxy ──────────────────────────────────────────────

export const callHandymanProxySchema = z.object({
  handyman_id: z.string().describe("Handyman ID from search results."),
  handyman_phone: z.string().optional().describe("Handyman phone number. Auto-looked up if omitted."),
  purpose: z
    .enum(["inquiry", "booking", "price_quote"])
    .describe("Purpose of the call."),
  service_type: z.enum(SERVICE_TYPES).describe("Service type needed."),
  datetime: z.string().optional().describe("Preferred datetime (e.g. 'Saturday 10AM')."),
  address: z.string().optional().describe("Service address."),
  max_budget: z.number().optional().describe("Maximum budget in SGD."),
});

export type CallHandymanProxyInput = z.infer<typeof callHandymanProxySchema>;

export async function callHandymanProxy(
  input: CallHandymanProxyInput
): Promise<string> {
  // Look up handyman
  const handyman = queryOne<HandymanRow>(
    "SELECT * FROM handymen WHERE id = ?",
    [input.handyman_id]
  );

  if (!handyman) {
    return JSON.stringify({ error: `Handyman ${input.handyman_id} not found.` });
  }

  const phone = input.handyman_phone ?? handyman.phone;

  // Make the Vapi call
  const result: VapiCallResult = await makeVapiCall({
    handymanId: handyman.id,
    handymanName: handyman.name,
    handymanPhone: phone,
    purpose: input.purpose,
    serviceType: input.service_type,
    datetime: input.datetime,
    address: input.address,
    maxBudget: input.max_budget,
  });

  // Persist call result
  const callResultId = uuidv4();
  execute(
    `INSERT INTO call_results (id, handyman_id, call_status, transcription, availability, price_quoted, datetime_offered, call_duration, vapi_call_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      callResultId,
      handyman.id,
      result.callStatus,
      result.transcription,
      result.availability ? 1 : 0,
      result.priceQuoted ?? null,
      result.datetimeOffered ?? null,
      result.callDuration,
      result.callId,
    ]
  );

  return JSON.stringify({
    call_result_id: callResultId,
    handyman: {
      id: handyman.id,
      name: handyman.name,
      rating: handyman.rating,
    },
    call_status: result.callStatus,
    transcription: result.transcription,
    availability: result.availability,
    price_quoted: result.priceQuoted,
    datetime_offered: result.datetimeOffered,
    call_duration_seconds: result.callDuration,
    user_made_zero_calls: true,
    next_step: result.availability
      ? `${handyman.name} is available at $${result.priceQuoted}. Use accept_winning_bid to book.`
      : `${handyman.name} is not available. Try another handyman or use call_multiple_handymen_parallel.`,
  });
}

// ─── Tool 8: call_multiple_handymen_parallel ──────────────────────────────────

export const callMultipleHandymenParallelSchema = z.object({
  service_type: z.enum(SERVICE_TYPES).describe("Service type needed."),
  location: z.string().optional().describe("Preferred location/area."),
  purpose: z
    .enum(["inquiry", "booking", "price_quote"])
    .default("price_quote")
    .describe("Purpose of the calls."),
  datetime: z.string().optional().describe("Preferred datetime."),
  address: z.string().optional().describe("Service address."),
  max_budget: z.number().optional().describe("Maximum budget in SGD."),
  max_handymen: z
    .number()
    .min(1)
    .max(10)
    .default(5)
    .describe("Maximum number of handymen to call (default 5)."),
});

export type CallMultipleHandymenParallelInput = z.infer<
  typeof callMultipleHandymenParallelSchema
>;

export async function callMultipleHandymenParallel(
  input: CallMultipleHandymenParallelInput
): Promise<string> {
  const startTime = Date.now();

  // Find top handymen for this service
  const allHandymen = queryAll<HandymanRow>(
    "SELECT * FROM handymen WHERE available = 1 ORDER BY trust_score DESC"
  );

  const relevant = allHandymen
    .filter((h) => {
      const services: string[] = JSON.parse(h.service_types);
      return services.includes(input.service_type);
    })
    .filter((h) => {
      if (!input.max_budget) return true;
      return h.price_min <= input.max_budget;
    })
    .slice(0, input.max_handymen);

  if (relevant.length === 0) {
    return JSON.stringify({
      error: `No available handymen found for ${input.service_type}.`,
    });
  }

  // Call all handymen in parallel (Promise.all — Introvert Mode)
  const callPromises = relevant.map((h) =>
    makeVapiCall({
      handymanId: h.id,
      handymanName: h.name,
      handymanPhone: h.phone,
      purpose: input.purpose,
      serviceType: input.service_type,
      datetime: input.datetime,
      address: input.address,
      maxBudget: input.max_budget,
    }).then((result) => ({ handyman: h, result }))
  );

  const callOutcomes = await Promise.all(callPromises);
  const totalTime = Math.round((Date.now() - startTime) / 1000);

  // Persist all call results
  for (const { handyman, result } of callOutcomes) {
    execute(
      `INSERT INTO call_results (id, handyman_id, call_status, transcription, availability, price_quoted, datetime_offered, call_duration, vapi_call_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        handyman.id,
        result.callStatus,
        result.transcription,
        result.availability ? 1 : 0,
        result.priceQuoted ?? null,
        result.datetimeOffered ?? null,
        result.callDuration,
        result.callId,
      ]
    );
  }

  // Filter available + sort cheapest first
  const available = callOutcomes
    .filter(({ result }) => result.availability && result.priceQuoted !== null)
    .sort((a, b) => (a.result.priceQuoted ?? 999) - (b.result.priceQuoted ?? 999));

  const toCall = relevant.map((h) => ({ id: h.id, name: h.name, phone: h.phone }));

  const responses = callOutcomes.map(({ handyman, result }) => ({
    handyman_id: handyman.id,
    name: handyman.name,
    call_status: result.callStatus,
    availability: result.availability,
    price_quoted: result.priceQuoted,
    datetime_offered: result.datetimeOffered,
    call_duration_seconds: result.callDuration,
    transcription_snippet: result.transcription.slice(0, 120),
  }));

  const availableHandymen = available.map(({ handyman, result }, index) => ({
    rank: index + 1,
    handyman_id: handyman.id,
    name: handyman.name,
    price: result.priceQuoted,
    datetime: result.datetimeOffered,
    rating: handyman.rating,
    trust_score: handyman.trust_score,
    response_time_seconds: result.callDuration,
    whatsapp: handyman.whatsapp,
    is_cheapest: index === 0,
  }));

  return JSON.stringify({
    summary: {
      total_called: relevant.length,
      names_called: relevant.map((h) => h.name),
      total_time_seconds: totalTime,
      parallel_calls: true,
      user_made_zero_calls: true,
    },
    responsive_and_available: available.length,
    toCall,
    responses,
    availableHandymen,
    next_step:
      available.length > 0
        ? `Use present_bid_results to see formatted comparison, then accept_winning_bid to book the cheapest.`
        : "No handymen available. Try a different time or increase budget.",
  });
}
