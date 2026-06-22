/**
 * quoting.ts
 * Tool 6: quote_job
 * Returns estimated price range, duration, and inclusions for a job.
 */

import { z } from "zod";

const SERVICE_TYPES = ["ac_repair", "plumbing", "electrical", "cleaning", "carpentry", "painting"] as const;

// ─── Pricing Matrix ───────────────────────────────────────────────────────────

interface PricingTier {
  min: number;
  max: number;
  duration_hours: number;
  included: string[];
}

type ComplexityLevel = "basic" | "medium" | "complex";

const PRICING: Record<string, Record<ComplexityLevel, PricingTier>> = {
  ac_repair: {
    basic: {
      min: 50, max: 80, duration_hours: 1,
      included: ["Chemical wash (1 unit)", "Filter cleaning", "Gas top-up check"],
    },
    medium: {
      min: 80, max: 150, duration_hours: 2,
      included: ["Chemical overhaul (1 unit)", "Fan coil cleaning", "Drainage check", "Gas top-up"],
    },
    complex: {
      min: 150, max: 350, duration_hours: 4,
      included: ["Full system overhaul", "Compressor inspection", "Refrigerant recharge", "Duct cleaning"],
    },
  },
  plumbing: {
    basic: {
      min: 60, max: 100, duration_hours: 1,
      included: ["Tap/faucet repair", "Minor leak fix", "Toilet flush repair"],
    },
    medium: {
      min: 100, max: 200, duration_hours: 2,
      included: ["Pipe replacement (1 section)", "Toilet bowl replacement", "Water heater installation"],
    },
    complex: {
      min: 200, max: 500, duration_hours: 5,
      included: ["Full bathroom re-piping", "Sewer line repair", "Water pump replacement"],
    },
  },
  electrical: {
    basic: {
      min: 80, max: 120, duration_hours: 1,
      included: ["Power socket replacement", "Light fixture installation", "Circuit breaker reset"],
    },
    medium: {
      min: 120, max: 250, duration_hours: 3,
      included: ["New power points (up to 3)", "Ceiling fan installation", "DB box inspection"],
    },
    complex: {
      min: 250, max: 600, duration_hours: 6,
      included: ["Full rewiring (1 room)", "3-phase power installation", "EV charger installation"],
    },
  },
  cleaning: {
    basic: {
      min: 50, max: 80, duration_hours: 2,
      included: ["Regular cleaning (2-room flat)", "Mopping", "Vacuuming", "Bathroom cleaning"],
    },
    medium: {
      min: 80, max: 150, duration_hours: 4,
      included: ["Deep cleaning (3-4 room flat)", "Kitchen degreasing", "Window cleaning", "Fridge cleaning"],
    },
    complex: {
      min: 150, max: 400, duration_hours: 8,
      included: ["Move-in/out cleaning", "Full flat deep clean", "Carpet shampooing", "Post-renovation cleaning"],
    },
  },
  carpentry: {
    basic: {
      min: 60, max: 100, duration_hours: 2,
      included: ["Furniture assembly (IKEA)", "Door hinge repair", "Cabinet door adjustment"],
    },
    medium: {
      min: 100, max: 300, duration_hours: 4,
      included: ["Custom shelf installation", "Wardrobe door replacement", "TV console assembly"],
    },
    complex: {
      min: 300, max: 1200, duration_hours: 10,
      included: ["Custom built-in wardrobe", "Full kitchen cabinet installation", "Feature wall construction"],
    },
  },
  painting: {
    basic: {
      min: 80, max: 150, duration_hours: 3,
      included: ["1 room painting (2 coats)", "Wall preparation", "Touch-up work"],
    },
    medium: {
      min: 150, max: 400, duration_hours: 6,
      included: ["2-3 rooms painting", "Ceiling painting", "Primer coat included"],
    },
    complex: {
      min: 400, max: 1500, duration_hours: 16,
      included: ["Full flat painting", "Feature wall", "Epoxy floor coating", "Waterproofing"],
    },
  },
};

// ─── Tool 6: quote_job ────────────────────────────────────────────────────────

export const quoteJobSchema = z.object({
  service_type: z.enum(SERVICE_TYPES).describe("Type of service."),
  complexity: z
    .enum(["basic", "medium", "complex"])
    .describe("Job complexity level."),
  address: z
    .string()
    .optional()
    .describe("Service address (used for travel surcharge calculation)."),
});

export type QuoteJobInput = z.infer<typeof quoteJobSchema>;

export async function quoteJob(input: QuoteJobInput): Promise<string> {
  const pricing = PRICING[input.service_type]?.[input.complexity];

  if (!pricing) {
    return JSON.stringify({
      error: `No pricing data for ${input.service_type} at ${input.complexity} complexity.`,
    });
  }

  // Apply location surcharge for certain areas
  let surcharge = 0;
  let surchargeReason = null;
  if (input.address) {
    const remoteAreas = ["sentosa", "tuas", "jurong island", "changi"];
    const isRemote = remoteAreas.some((area) =>
      input.address!.toLowerCase().includes(area)
    );
    if (isRemote) {
      surcharge = 20;
      surchargeReason = "Remote area surcharge";
    }
  }

  return JSON.stringify({
    service_type: input.service_type,
    complexity: input.complexity,
    estimate: {
      min_price: pricing.min + surcharge,
      max_price: pricing.max + surcharge,
      currency: "SGD",
      duration_hours: pricing.duration_hours,
      surcharge: surcharge > 0 ? { amount: surcharge, reason: surchargeReason } : null,
    },
    whats_included: pricing.included,
    notes: [
      "Prices are estimates. Final price confirmed by handyman after site assessment.",
      "Materials not included unless specified.",
      "Tukang $5 platform fee applies separately via Stripe.",
      "Handyman's rate is paid directly upon job completion.",
    ],
    next_step: "Use search_handymen to find available handymen, then call_multiple_handymen_parallel to get real quotes.",
  });
}
