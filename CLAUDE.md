# CLAUDE.md

Guidance for Claude Code working in this repo. These instructions OVERRIDE default behavior.

## What This Is

**Tukang** — a Singapore home-services booking platform delivered as an **MCP server**. Users chat with an AI (any MCP client) to book handymen, plumbers, electricians, cleaners, etc. 16 MCP tools search contractors, WhatsApp quotes to several contractors in parallel, collect bids, and finalise with Stripe.

- **Repo:** https://github.com/herbertww/tukang-concierge
- **Stack:** TypeScript/Node ESM (`"type": "module"`) · MCP over HTTP (Streamable), port 8000 · SQLite via **sql.js** (file `tukang.db`) · Mem0 (memory) · WhatsApp Business API (outreach) · Stripe ($5 fee) · Qwen Cloud/DashScope (LLM) · Exa (live web discovery of providers) · deploy target Alibaba Cloud ECS
- **Market:** Singapore primary; Malaysian contractors accepted.

## Vision & Strategy

- **Ultimate goal:** replace manual listings directories (Craigslist, Carousell, classifieds) with a conversational, agent-native marketplace. Handymen booking is the wedge; long-term target is **all local services**.
- **Distribution:** be a ready-made MCP connector for when MCP "app"/connector marketplaces land in popular AI chat (Claude, ChatGPT) — discoverable and one-click usable the moment they exist.
- **Cost model:** lean on the **user's own AI compute subscription** to crawl/discover services on demand — supply discovery runs on their dime, not ours. Keep our server thin: matching, outreach, bids, payment.
- **Hackathon exception:** for the Qwen hackathon we must run on **Alibaba Cloud ECS** and use **Qwen Cloud (DashScope)** as the LLM. Requirement, not the permanent architecture.

## `.env` — You Are Its Manager

`.env` lives at project root (in `.gitignore`). Write keys the moment the user gives them; handle "update X to Y" and "what's missing" (list blanks). **Never** commit `.env`, print full secret values (confirm with `✅ KEY updated`, or show last 4 chars `...O7JX`), or hardcode secrets — always `process.env.KEY`.

Required keys: `PORT NODE_ENV DB_PATH MEM0_API_KEY WHATSAPP_TOKEN WHATSAPP_PHONE_NUMBER_ID WHATSAPP_VERIFY_TOKEN STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET STRIPE_SERVICE_FEE_PRICE_ID PUBLIC_URL QWEN_API_KEY EXA_API_KEY` (+ optional `EXA_SEARCH_TYPE`).

Every external client (`mem0.ts`, `whatsapp.ts`, `stripe.ts`, `qwen.ts`, `exa.ts`) **degrades to a simulated dev response when its key is missing** instead of throwing — the server runs end-to-end with an empty `.env`. Missing keys degrade silently; don't assume a feature is broken just because nothing fails visibly.

## Source Layout (`src/` is the only live code)

```
src/index.ts          MCP server, Express app, session/transport handling,
                      WhatsApp inbound webhook + regex reply parser, Stripe webhook
src/db/database.ts    sql.js init, migrations, execute()/queryOne()/queryAll()
src/db/seed.ts        `npm run seed` — idempotent demo data
src/lib/config.ts     typed env loader (single `config` object; all files import this)
src/lib/{mem0,whatsapp,stripe,qwen,exa}.ts   external clients (all degrade w/o keys)
src/lib/contact.ts    contact-disclosure gate: maskPhone / isContactUnlocked / resolveProvider / resolveHandymanPhone / contactForOutput
src/tools/*.ts        one file per tool category: zod schema + async handler → JSON string
```

⚠️ **`assets/` is a frozen legacy dump** — its own package.json, a parallel src tree, a React frontend, and a stale `vapi.ts`. Nothing in it is imported or runs. Never treat it as live code or a reference for current behavior.

## Marketing Site (`tukang-site/`)

Single static `index.html`, served by the same Express app (`app.use(express.static(...))` in `src/index.ts`) at `/`. No build step.

- **Canonical logo:** `tukang-site/logo.svg` (chat-bubble + brass wrench mark, `#19211F`/`#CBA15A`/`#ECEAE1`, wordmark set in Schibsted Grotesk 800). Inlined directly into the nav (`.brand`) and footer (`.foot-brand`) rather than referenced via `<img>`, matching the site's existing inline-SVG pattern. The saved `.svg` file itself isn't fetched by the page — it exists as the source-of-truth asset for regenerating other renders (OG image, favicon).
- **`tukang-site/og-image.png`** (1200×630) and **`tukang-site/favicon.png`** (512×512) are raster renders of that same logo, generated via headless Chrome screenshot (no image-conversion CLI is installed locally) since social-preview crawlers and browser favicons need real image files, not inline SVG. Referenced by absolute `https://tukang.app/...` URLs in `<head>` (`og:image`, `twitter:image`, `rel="icon"`) — crawlers won't resolve relative paths. **If the logo changes again, both PNGs need regenerating from the new source**, not just the inline nav/footer SVG.
- **Deploy is manual, not git-triggered:** Railway isn't wired to auto-deploy on push. Every site or server change needs `railway up --service tukang` after `git push`. Pushing to `main` alone does not update tukang.app.

## Architecture Gotchas (load-bearing)

- **ESM relative imports need explicit `.js`** even though sources are `.ts` (e.g. `import { config } from "../lib/config.js"`). Omitting it fails at runtime even if `tsc` is silent.
- **Per-session servers:** each `mcp-session-id` gets its own `StreamableHTTPServerTransport` + freshly built `McpServer` (`createMcpServer()`), stored in an in-memory `Map`. No shared instance; tool registration runs once per session.
- **Adding a tool:** export `xSchema` (zod) + async handler returning `Promise<string>` under `src/tools/`, register in `createMcpServer()` via `server.tool(name, desc, xSchema.shape, handler)`, and update the tool count in `/health` + startup banner.
- **Contact number = the product, never in output pre-payment — ANY source:** the $5 fee sells the introduction, so a provider's phone/WhatsApp must NOT appear in any tool output until the fee is paid — **curated directory and live web leads are gated identically.** Finding the number is the service; the user never leaves AI chat to get it. Every user-facing tool routes contact through `contactForOutput(id, realPhone)` in `src/lib/contact.ts` (real number once `bookings.payment_status='paid'`, else a `+65 •••• 4567` mask). Web leads from `discover_services_web` are persisted to the `web_leads` table with a generated `web_*` id and their phone stored server-side; `resolveProvider(id)` resolves curated **or** web leads, so outreach/booking work by id and the number never crosses the wire to the client. Names are not sensitive; never fall back to a raw phone as a display name.
- **DB persistence:** sql.js holds the whole DB in memory; every `execute()` does a full `db.export()` + `writeFileSync`. No WAL, transactions, or concurrency control — don't assume Postgres/better-sqlite3 semantics.
- **WhatsApp inbound parsed by regex, not LLM:** `parsePrice()/parseAvailability()/parseDatetime()` in `index.ts` extract fields into `handyman_quotes`. A reply matches the contractor's **most recent** open `session_id` (`ORDER BY received_at DESC LIMIT 1`) — concurrent outreach: newer session wins.
- **Stripe currency bug:** `createServiceFeeCheckout()` hardcodes `currency: "usd"` while everything else reports/charges **SGD** ("$5 SGD fee"). Real mismatch — fixing to `"sgd"` is a substantive change.
- **Currency parsing:** SGD patterns (`SGD`, `S$`, `$`, `dollars`) checked first; RM/MYR secondary. All outgoing WhatsApp requests quotes in SGD.
- **No test suite** in `src/` (`assets/mcp.test.ts` is legacy, not wired up).

## The 15 MCP Tools

- **Memory (Mem0):** `get_saved_preferences`, `update_saved_preferences`
- **Discovery:** `search_handymen` (seeded DB), `get_handyman_profile` (profile + 5 reviews + trust score; contact masked until paid), `compare_handyman_prices`, `discover_services_web` (live Exa web search → unverified leads, `source:"web"`, normalized to `search_handymen` shape, persisted to `web_leads` with a `web_*` id, contact masked until paid)
- **Quoting:** `quote_job` (static pricing matrix, no DB)
- **Outreach (WhatsApp):** `whatsapp_handyman`, `whatsapp_multiple_handymen` (1–5 parallel → `session_id`)
- **Bids:** `present_bid_results` (live table by session_id), `accept_winning_bid` (pick winner, reject rest, Stripe link)
- **Booking:** `book_job` (finalise + Stripe checkout), `notify_arrival`
- **Registration:** `register_provider`, `submit_provider_review` (recalcs avg rating), `get_provider_reviews`

## Booking Flow

chat → `get_saved_preferences` → `search_handymen` → `whatsapp_multiple_handymen` (→ session_id) → contractor replies hit `POST /webhooks/whatsapp` (regex → `handyman_quotes`) → `present_bid_results` → user picks → `accept_winning_bid` (Stripe link) → user pays $5 → Stripe webhook → booking `confirmed` → job day `notify_arrival`.

## Build & Run

```
npm install
npm run build   # tsc → dist/
npm start       # node dist/index.js
npm run dev     # tsx watch src/index.ts
npm run seed    # demo handymen + reviews (idempotent)
npm run lint    # tsc --noEmit
```
Endpoints: `GET /health` · `POST /mcp` · `POST /webhooks/whatsapp` · `POST /webhooks/stripe`

## Hackathon (Qwen Cloud Global, Track 4 — Autopilot Agent, due 2026-07-09)

Submission repo must be public + MIT (license visible in GitHub About). Backend on Alibaba Cloud ECS; LLM = Qwen Cloud/DashScope (`https://dashscope.aliyuncs.com/compatible-mode/v1`, model `qwen-max`); `src/lib/qwen.ts` is the proof-of-Alibaba-usage file to link.
Remaining: deploy to ECS · set `.env` on ECS · point WhatsApp webhook at ECS domain · commit `assets/architecture.png` · record 3-min demo → YouTube · submit at portal.

## Hard Rules

- Do NOT reintroduce **Vapi** or any voice-calling lib (outreach is WhatsApp-only).
- Do NOT use **OpenAI or Anthropic** as the LLM — must be Qwen Cloud.
- Do NOT commit `.env`, or print/log full secret values.
- Do NOT rename MCP tools or change input schemas without updating all callers + counts.
- Do NOT switch off SQLite/sql.js without rewriting `src/db/database.ts`.
- Do NOT treat anything under `assets/` as live code.
- Do NOT emit any provider's raw phone/WhatsApp in any tool output before the fee is paid — **curated OR web, no exceptions** — always go through `contactForOutput` (see Architecture Gotchas). Don't add `phone`/`whatsapp` back to `get_handyman_profile`, `present_bid_results`, `accept_winning_bid`, `book_job`, or `discover_services_web`, and don't make outreach take a raw number for any provider. New tools that surface a provider must reuse `contactForOutput`/`resolveProvider`.
