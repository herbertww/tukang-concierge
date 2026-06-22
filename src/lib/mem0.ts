/**
 * mem0.ts
 * Wrapper around the Mem0 REST API for persistent user preferences.
 * Docs: https://docs.mem0.ai/api-reference
 */

import axios from "axios";
import { config } from "./config.js";

export interface UserPreferences {
  address?: string;
  budget_max?: number;
  preferred_handyman_id?: string;
  preferred_handyman_name?: string;
  access_notes?: string;
  language?: string;
  service_history?: string[];
}

interface Mem0Memory {
  id: string;
  memory: string;
  user_id: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface Mem0SearchResult {
  id: string;
  memory: string;
  score: number;
}

const mem0 = axios.create({
  baseURL: config.mem0.baseUrl,
  headers: {
    Authorization: `Token ${config.mem0.apiKey}`,
    "Content-Type": "application/json",
  },
  timeout: 15_000,
});

/**
 * Retrieve all memories for a user and parse them into UserPreferences.
 */
export async function getPreferences(userId: string): Promise<UserPreferences> {
  if (!config.mem0.apiKey) {
    return {};
  }

  try {
    const res = await mem0.get<Mem0Memory[]>(`/memories/`, {
      params: { user_id: userId },
    });

    const prefs: UserPreferences = {};

    for (const mem of res.data) {
      const text = mem.memory.toLowerCase();

      // Parse address
      const addrMatch = mem.memory.match(/address[:\s]+(.+)/i);
      if (addrMatch) prefs.address = addrMatch[1].trim();

      // Parse budget
      const budgetMatch = mem.memory.match(/budget[:\s]+\$?(\d+)/i);
      if (budgetMatch) prefs.budget_max = parseInt(budgetMatch[1], 10);

      // Parse preferred handyman
      const prefMatch = mem.memory.match(/preferred handyman[:\s]+([^,\n]+)/i);
      if (prefMatch) prefs.preferred_handyman_name = prefMatch[1].trim();

      // Parse access notes
      const accessMatch = mem.memory.match(/access notes?[:\s]+(.+)/i);
      if (accessMatch) prefs.access_notes = accessMatch[1].trim();

      // Parse language
      const langMatch = mem.memory.match(/language[:\s]+(\w+)/i);
      if (langMatch) prefs.language = langMatch[1].trim();

      // Parse service history
      if (text.includes("service history") || text.includes("past service")) {
        const services = mem.memory.match(/\b(ac_repair|plumbing|electrical|cleaning|carpentry|painting)\b/gi);
        if (services) {
          prefs.service_history = [...new Set(services.map((s) => s.toLowerCase()))];
        }
      }
    }

    return prefs;
  } catch (err) {
    console.error("[Mem0] getPreferences error:", err);
    return {};
  }
}

/**
 * Add or update a memory for a user.
 */
export async function addMemory(
  userId: string,
  content: string,
  metadata?: Record<string, unknown>
): Promise<string | null> {
  if (!config.mem0.apiKey) {
    return null;
  }

  try {
    const res = await mem0.post<{ id: string }>("/memories/", {
      messages: [{ role: "user", content }],
      user_id: userId,
      metadata,
    });
    return res.data.id;
  } catch (err) {
    console.error("[Mem0] addMemory error:", err);
    return null;
  }
}

/**
 * Update preferences by writing structured memory entries.
 */
export async function updatePreferences(
  userId: string,
  prefs: Partial<UserPreferences>
): Promise<void> {
  const parts: string[] = [];

  if (prefs.address) parts.push(`Address: ${prefs.address}`);
  if (prefs.budget_max !== undefined) parts.push(`Budget: $${prefs.budget_max}`);
  if (prefs.preferred_handyman_name) parts.push(`Preferred handyman: ${prefs.preferred_handyman_name}`);
  if (prefs.preferred_handyman_id) parts.push(`Preferred handyman ID: ${prefs.preferred_handyman_id}`);
  if (prefs.access_notes) parts.push(`Access notes: ${prefs.access_notes}`);
  if (prefs.language) parts.push(`Language: ${prefs.language}`);
  if (prefs.service_history?.length) {
    parts.push(`Service history: ${prefs.service_history.join(", ")}`);
  }

  if (parts.length === 0) return;

  await addMemory(userId, parts.join("\n"), { type: "preferences" });
}

/**
 * Search memories for a user by query.
 */
export async function searchMemories(
  userId: string,
  query: string
): Promise<Mem0SearchResult[]> {
  if (!config.mem0.apiKey) {
    return [];
  }

  try {
    const res = await mem0.post<Mem0SearchResult[]>("/memories/search/", {
      query,
      user_id: userId,
    });
    return res.data;
  } catch (err) {
    console.error("[Mem0] searchMemories error:", err);
    return [];
  }
}
