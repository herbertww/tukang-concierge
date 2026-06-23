/**
 * quoting.ts
 * Tool 6: quote_job
 * Returns estimated price range, duration, and inclusions for a job.
 */

import { z } from "zod";
import { SERVICE_TYPES } from "../lib/service-types.js";

// ─── Pricing Matrix ───────────────────────────────────────────────────────────
// Realistic Singapore market SGD ranges, scoped per service category + complexity.

interface PricingTier {
  min: number;
  max: number;
  duration_hours: number;
  included: string[];
}

type ComplexityLevel = "basic" | "medium" | "complex";

const PRICING: Record<string, Record<ComplexityLevel, PricingTier>> = {
  cleaning: {
    basic: {
      min: 80, max: 120, duration_hours: 2,
      included: ["Regular cleaning (2-room flat)", "Mopping", "Vacuuming", "Bathroom cleaning"],
    },
    medium: {
      min: 150, max: 250, duration_hours: 4,
      included: ["Deep cleaning (3-4 room flat)", "Kitchen degreasing", "Window cleaning", "Fridge cleaning"],
    },
    complex: {
      min: 280, max: 450, duration_hours: 8,
      included: ["Move-in/out cleaning", "Full flat deep clean", "Carpet shampooing", "Post-renovation cleaning"],
    },
  },
  electrical: {
    basic: {
      min: 50, max: 100, duration_hours: 1,
      included: ["Power socket replacement", "Light fixture installation", "Circuit breaker reset"],
    },
    medium: {
      min: 120, max: 250, duration_hours: 3,
      included: ["New power points (up to 3)", "Ceiling fan installation", "DB box inspection"],
    },
    complex: {
      min: 280, max: 500, duration_hours: 6,
      included: ["Full rewiring (1 room)", "3-phase power installation", "EV charger installation"],
    },
  },
  gardening: {
    basic: {
      min: 60, max: 100, duration_hours: 1,
      included: ["Grass cutting", "Hedge trimming", "Garden clean-up"],
    },
    medium: {
      min: 120, max: 200, duration_hours: 3,
      included: ["Pruning", "Weeding", "Planting (small bed)"],
    },
    complex: {
      min: 220, max: 400, duration_hours: 6,
      included: ["Landscaping", "Tree work", "Pest treatment"],
    },
  },
  plumbing: {
    basic: {
      min: 50, max: 100, duration_hours: 1,
      included: ["Tap/faucet repair", "Minor leak fix", "Toilet flush repair"],
    },
    medium: {
      min: 120, max: 220, duration_hours: 2,
      included: ["Pipe replacement (1 section)", "Toilet bowl replacement", "Water heater installation"],
    },
    complex: {
      min: 250, max: 450, duration_hours: 5,
      included: ["Full bathroom re-piping", "Sewer line repair", "Water pump replacement"],
    },
  },
  carpentry: {
    basic: {
      min: 80, max: 150, duration_hours: 2,
      included: ["Furniture assembly (IKEA)", "Door hinge repair", "Cabinet door adjustment"],
    },
    medium: {
      min: 180, max: 350, duration_hours: 4,
      included: ["Custom shelf installation", "Wardrobe door replacement", "TV console assembly"],
    },
    complex: {
      min: 400, max: 800, duration_hours: 10,
      included: ["Custom built-in wardrobe", "Full kitchen cabinet installation", "Feature wall construction"],
    },
  },
  painting: {
    basic: {
      min: 150, max: 280, duration_hours: 3,
      included: ["1 room painting (2 coats)", "Wall preparation", "Touch-up work"],
    },
    medium: {
      min: 300, max: 550, duration_hours: 6,
      included: ["2-3 rooms painting", "Ceiling painting", "Primer coat included"],
    },
    complex: {
      min: 600, max: 1200, duration_hours: 16,
      included: ["Full flat painting", "Feature wall", "Epoxy floor coating", "Waterproofing"],
    },
  },
  hvac: {
    basic: {
      min: 60, max: 100, duration_hours: 1,
      included: ["Chemical wash (1 unit)", "Filter cleaning", "Gas top-up check"],
    },
    medium: {
      min: 120, max: 220, duration_hours: 2,
      included: ["Chemical overhaul (1 unit)", "Fan coil cleaning", "Drainage check", "Gas top-up"],
    },
    complex: {
      min: 250, max: 500, duration_hours: 4,
      included: ["Full system overhaul", "Compressor inspection", "Refrigerant recharge", "Duct cleaning"],
    },
  },
  general: {
    basic: {
      min: 40, max: 80, duration_hours: 1,
      included: ["Drilling/mounting (small items)", "Minor repairs", "Sealing"],
    },
    medium: {
      min: 90, max: 150, duration_hours: 2,
      included: ["Multiple mounting/installation tasks", "Patching", "General repairs"],
    },
    complex: {
      min: 160, max: 300, duration_hours: 4,
      included: ["Multi-item installation", "Tasks requiring ladders/special tools", "Extended troubleshooting"],
    },
  },
  appliance: {
    basic: {
      min: 50, max: 90, duration_hours: 1,
      included: ["Diagnosis", "Minor repair", "Basic part replacement"],
    },
    medium: {
      min: 100, max: 180, duration_hours: 2,
      included: ["Component replacement", "Installation", "Relocation"],
    },
    complex: {
      min: 200, max: 380, duration_hours: 4,
      included: ["Major repair", "Full replacement", "Complex installation"],
    },
  },
  smart_home: {
    basic: {
      min: 80, max: 150, duration_hours: 1,
      included: ["Single device install (lock/camera/doorbell)", "App pairing", "Basic setup"],
    },
    medium: {
      min: 180, max: 320, duration_hours: 2,
      included: ["Multi-device install", "Hub/ecosystem integration", "WiFi/Zigbee setup"],
    },
    complex: {
      min: 350, max: 650, duration_hours: 4,
      included: ["Whole-home smart system setup", "Multi-ecosystem integration", "Troubleshooting + wiring"],
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

  const minPrice = pricing.min + surcharge;
  const maxPrice = pricing.max + surcharge;

  return JSON.stringify({
    service_type: input.service_type,
    complexity: input.complexity,
    estimate: {
      price_range: `SGD $${minPrice} – $${maxPrice}`,
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
    next_step: "Use search_handymen to find available handymen, then whatsapp_multiple_handymen to get real quotes.",
  });
}
