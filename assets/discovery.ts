/**
 * discovery.ts
 * Tool 3: search_handymen
 * Tool 4: get_handyman_profile
 * Tool 5: compare_handyman_prices
 */

import { z } from "zod";
import { queryAll, queryOne } from "../db/database.js";
import { getPreferences } from "../lib/mem0.js";

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

const SERVICE_TYPES = ["ac_repair", "plumbing", "electrical", "cleaning", "carpentry", "painting"] as const;
type ServiceType = typeof SERVICE_TYPES[number];

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
    phone: handyman.phone,
    whatsapp: handyman.whatsapp,
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
