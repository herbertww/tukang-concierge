/**
 * vapi.ts
 * Vapi.ai outbound calling integration for Tukang.
 * Docs: https://docs.vapi.ai
 *
 * Flow:
 *   1. Build a call script for the handyman
 *   2. POST /call to Vapi with the script and handyman's phone
 *   3. Poll /call/{id} until status is ended
 *   4. Parse transcript for availability, price, datetime
 */

import axios from "axios";
import { config } from "./config.js";

export type CallPurpose = "inquiry" | "booking" | "price_quote" | "arrival_notification";

export interface VapiCallRequest {
  handymanId: string;
  handymanName: string;
  handymanPhone: string;
  purpose: CallPurpose;
  serviceType: string;
  datetime?: string;
  address?: string;
  maxBudget?: number;
  bookingId?: string;
  notificationType?: "en_route" | "at_door" | "delayed";
}

export interface VapiCallResult {
  callId: string;
  callStatus: "success" | "no_answer" | "busy" | "failed";
  transcription: string;
  availability: boolean;
  priceQuoted: number | null;
  datetimeOffered: string | null;
  callDuration: number;
  rawStatus: string;
}

const vapiClient = axios.create({
  baseURL: config.vapi.baseUrl,
  headers: {
    Authorization: `Bearer ${config.vapi.apiKey}`,
    "Content-Type": "application/json",
  },
  timeout: 30_000,
});

// ─── Script Templates ────────────────────────────────────────────────────────

function buildScript(req: VapiCallRequest): string {
  const service = req.serviceType.replace(/_/g, " ");

  switch (req.purpose) {
    case "inquiry":
    case "price_quote":
      return `
Hello, am I speaking with ${req.handymanName}? 
I am calling on behalf of a customer who needs ${service} services.
Are you available${req.datetime ? ` on ${req.datetime}` : " this week"}?
${req.address ? `The job location is ${req.address}.` : ""}
${req.maxBudget ? `The customer's budget is up to $${req.maxBudget}.` : ""}
Could you please provide your best price for this job?
If you are available and interested, please standby — the customer will send you a WhatsApp message shortly to confirm.
Thank you.
      `.trim();

    case "booking":
      return `
Hello, am I speaking with ${req.handymanName}?
I am calling on behalf of a customer to confirm a booking for ${service}.
The job is scheduled for ${req.datetime ?? "a time to be confirmed"}.
${req.address ? `Location: ${req.address}.` : ""}
Please confirm you are available and the agreed price.
You will receive a WhatsApp confirmation message shortly.
Thank you for your time.
      `.trim();

    case "arrival_notification":
      const notifMsg: Record<string, string> = {
        en_route: `Hello ${req.handymanName}, this is a reminder that your customer is expecting you. Please confirm you are on your way.`,
        at_door: `Hello ${req.handymanName}, your customer says you have arrived. Please proceed to the door.`,
        delayed: `Hello ${req.handymanName}, your customer is asking if there is any delay. Please advise your estimated arrival time.`,
      };
      return notifMsg[req.notificationType ?? "en_route"];

    default:
      return `Hello, I am calling on behalf of a customer regarding ${service} services. Are you available?`;
  }
}

// ─── Core Call Function ───────────────────────────────────────────────────────

/**
 * Initiate an outbound Vapi call and wait for completion.
 * Returns parsed call result.
 */
export async function makeVapiCall(req: VapiCallRequest): Promise<VapiCallResult> {
  if (!config.vapi.apiKey || !config.vapi.phoneNumberId) {
    // Return a simulated result when Vapi is not configured (dev mode)
    return simulateCall(req);
  }

  const script = buildScript(req);

  // Create the call
  const callPayload = {
    phoneNumberId: config.vapi.phoneNumberId,
    customer: {
      number: req.handymanPhone,
      name: req.handymanName,
    },
    assistant: {
      model: {
        provider: "openai",
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a professional booking assistant calling on behalf of a customer. 
Be polite, concise, and professional. 
Your goal: ${req.purpose === "price_quote" ? "Get a price quote and availability confirmation." : "Confirm booking details."}
Script to follow: ${script}
After the handyman responds, thank them and end the call.`,
          },
        ],
      },
      voice: {
        provider: "11labs",
        voiceId: "rachel",
      },
      firstMessage: script,
      endCallMessage: "Thank you very much. Have a great day!",
      endCallPhrases: ["goodbye", "bye", "thank you goodbye"],
    },
  };

  let callId: string;
  try {
    const res = await vapiClient.post<{ id: string }>("/call/phone", callPayload);
    callId = res.data.id;
  } catch (err) {
    console.error("[Vapi] Failed to initiate call:", err);
    return simulateCall(req);
  }

  // Poll for completion (max 120 seconds)
  const result = await pollCallCompletion(callId);
  return result;
}

interface VapiCallStatus {
  id: string;
  status: string;
  endedReason?: string;
  transcript?: string;
  duration?: number;
}

async function pollCallCompletion(callId: string): Promise<VapiCallResult> {
  const maxAttempts = 24; // 24 × 5s = 120s
  const pollInterval = 5_000;

  for (let i = 0; i < maxAttempts; i++) {
    await sleep(pollInterval);

    try {
      const res = await vapiClient.get<VapiCallStatus>(`/call/${callId}`);
      const call = res.data;

      if (call.status === "ended" || call.status === "failed") {
        return parseCallResult(call);
      }
    } catch (err) {
      console.error("[Vapi] Poll error:", err);
    }
  }

  // Timeout
  return {
    callId,
    callStatus: "failed",
    transcription: "",
    availability: false,
    priceQuoted: null,
    datetimeOffered: null,
    callDuration: 0,
    rawStatus: "timeout",
  };
}

function parseCallResult(call: VapiCallStatus): VapiCallResult {
  const transcript = call.transcript ?? "";
  const lower = transcript.toLowerCase();

  // Determine call status
  let callStatus: VapiCallResult["callStatus"] = "success";
  if (call.status === "failed") {
    if (call.endedReason?.includes("no-answer") || call.endedReason?.includes("no_answer")) {
      callStatus = "no_answer";
    } else if (call.endedReason?.includes("busy")) {
      callStatus = "busy";
    } else {
      callStatus = "failed";
    }
  }

  // Parse availability
  const availability =
    lower.includes("yes") ||
    lower.includes("available") ||
    lower.includes("can do") ||
    lower.includes("sure") ||
    lower.includes("ok");

  // Parse price (look for dollar amounts)
  const priceMatch = transcript.match(/\$\s*(\d+(?:\.\d{1,2})?)/);
  const priceQuoted = priceMatch ? parseFloat(priceMatch[1]) : null;

  // Parse datetime (simple heuristic)
  const datetimeMatch = transcript.match(
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}(?:am|pm)|\d{1,2}:\d{2})\b/i
  );
  const datetimeOffered = datetimeMatch ? datetimeMatch[0] : null;

  return {
    callId: call.id,
    callStatus,
    transcription: transcript,
    availability,
    priceQuoted,
    datetimeOffered,
    callDuration: call.duration ?? 0,
    rawStatus: call.status,
  };
}

// ─── Simulation (Dev Mode) ────────────────────────────────────────────────────

const SIMULATED_RESPONSES = [
  { available: true, price: 75, datetime: "Saturday 11AM", duration: 45 },
  { available: true, price: 80, datetime: "Saturday 9AM", duration: 52 },
  { available: true, price: 82, datetime: "Saturday 10AM", duration: 38 },
  { available: false, price: null, datetime: null, duration: 0 },
  { available: false, price: null, datetime: null, duration: 0 },
];

let simIndex = 0;

function simulateCall(req: VapiCallRequest): VapiCallResult {
  const sim = SIMULATED_RESPONSES[simIndex % SIMULATED_RESPONSES.length];
  simIndex++;

  const callStatus = sim.available ? "success" : (simIndex % 2 === 0 ? "no_answer" : "busy");

  return {
    callId: `sim_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    callStatus,
    transcription: sim.available
      ? `Yes, I am available on ${sim.datetime}. My price for this job would be $${sim.price}. Please send me a WhatsApp to confirm.`
      : "Sorry, I am not available this weekend.",
    availability: sim.available,
    priceQuoted: sim.price,
    datetimeOffered: sim.datetime,
    callDuration: sim.duration,
    rawStatus: sim.available ? "ended" : "failed",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
