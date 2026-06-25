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
  // ─── Automotive vertical ──────────────────────────────────────────────────
  // Car repair providers live in the same `handymen`/providers table; a provider
  // may be mobile (comes to the user), workshop (drive-in), or both — that axis
  // is captured in their bio + triage, not as a separate enum.
  "car_servicing",
  "car_brakes",
  "car_tyres",
  "car_battery",
  "car_aircon",
  "car_diagnostics",
  "car_bodywork",
  "car_towing",
] as const;

export type ServiceType = typeof SERVICE_TYPES[number];
