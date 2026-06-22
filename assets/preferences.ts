/**
 * preferences.ts
 * Tool 1: get_saved_preferences
 * Tool 2: update_saved_preferences
 */

import { z } from "zod";
import { getPreferences, updatePreferences } from "../lib/mem0.js";

// ─── Tool 1: get_saved_preferences ───────────────────────────────────────────

export const getSavedPreferencesSchema = z.object({
  user_id: z
    .string()
    .optional()
    .describe("User identifier. Auto-detected from Claude context if omitted."),
});

export type GetSavedPreferencesInput = z.infer<typeof getSavedPreferencesSchema>;

export async function getSavedPreferences(
  input: GetSavedPreferencesInput
): Promise<string> {
  const userId = input.user_id ?? "default_user";

  const prefs = await getPreferences(userId);

  const hasPrefs = Object.keys(prefs).length > 0;

  if (!hasPrefs) {
    return JSON.stringify({
      user_id: userId,
      message: "No saved preferences found. Use update_saved_preferences to save your details for faster future bookings.",
      preferences: {},
    });
  }

  return JSON.stringify({
    user_id: userId,
    preferences: {
      address: prefs.address ?? null,
      budget_max: prefs.budget_max ?? null,
      preferred_handyman_id: prefs.preferred_handyman_id ?? null,
      preferred_handyman_name: prefs.preferred_handyman_name ?? null,
      access_notes: prefs.access_notes ?? null,
      language: prefs.language ?? "English",
      service_history: prefs.service_history ?? [],
    },
    message: "Preferences loaded from Mem0 memory layer.",
  });
}

// ─── Tool 2: update_saved_preferences ────────────────────────────────────────

export const updateSavedPreferencesSchema = z.object({
  user_id: z.string().describe("User identifier."),
  address: z.string().optional().describe("Home or default service address."),
  budget_max: z.number().optional().describe("Maximum budget in SGD/USD."),
  preferred_handyman_id: z.string().optional().describe("ID of preferred handyman."),
  preferred_handyman_name: z.string().optional().describe("Name of preferred handyman."),
  access_notes: z.string().optional().describe("Notes for handyman access (e.g. gate code, floor)."),
  language: z.string().optional().describe("Preferred language for communications (e.g. English, Mandarin, Malay)."),
});

export type UpdateSavedPreferencesInput = z.infer<typeof updateSavedPreferencesSchema>;

export async function updateSavedPreferences(
  input: UpdateSavedPreferencesInput
): Promise<string> {
  const { user_id, ...prefs } = input;

  await updatePreferences(user_id, prefs);

  return JSON.stringify({
    success: true,
    user_id,
    updated_fields: Object.keys(prefs).filter(
      (k) => prefs[k as keyof typeof prefs] !== undefined
    ),
    message: "Preferences saved to Mem0. They will be auto-filled in future bookings.",
  });
}
