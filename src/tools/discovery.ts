/**
 * discovery.ts
 * Tool 3: search_handymen
 * Tool 4: get_handyman_profile
 * Tool 5: compare_handyman_prices
 */

import { z } from "zod";
import { randomUUID } from "crypto";
import { queryAll, queryOne, execute } from "../db/database.js";
import { getPreferences } from "../lib/mem0.js";
import { discoverServices } from "../lib/exa.js";
import { SERVICE_TYPES } from "../lib/service-types.js";
import { contactForOutput, isContactUnlocked } from "../lib/contact.js";

// ─── Shared Types ─────────────────────────────────────────────────────────────

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
  acra_reg: string | null;
  acra_status: string;
  bio: string | null;
  available: number;
}

interface ReviewRow {
  id: string;
  handyman_id: string;
  user_id: string;
  rating: number;
  comment: string | null;
  service_type: string | null;
  created_at: string;
}

// ─── Tool 3: search_handymen ──────────────────────────────────────────────────

export const searchHandymenSchema = z.object({
  service_type: z
    .enum(SERVICE_TYPES)
    .describe("Type of service needed."),
  location: z
    .string()
    .optional()
    .describe("Location/area (e.g. Tampines, Jurong). Auto-filled from Mem0 if omitted."),
  max_budget: z
    .number()
    .optional()
    .describe("Maximum budget. Auto-filled from Mem0 if omitted."),
  sort_by: z
    .enum(["rating", "price", "bookings", "trust_score"])
    .optional()
    .default("trust_score")
    .describe("Sort results by this field."),
  user_id: z
    .string()
    .optional()
    .describe("User ID for Mem0 preference auto-fill."),
});

export type SearchHandymenInput = z.infer<typeof searchHandymenSchema>;

export async function searchHandymen(input: SearchHandymenInput): Promise<string> {
  // Auto-fill from Mem0 if user_id provided
  let location = input.location;
  let maxBudget = input.max_budget;

  if (input.user_id) {
    const prefs = await getPreferences(input.user_id);
    if (!location && prefs.address) location = prefs.address;
    if (!maxBudget && prefs.budget_max) maxBudget = prefs.budget_max;
  }

  const handymen = queryAll<HandymanRow>("SELECT * FROM handymen WHERE available = 1");

  // Filter by service type
  const filtered = handymen.filter((h) => {
    const services: string[] = JSON.parse(h.service_types);
    return services.includes(input.service_type);
  });

  // Filter by budget
  const budgetFiltered = maxBudget
    ? filtered.filter((h) => h.price_min <= maxBudget!)
    : filtered;

  // Sort
  const sortKey = input.sort_by ?? "trust_score";
  const sorted = [...budgetFiltered].sort((a, b) => {
    if (sortKey === "price") return a.price_min - b.price_min;
    if (sortKey === "rating") return b.rating - a.rating;
    if (sortKey === "bookings") return b.bookings - a.bookings;
    return b.trust_score - a.trust_score;
  });

  const results = sorted.map((h) => ({
    id: h.id,
    name: h.name,
    location: h.location,
    rating: h.rating,
    bookings: h.bookings,
    price_min: h.price_min,
    price_max: h.price_max,
    trust_score: h.trust_score,
    acra_status: h.acra_status,
    service_types: JSON.parse(h.service_types) as string[],
    available_times: generateAvailableTimes(),
  }));

  return JSON.stringify({
    service_type: input.service_type,
    location_filter: location ?? "all areas",
    budget_filter: maxBudget ?? "no limit",
    total_found: results.length,
    sorted_by: sortKey,
    handymen: results,
    mem0_autofill: input.user_id ? { location, max_budget: maxBudget } : null,
  });
}

// ─── Tool 4: get_handyman_profile ─────────────────────────────────────────────

export const getHandymanProfileSchema = z.object({
  handyman_id: z.string().describe("Handyman ID from search results."),
});

export type GetHandymanProfileInput = z.infer<typeof getHandymanProfileSchema>;

export async function getHandymanProfile(
  input: GetHandymanProfileInput
): Promise<string> {
  const handyman = queryOne<HandymanRow>(
    "SELECT * FROM handymen WHERE id = ?",
    [input.handyman_id]
  );

  if (!handyman) {
    return JSON.stringify({ error: `Handyman with ID ${input.handyman_id} not found.` });
  }

  const reviews = queryAll<ReviewRow>(
    "SELECT * FROM reviews WHERE handyman_id = ? ORDER BY created_at DESC LIMIT 5",
    [input.handyman_id]
  );

  // Calculate trust score breakdown
  const trustBreakdown = {
    rating_score: Math.min((handyman.rating / 5) * 4, 4),
    bookings_score: Math.min(handyman.bookings / 100, 3),
    acra_score: handyman.acra_status === "verified" ? 2 : 0,
    response_score: 1,
    total: handyman.trust_score,
  };

  return JSON.stringify({
    id: handyman.id,
    name: handyman.name,
    // Contact is gated: masked until the $5 Concierge fee is paid for this
    // contractor. Real number is resolved server-side for outreach — see
    // lib/contact.ts. Do NOT add raw phone/whatsapp back to this output.
    contact: contactForOutput(handyman.id, handyman.whatsapp ?? handyman.phone),
    contact_unlocked: isContactUnlocked(handyman.id),
    service_types: JSON.parse(handyman.service_types) as string[],
    location: handyman.location,
    bio: handyman.bio,
    rating: handyman.rating,
    total_bookings: handyman.bookings,
    trust_score: handyman.trust_score,
    trust_score_breakdown: trustBreakdown,
    pricing: {
      min: handyman.price_min,
      max: handyman.price_max,
      currency: "SGD",
    },
    acra: {
      registration_number: handyman.acra_reg,
      status: handyman.acra_status,
      verified: handyman.acra_status === "verified",
    },
    recent_reviews: reviews.map((r) => ({
      rating: r.rating,
      comment: r.comment,
      service_type: r.service_type,
      date: r.created_at,
    })),
    available_times: generateAvailableTimes(),
  });
}

// ─── Tool 5: compare_handyman_prices ─────────────────────────────────────────

export const compareHandymanPricesSchema = z.object({
  service_type: z.enum(SERVICE_TYPES).describe("Service type to compare prices for."),
  location: z.string().optional().describe("Filter by location/area."),
});

export type CompareHandymanPricesInput = z.infer<typeof compareHandymanPricesSchema>;

export async function compareHandymanPrices(
  input: CompareHandymanPricesInput
): Promise<string> {
  const handymen = queryAll<HandymanRow>("SELECT * FROM handymen WHERE available = 1");

  const relevant = handymen.filter((h) => {
    const services: string[] = JSON.parse(h.service_types);
    return services.includes(input.service_type);
  });

  if (relevant.length === 0) {
    return JSON.stringify({
      error: `No handymen found for service type: ${input.service_type}`,
    });
  }

  const prices = relevant.map((h) => h.price_min);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;

  // Best value = highest trust_score with lowest price
  const bestValue = relevant.reduce((best, h) => {
    const score = h.trust_score / (h.price_min || 1);
    const bestScore = best.trust_score / (best.price_min || 1);
    return score > bestScore ? h : best;
  });

  const sorted = [...relevant].sort((a, b) => a.price_min - b.price_min);

  return JSON.stringify({
    service_type: input.service_type,
    location_filter: input.location ?? "all areas",
    summary: {
      min_price: minPrice,
      max_price: maxPrice,
      avg_price: Math.round(avgPrice),
      currency: "SGD",
      handymen_compared: relevant.length,
    },
    best_value_recommendation: {
      id: bestValue.id,
      name: bestValue.name,
      price_min: bestValue.price_min,
      trust_score: bestValue.trust_score,
      rating: bestValue.rating,
      reason: "Best trust-score-to-price ratio",
    },
    all_handymen: sorted.map((h) => ({
      id: h.id,
      name: h.name,
      location: h.location,
      price_min: h.price_min,
      price_max: h.price_max,
      rating: h.rating,
      trust_score: h.trust_score,
      acra_status: h.acra_status,
    })),
  });
}

// ─── Tool: discover_services_web ──────────────────────────────────────────────
// Live web discovery of real providers via Exa. Unlike search_handymen (seeded
// DB only), this finds contractors on the open web and normalizes them into the
// same shape, tagged source:"web" + unverified, so the outreach flow can still
// WhatsApp them but the UI can distinguish vetted vs discovered leads.

export const discoverServicesWebSchema = z.object({
  service_type: z
    .enum(SERVICE_TYPES)
    .describe("Type of service to search the web for."),
  location: z
    .string()
    .optional()
    .describe("Area/city to search within (e.g. Tampines, Singapore). Auto-filled from Mem0 if omitted."),
  num_results: z
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .default(5)
    .describe("How many web providers to retrieve. Capped at 5 — each result costs a live web search."),
  user_id: z
    .string()
    .optional()
    .describe("User ID for Mem0 location auto-fill."),
});

export type DiscoverServicesWebInput = z.infer<typeof discoverServicesWebSchema>;

export async function discoverServicesWeb(
  input: DiscoverServicesWebInput
): Promise<string> {
  let location = input.location;
  if (!location && input.user_id) {
    const prefs = await getPreferences(input.user_id);
    if (prefs.address) location = prefs.address;
  }

  const result = await discoverServices({
    serviceType: input.service_type,
    location,
    numResults: input.num_results,
  });

  const handymen = result.providers.map((p) => {
    const id = `web_${randomUUID().slice(0, 8)}`;
    // Persist the lead server-side so its number never lives on the client.
    // The output below masks it; outreach + booking resolve it by id, and it is
    // only unmasked once the $5 Concierge fee is paid — same gate as curated supply.
    execute(
      `INSERT INTO web_leads (id, name, phone, website, area, service_type, price_hint, source_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        p.name,
        p.phone ?? null,
        p.website ?? null,
        p.area ?? location ?? null,
        input.service_type,
        p.price_hint ?? null,
        p.source_url ?? null,
      ]
    );
    return {
      id,
      name: p.name,
      location: p.area ?? location ?? "Singapore",
      rating: null,
      bookings: null,
      price_min: null,
      price_max: null,
      price_hint: p.price_hint,
      trust_score: null,
      acra_status: "unverified",
      service_types: [input.service_type],
      // Masked until the $5 fee is paid — never the raw number, web or not.
      // null (not a mask string) means we have no phone on file for this lead
      // yet, not that one is being withheld.
      contact: contactForOutput(id, p.phone),
      contact_unlocked: isContactUnlocked(id),
      source: "web" as const,
      available_times: [],
    };
  });

  return JSON.stringify({
    service_type: input.service_type,
    location_filter: location ?? "Singapore",
    source: result.simulated ? "exa-simulated" : "exa-web",
    total_found: handymen.length,
    note:
      "Web-discovered leads are unverified (no rating/review history yet) — confirm details before booking. " +
      "`contact` is null when we have no phone on file, or a masked value like \"+65 •••• 4567\" when a real number exists but is hidden. " +
      "Reach a lead with whatsapp_multiple_handymen using its id; the real number is resolved server-side and revealed only after the $5 Concierge fee is paid. " +
      "Do not surface a lead's website/source_url or suggest the user contact them directly outside Tukang — outreach must go through whatsapp_multiple_handymen.",
    query_used: result.query,
    handymen,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateAvailableTimes(): string[] {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const times = ["9AM", "11AM", "2PM", "4PM"];
  const slots: string[] = [];
  for (let i = 0; i < 3; i++) {
    const day = days[Math.floor(Math.random() * days.length)];
    const time = times[Math.floor(Math.random() * times.length)];
    slots.push(`${day} ${time}`);
  }
  return [...new Set(slots)];
}
