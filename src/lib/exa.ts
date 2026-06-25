/**
 * exa.ts
 * Exa web-search integration for Tukang — live discovery of real local
 * service providers from the open web (the long-term "consume Craigslist"
 * supply side). Degrades to a simulated result set when EXA_API_KEY is missing,
 * matching the dev-mode pattern of mem0.ts / whatsapp.ts / qwen.ts.
 *
 * Canonical API reference:
 *   https://docs.exa.ai/reference/search-api-guide-for-coding-agents
 */

import Exa from "exa-js";
import { config } from "./config.js";

const exa = config.exa.apiKey ? new Exa(config.exa.apiKey) : null;

export interface DiscoveredProvider {
  name: string;
  phone: string | null;
  website: string | null;
  area: string | null;
  services: string | null;
  price_hint: string | null;
  source_url: string | null;
}

export interface DiscoverResult {
  providers: DiscoveredProvider[];
  simulated: boolean;
  query: string;
}

/**
 * Shape of an /search response when outputSchema is supplied. The exa-js types
 * don't expose `output`, so we narrow it ourselves.
 */
interface ExaStructuredResponse {
  output?: { content?: { providers?: Partial<DiscoveredProvider>[] } };
  results?: Array<{ title?: string; url?: string; highlights?: string[] }>;
}

const PROVIDER_SCHEMA = {
  type: "object",
  description: "Local service providers (businesses or individuals) found on the web",
  required: ["providers"],
  properties: {
    providers: {
      type: "array",
      description: "List of local service providers matching the query",
      items: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", description: "Business or contractor name" },
          phone: { type: "string", description: "Contact phone / WhatsApp number if listed" },
          website: { type: "string", description: "Website or listing URL" },
          area: { type: "string", description: "Neighbourhood / area served" },
          services: { type: "string", description: "Services offered, comma-separated" },
          price_hint: { type: "string", description: "Any pricing mentioned, e.g. 'from $80'" },
        },
      },
    },
  },
};

/**
 * Discover real local service providers from the web for a given service +
 * location. Returns a normalized provider list the discovery tool can merge
 * with seeded DB handymen.
 */
export async function discoverServices(params: {
  serviceType: string;
  location?: string;
  numResults?: number;
}): Promise<DiscoverResult> {
  const area = params.location ?? "Singapore";
  const query = `${params.serviceType} service providers and contractors in ${area} with contact details`;

  if (!exa) {
    console.log(`[Exa SIM] discoverServices(${params.serviceType} @ ${area})`);
    return {
      simulated: true,
      query,
      providers: [
        {
          name: `[SIM] ${params.serviceType} Pro ${area}`,
          phone: "+6580000000",
          website: "https://example.com/sim-provider",
          area,
          services: params.serviceType,
          price_hint: "from $80 (simulated)",
          source_url: "https://example.com/sim-provider",
        },
      ],
    };
  }

  try {
    const res = (await exa.search(query, {
      type: config.exa.searchType as "auto",
      numResults: params.numResults ?? 10,
      systemPrompt:
        "Find real local service businesses/contractors that match the query. " +
        "Prefer official sites and directory listings in the requested area. " +
        "Collapse duplicate listings. Only include providers with a contactable presence.",
      // outputSchema works on every search type; gives us grounded structured rows.
      // Cast: exa-js types the schema strictly; our runtime object is valid JSON Schema.
      outputSchema: PROVIDER_SCHEMA as never,
      contents: { highlights: true },
    })) as unknown as ExaStructuredResponse;

    const synthesized = res.output?.content?.providers ?? [];

    // Exa's outputSchema synthesis occasionally bleeds grounding/citation JSON
    // into field values; sanitizeProvider drops garbled fields and rejects
    // rows whose name doesn't survive cleaning.
    const providers: DiscoveredProvider[] = synthesized
      .map((p) =>
        sanitizeProvider({
          name: p.name ?? "",
          phone: p.phone ?? null,
          website: p.website ?? null,
          area: p.area ?? area,
          services: p.services ?? params.serviceType,
          price_hint: p.price_hint ?? null,
          source_url: p.website ?? null,
        })
      )
      .filter((p): p is DiscoveredProvider => p !== null);

    // Fallback: if synthesis returned nothing usable, surface raw results as leads.
    if (providers.length === 0 && res.results) {
      for (const r of res.results) {
        const lead = sanitizeProvider({
          name: r.title ?? r.url ?? "",
          phone: null,
          website: r.url ?? null,
          area,
          services: params.serviceType,
          price_hint: r.highlights?.[0] ?? null,
          source_url: r.url ?? null,
        });
        if (lead) providers.push(lead);
      }
    }

    return { simulated: false, query, providers };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Exa] discoverServices error:", msg);
    return { simulated: false, query, providers: [] };
  }
}

// ─── Sanitization ─────────────────────────────────────────────────────────────

// Tells that a value carries leaked grounding/citation JSON rather than real data.
const JSON_LEAK = /citations|confidence|\}\}|\{|\[\d+\]/i;

/** Null out a free-text field if it looks like leaked JSON; trim otherwise. */
function cleanText(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || JSON_LEAK.test(trimmed)) return null;
  return trimmed;
}

/** Keep only a valid http(s) URL, truncated at the first whitespace/brace. */
function cleanUrl(value: string | null): string | null {
  if (!value) return null;
  const cut = value.trim().split(/[\s}{]/)[0];
  try {
    const u = new URL(cut);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Clean every field of a discovered provider. Returns null (caller drops it)
 * when the name can't survive sanitization.
 */
function sanitizeProvider(p: DiscoveredProvider): DiscoveredProvider | null {
  const name = cleanText(p.name);
  if (!name) return null;

  const website = cleanUrl(p.website);
  return {
    name,
    phone: cleanText(p.phone),
    website,
    area: cleanText(p.area),
    services: cleanText(p.services),
    price_hint: cleanText(p.price_hint),
    source_url: website ?? cleanUrl(p.source_url),
  };
}
