/**
 * service-types.ts
 * Canonical list of Tukang service categories. Shared by quote_job,
 * search_handymen, and compare_handyman_prices so the category list
 * (and the triage questions in system-prompt.ts) never drift apart.
 */

export const SERVICE_TYPES = [
  "cleaning",
  "electrical",
  "gardening",
  "plumbing",
  "carpentry",
  "painting",
  "hvac",
  "general",
  "appliance",
  "smart_home",
] as const;

export type ServiceType = typeof SERVICE_TYPES[number];
