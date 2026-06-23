# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

**Tukang** is a Singapore-based home services booking platform delivered as an MCP (Model Context Protocol) server. Users chat with an AI (via any MCP-compatible client) to book handymen, plumbers, electricians, cleaners, etc. The AI uses Tukang's 15 MCP tools to search contractors, send WhatsApp quotes to multiple contractors in parallel, collect bids, and finalise bookings with Stripe payment.

**Repo:** https://github.com/herbertww/tukang-concierge
**Language:** TypeScript / Node.js (ESM, `"type": "module"`)
**Transport:** MCP over HTTP (Streamable), port 8000
**Database:** SQLite (file: `tukang.db`)
**Market:** Singapore primary, Malaysian contractors accepted

---

## Environment Variable Management

**You are the permanent manager of `.env` for this project.**

Rules you must follow at all times:
- `.env` lives at the project root. Create it if it does not exist.
- When the user gives you a key/value, immediately write it to `.env`
- When the user says "update X to Y", update that line in `.env`
- When the user asks "what keys are missing", read `.env` and list blanks
- **NEVER commit `.env` to git** — it is in `.gitignore`
- **NEVER print full secret values in your responses** — confirm with "✅ MEM0_API_KEY updated" not the actual value
- **NEVER hardcode secrets** in any source file — always use `process.env.KEY_NAME`
- If you need to show a key for verification, show only the last 4 characters: `...O7JX`

Required keys (from `.env.example`):
```
PORT=8000
NODE_ENV=development
DB_PATH=./tukang.db
MEM0_API_KEY=
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_SERVICE_FEE_PRICE_ID=
PUBLIC_URL=
QWEN_API_KEY=
```

Every external client (`src/lib/mem0.ts`, `whatsapp.ts`, `stripe.ts`, `qwen.ts`) degrades to a **simulated/dev-mode response** when its API key is missing, instead of throwing — e.g. `sendWhatsAppMessage` logs `[WhatsApp SIM]` and returns a fake message ID, `qwenChatCompletion` returns a `[Qwen Cloud not configured]` placeholder. This means the server runs end-to-end with an empty `.env`; missing keys silently degrade behavior rather than crashing, so don't assume a feature is broken just because nothing visibly fails.

---

## Current Stack

| Layer | Technology |
|---|---|
| MCP Server | `@modelcontextprotocol/sdk` |
| Language | TypeScript (compiled to `dist/`) |
| Database | SQLite (`sql.js` driver — NOT `better-sqlite3`) |
| Memory | Mem0 (`mem0ai` REST API via `axios`) |
| Contractor Outreach | WhatsApp Business API (Meta) |
| Payments | Stripe Checkout ($5 platform fee) |
| LLM | Qwen Cloud / DashScope (`src/lib/qwen.ts`) |
| Deployment target | Alibaba Cloud ECS |

**Vapi has been permanently removed.** Do not reintroduce it. (Contractor outreach is WhatsApp-only — see `src/tools/calling.ts`.)

---

## Source Structure

```
tukang/
├── CLAUDE.md
├── LICENSE                   # MIT
├── .env                      # secrets, never commit
├── .env.example               # template, safe to commit
├── src/
│   ├── index.ts              # MCP server entry, Express app, MCP transport/session handling,
│   │                          # WhatsApp inbound webhook + reply parser, Stripe webhook
│   ├── db/
│   │   ├── database.ts       # sql.js init, migrations, execute(), queryOne(), queryAll()
│   │   └── seed.ts           # `npm run seed` — idempotent demo data (8 SG handymen + reviews)
│   ├── lib/
│   │   ├── config.ts         # Typed env var loader (single `config` object, all other files import this)
│   │   ├── mem0.ts           # Mem0 REST client — regex-parses free-text memories into UserPreferences
│   │   ├── whatsapp.ts       # sendWhatsAppMessage() + templated notifications via Meta Cloud API
│   │   ├── stripe.ts         # Stripe Checkout session creation + webhook signature verification
│   │   └── qwen.ts           # Qwen Cloud DashScope client — hackathon proof-of-Alibaba-Cloud-usage file
│   └── tools/                # One file per MCP tool category; each exports a zod schema + handler
│       ├── preferences.ts    # get/update_saved_preferences (Mem0)
│       ├── discovery.ts      # search_handymen, get_handyman_profile, compare_handyman_prices
│       ├── quoting.ts        # quote_job (static pricing matrix, no DB)
│       ├── calling.ts        # whatsapp_handyman, whatsapp_multiple_handymen
│       ├── bids.ts           # present_bid_results, accept_winning_bid
│       ├── booking.ts        # book_job, notify_arrival
│       └── registration.ts   # register_provider, submit_provider_review, get_provider_reviews
├── dist/                      # tsc build output — do not edit directly
└── assets/                    # ⚠️ STALE LEGACY DUMP — see warning below
```

### ⚠️ `assets/` is not part of the active build

`assets/` is a frozen snapshot of an earlier project iteration — it contains its own `package.json`, `tsconfig.json`, `.env.example`, an entire parallel `src`-like tree (`mcp.ts`, `db.ts`, `vapi.ts`, `oauth-compat.ts`, `routers.ts`, `useAuth.ts`), a React frontend (`Home.tsx`, `Register.tsx`, `AdminProviders.tsx`, `App.tsx`), design notes, a `todo.md`, video assets, and a zipped server bundle. None of it is imported by `src/` and none of it runs. Notably it still contains `vapi.ts` — **do not mistake this for live code or use it as a reference for current behavior.** The real, current source is exclusively under `src/`. If you need a logo or diagram, check there first, but verify relevance before trusting anything else in that folder.

---

## Architecture Notes

- **ESM relative imports require explicit `.js` extensions**, even though every source file is `.ts` (e.g. `import { config } from "../lib/config.js"` inside `config.ts` itself doesn't exist, but every cross-file import does this). This is required by `"type": "module"` + `moduleResolution: "bundler"` + running via `tsx`/compiled `node`. Forgetting the `.js` suffix on a new relative import will fail at runtime even though `tsc` may not complain.
- **MCP session handling** (`src/index.ts`): a single Express app serves `/mcp` (POST/GET/DELETE). Each new `mcp-session-id` gets its own `StreamableHTTPServerTransport` and its own freshly constructed `McpServer` (via `createMcpServer()`), stored in an in-memory `Map<sessionId, transport>`. There is no shared server instance across sessions — tool registration runs once per session on first connect.
- **Adding a new MCP tool**: create a file under `src/tools/` exporting a zod schema (`xSchema`) and an async handler returning `Promise<string>` (a JSON-stringified payload), then register it in `createMcpServer()` in `index.ts` via `server.tool(name, description, xSchema.shape, handler)`. Update the tool count in the `/health` route and the startup banner if you add/remove tools.
- **Database persistence model** (`src/db/database.ts`): `sql.js` keeps the entire DB in memory; every `execute()` call triggers `persist()`, which does a full `db.export()` + `fs.writeFileSync` of the whole file. There's no WAL, no transactions, and no concurrency control — fine for demo/single-process use, but don't assume Postgres/`better-sqlite3` semantics (row-level locking, partial writes, etc.).
- **WhatsApp inbound replies are parsed with regex, not an LLM call.** `parsePrice()`, `parseAvailability()`, `parseDatetime()` in `index.ts` heuristically extract price/availability/datetime from a contractor's free-text WhatsApp reply and upsert into `handyman_quotes`. A reply is matched to the contractor's **most recent** open `session_id` (`ORDER BY received_at DESC LIMIT 1`) — if a contractor is outreached twice concurrently, the newer session wins.
- **Known inconsistency — Stripe currency:** `src/lib/stripe.ts`'s `createServiceFeeCheckout()` hardcodes `currency: "usd"` in the Checkout Session, while every other tool (`quote_job`, `get_handyman_profile`, `compare_handyman_prices`) reports prices in `"SGD"` and the docs/messaging describe a "$5 SGD platform fee". Be aware of this mismatch if you touch payment code — fixing it (e.g. to `"sgd"`) is a real, not cosmetic, change.
- **No automated test suite currently exists** in `src/` (no `test` script in `package.json`). `assets/mcp.test.ts` is part of the legacy dump above and is not wired into any runner.

---

## The 15 MCP Tools

| Category | Tool | Purpose |
|---|---|---|
| A — Memory | `get_saved_preferences` | Fetch user saved address, budget, preferred contractors from Mem0 |
| A — Memory | `update_saved_preferences` | Save/update user preferences in Mem0 |
| B — Discovery | `search_handymen` | Find contractors by service, location, budget |
| B — Discovery | `get_handyman_profile` | Full profile + 5 recent reviews + trust score |
| B — Discovery | `compare_handyman_prices` | Price comparison table across contractors |
| C — Quoting | `quote_job` | Estimated price range by service + complexity (static matrix, no DB lookup) |
| D — Outreach | `whatsapp_handyman` | WhatsApp one contractor for availability/price |
| D — Outreach | `whatsapp_multiple_handymen` | WhatsApp 1–5 contractors in parallel |
| E — Bids | `present_bid_results` | Show live bid table from DB by session_id |
| E — Bids | `accept_winning_bid` | Confirm winner, reject others, generate Stripe link |
| F — Booking | `book_job` | Finalise booking, generate Stripe checkout |
| F — Booking | `notify_arrival` | WhatsApp user when contractor is en route / at door |
| G — Registration | `register_provider` | Handyman self-registration |
| G — Registration | `submit_provider_review` | Submit star rating after job, recalculates average rating |
| G — Registration | `get_provider_reviews` | Fetch all reviews for a provider |

---

## Hackathon: Qwen Cloud Global Hackathon

**Deadline:** July 9, 2026
**Track:** Track 4 — Autopilot Agent
**Submission repo must be:** public, MIT licensed, with license visible in GitHub About section

### Remaining To-Do

- [ ] Deploy to Alibaba Cloud ECS
- [ ] Configure all `.env` vars on ECS server
- [ ] Point WhatsApp webhook to ECS public domain
- [ ] Commit architecture diagram to `assets/architecture.png`
- [ ] Record 3-minute demo video → upload to YouTube
- [ ] Submit at hackathon portal

### Alibaba Cloud Requirements
- Backend must run on Alibaba Cloud ECS
- `src/lib/qwen.ts` is the proof-of-Alibaba-Cloud-usage file — link this in the submission
- LLM must be Qwen Cloud (DashScope). Base URL: `https://dashscope.aliyuncs.com/compatible-mode/v1`, model: `qwen-max`

---

## Currency

- **Primary:** SGD — patterns: `SGD`, `S$`, `$`, `dollars`
- **Secondary:** RM / MYR — Malaysian contractors accepted
- `parsePrice()` in `src/index.ts` checks SGD patterns first
- All outgoing WhatsApp messages request quotes in SGD
- Stripe checkout currently charges in USD, not SGD — see Architecture Notes above

---

## Key Booking Flow

1. User describes job in chat
2. LLM → `get_saved_preferences` (fills address/budget from Mem0)
3. LLM → `search_handymen` (ranked contractor list)
4. LLM → `whatsapp_multiple_handymen` (2–5 contractors messaged simultaneously → returns `session_id`)
5. Contractor replies hit `POST /webhooks/whatsapp` → parsed into `handyman_quotes` table
6. LLM → `present_bid_results` (session_id) → live bid table shown to user
7. User picks winner → LLM → `accept_winning_bid` → Stripe link generated
8. User pays $5 platform fee → Stripe webhook → booking `confirmed`
9. Job day → `notify_arrival` → WhatsApp update to user

---

## Build & Run

```bash
npm install
npm run build       # tsc → dist/
npm start           # node dist/index.js
npm run dev         # tsx watch src/index.ts
npm run seed        # populate tukang.db with demo handymen + reviews (skips if already seeded)
npm run lint        # tsc --noEmit
```

Health check: `GET /health`
MCP endpoint: `POST /mcp`
WhatsApp webhook: `POST /webhooks/whatsapp`
Stripe webhook: `POST /webhooks/stripe`

---

## Hard Rules

- Do NOT reintroduce Vapi or any voice calling library
- Do NOT commit `.env` to git
- Do NOT use OpenAI or Anthropic as the LLM — must be Qwen Cloud for hackathon
- Do NOT rename MCP tools or change input schemas without updating all callers
- Do NOT switch from SQLite without rewriting `src/db/database.ts`
- Do NOT print or log full secret key values anywhere
- Do NOT treat anything under `assets/` as live/current code
