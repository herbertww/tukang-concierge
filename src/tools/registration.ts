/**
 * registration.ts
 * Tool: register_provider    — self-registration for handymen, beauticians, facialists
 * Tool: submit_provider_review — users rate a completed service provider
 * Tool: get_provider_reviews   — fetch all reviews for a provider
 */

import { z } from "zod";
import { execute, queryAll, queryOne } from "../db/database.js";
import { v4 as uuidv4 } from "uuid";

// ─── Tool: register_provider ──────────────────────────────────────────────────

export const registerProviderSchema = z.object({
  name: z.string().describe("Full name of the service provider."),
  phone: z.string().describe("Phone number (E.164 format, e.g. +6591234567)."),
  whatsapp: z.string().optional().describe("WhatsApp number if different from phone."),
  email: z.string().email().optional().describe("Email address."),
  provider_type: z
    .enum(["handyman", "beautician", "facialist", "other"])
    .describe("Type of service provider."),
  service_types: z
    .array(z.string())
    .min(1)
    .describe(
      "List of services offered. E.g. ['plumbing', 'electrical'] or ['facial', 'eyebrow threading']."
    ),
  location: z.string().describe("Area(s) served. E.g. 'Tampines, Pasir Ris, Bedok'."),
  price_min: z.number().optional().describe("Minimum job/session price in SGD."),
  price_max: z.number().optional().describe("Maximum job/session price in SGD."),
  acra_reg: z.string().optional().describe("ACRA UEN registration number if applicable."),
  bio: z.string().optional().describe("Short bio or description of experience."),
  years_experience: z.number().int().min(0).optional().describe("Years of experience."),
  portfolio_url: z.string().url().optional().describe("Link to portfolio, Instagram, or website."),
});

export type RegisterProviderInput = z.infer<typeof registerProviderSchema>;

export async function registerProvider(input: RegisterProviderInput): Promise<string> {
  // Check for duplicate phone
  const existing = queryOne(
    "SELECT id FROM provider_applications WHERE phone = ? AND status != 'rejected'",
    [input.phone]
  );
  if (existing) {
    return JSON.stringify({
      success: false,
      error: "A provider with this phone number has already applied or is active.",
    });
  }

  const id = uuidv4();
  execute(
    `INSERT INTO provider_applications
       (id, name, phone, whatsapp, email, provider_type, service_types, location,
        price_min, price_max, acra_reg, bio, years_experience, portfolio_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.name,
      input.phone,
      input.whatsapp ?? input.phone,
      input.email ?? null,
      input.provider_type,
      JSON.stringify(input.service_types),
      input.location,
      input.price_min ?? 0,
      input.price_max ?? 0,
      input.acra_reg ?? null,
      input.bio ?? null,
      input.years_experience ?? 0,
      input.portfolio_url ?? null,
    ]
  );

  const providerTypeLabel: Record<string, string> = {
    handyman: "Handyman / Technician",
    beautician: "Beautician",
    facialist: "Facialist / Aesthetician",
    other: "Service Provider",
  };

  return JSON.stringify({
    success: true,
    application_id: id,
    message: `Thank you ${input.name}! Your application as a ${providerTypeLabel[input.provider_type]} has been received.`,
    status: "pending",
    services: input.service_types,
    location: input.location,
    next_steps: [
      "Our team will review your application within 1–2 business days.",
      input.acra_reg
        ? "Your ACRA registration will be verified with the registry."
        : "Consider adding your ACRA UEN to boost your trust score.",
      "You will be notified via WhatsApp once approved.",
      "After approval, you will appear in search results for customers.",
    ],
  });
}

// ─── Tool: submit_provider_review ────────────────────────────────────────────

export const submitProviderReviewSchema = z.object({
  handyman_id: z.string().describe("ID of the handyman/provider being reviewed."),
  user_id: z.string().describe("ID of the user submitting the review."),
  rating: z
    .number()
    .min(1)
    .max(5)
    .describe("Rating from 1 to 5 stars."),
  comment: z.string().optional().describe("Optional written review."),
  service_type: z.string().optional().describe("Type of service that was performed."),
});

export type SubmitProviderReviewInput = z.infer<typeof submitProviderReviewSchema>;

export async function submitProviderReview(
  input: SubmitProviderReviewInput
): Promise<string> {
  // Verify provider exists
  const provider = queryOne<{ id: string; name: string; rating: number; bookings: number }>(
    "SELECT id, name, rating, bookings FROM handymen WHERE id = ?",
    [input.handyman_id]
  );

  if (!provider) {
    return JSON.stringify({ success: false, error: "Provider not found." });
  }

  // Check for duplicate review from same user for same provider
  const dupCheck = queryOne(
    "SELECT id FROM reviews WHERE handyman_id = ? AND user_id = ?",
    [input.handyman_id, input.user_id]
  );
  if (dupCheck) {
    return JSON.stringify({
      success: false,
      error: "You have already submitted a review for this provider.",
    });
  }

  const reviewId = uuidv4();
  execute(
    `INSERT INTO reviews (id, handyman_id, user_id, rating, comment, service_type)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      reviewId,
      input.handyman_id,
      input.user_id,
      input.rating,
      input.comment ?? null,
      input.service_type ?? null,
    ]
  );

  // Recalculate average rating from all reviews
  const allRatings = queryAll<{ rating: number }>(
    "SELECT rating FROM reviews WHERE handyman_id = ?",
    [input.handyman_id]
  );
  const avgRating =
    allRatings.reduce((sum, r) => sum + r.rating, 0) / allRatings.length;

  // Update provider's stored rating
  execute(
    "UPDATE handymen SET rating = ? WHERE id = ?",
    [Math.round(avgRating * 10) / 10, input.handyman_id]
  );

  const stars = "⭐".repeat(Math.round(input.rating));

  return JSON.stringify({
    success: true,
    review_id: reviewId,
    provider_name: provider.name,
    rating_given: input.rating,
    stars,
    new_average_rating: Math.round(avgRating * 10) / 10,
    total_reviews: allRatings.length,
    message: `Review submitted! ${provider.name} now has an average of ${Math.round(avgRating * 10) / 10}⭐ from ${allRatings.length} review(s).`,
  });
}

// ─── Tool: get_provider_reviews ──────────────────────────────────────────────

export const getProviderReviewsSchema = z.object({
  handyman_id: z.string().describe("ID of the provider."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe("Number of reviews to return (default 10)."),
});

export type GetProviderReviewsInput = z.infer<typeof getProviderReviewsSchema>;

interface ReviewRow {
  id: string;
  user_id: string;
  rating: number;
  comment: string | null;
  service_type: string | null;
  created_at: string;
}

export async function getProviderReviews(
  input: GetProviderReviewsInput
): Promise<string> {
  const provider = queryOne<{ id: string; name: string; rating: number }> (
    "SELECT id, name, rating FROM handymen WHERE id = ?",
    [input.handyman_id]
  );

  if (!provider) {
    return JSON.stringify({ success: false, error: "Provider not found." });
  }

  const reviews = queryAll<ReviewRow>(
    `SELECT id, user_id, rating, comment, service_type, created_at
     FROM reviews
     WHERE handyman_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [input.handyman_id, input.limit]
  );

  const totalCount = queryOne<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM reviews WHERE handyman_id = ?",
    [input.handyman_id]
  );

  const formatted = reviews
    .map((r) => {
      const stars = "⭐".repeat(Math.round(r.rating));
      const service = r.service_type ? ` [${r.service_type}]` : "";
      const comment = r.comment ? `\n   "${r.comment}"` : "";
      return `${stars}${service} — ${r.created_at.slice(0, 10)}${comment}`;
    })
    .join("\n");

  return JSON.stringify({
    provider_name: provider.name,
    average_rating: provider.rating,
    total_reviews: totalCount?.cnt ?? 0,
    showing: reviews.length,
    reviews_formatted: formatted || "No reviews yet.",
    reviews,
  });
}
