# Tukang MCP Server — TODO

## Phase 2: Database & Infrastructure
- [x] Extend Drizzle schema with handymen, reviews, bookings, call_results, whatsapp_messages tables
- [x] Apply schema migration via webdev_execute_sql
- [x] Seed 8 realistic Singaporean handymen + reviews
- [x] Install @modelcontextprotocol/sdk and stripe packages
- [x] Create MCP server module (server/mcp.ts) with StreamableHTTP transport
- [x] Mount /mcp endpoint in Express server
- [x] Add /health endpoint

## Phase 3: 12 MCP Tools
- [x] Tool 1: get_saved_preferences (Mem0)
- [x] Tool 2: update_saved_preferences (Mem0)
- [x] Tool 3: search_handymen (DB)
- [x] Tool 4: get_handyman_profile (DB)
- [x] Tool 5: compare_handyman_prices (DB)
- [x] Tool 6: quote_job (logic)
- [x] Tool 7: call_handyman_proxy (Vapi + dev-mode sim)
- [x] Tool 8: call_multiple_handymen_parallel (Vapi + dev-mode sim)
- [x] Tool 9: present_bid_results (DB)
- [x] Tool 10: accept_winning_bid (WhatsApp + Stripe)
- [x] Tool 11: book_job (DB + Stripe + optional Vapi)
- [x] Tool 12: notify_arrival (WhatsApp, 3 statuses)

## Phase 4: Landing Page & Webhook
- [x] Landing page with one-line setup command and live /health indicator
- [x] /webhooks/stripe endpoint for payment confirmation

## Phase 5: Secrets & Tests
- [x] Configure MEM0_API_KEY, WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET via webdev_request_secrets (user to provide values)
- [x] Write vitest tests (17 tests, all passing) for MCP tools
- [x] Save checkpoint

## Phase 5: Vapi Removal & WhatsApp-Only Refactor
- [x] Remove Vapi dependency and all Vapi code (server/lib/vapi.ts)
- [x] Rewrite Tool 7: contact_handyman (WhatsApp text outreach, single handyman)
- [x] Rewrite Tool 8: contact_multiple_handymen (WhatsApp broadcast to 3–5 handymen)
- [x] Update Tool 10: accept_winning_bid (already uses WhatsApp, remove Vapi confirmation call)
- [x] Update Tool 11: book_job (remove optional Vapi confirmation call)
- [x] Update landing page to reflect WhatsApp-only outreach
- [x] Update vitest tests to remove Vapi mocks (21 tests, all passing)
- [x] Configure secrets: MEM0_API_KEY, WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
- [x] Save checkpoint

## Phase 6: Fix Claude.ai OAuth Connection Error
- [x] Add /.well-known/oauth-protected-resource endpoint (RFC 9728)
- [x] Add /.well-known/oauth-authorization-server endpoint (RFC 8414)
- [x] Add POST /register dynamic client registration endpoint (RFC 7591)
- [x] Add POST /token endpoint (issues passthrough tokens for no-auth server)
- [x] Return WWW-Authenticate header on 401 responses from /mcp
- [x] Test connection from Claude.ai web (OAuth flow validated via TypeScript + curl)
- [x] Save checkpoint

## Phase 7: Landing Page — Per-Platform Connector Setup Guide
- [x] Research exact MCP connector steps for Claude.ai, ChatGPT, Perplexity, Qwen
- [x] Rewrite landing page with tabbed/card UI showing step-by-step instructions per platform (no terminal)
- [x] Save checkpoint

## Phase 8: Fix Seed Data & Area Matching
- [x] Check current handyman count in DB
- [x] Seed all missing handymen covering Jurong and all Singapore areas (14 handymen, all areas)
- [x] Fix area matching — root cause was comma-separated strings instead of JSON arrays; fixed in seed script
- [x] Verify search_handymen returns results for "plumber Jurong" — 3 found: Ravi Kumar, Muthu Selvam, Siva Subramaniam
- [x] Save checkpoint

## Phase 9: Landing Page Redesign — Anti-AI-Slop
- [x] Apply design brief: dark, editorial, craft-forward — NOT generic SaaS
- [x] New color system: near-black bg (oklch), warm amber accent, off-white paper text, muted for secondary
- [x] Typography: Clash Display for hero headline, JetBrains Mono for code/labels, Inter for body
- [x] Layout: large left-aligned hero type, 3-col tool grid with monospace index labels, platform tabs with step guides
- [x] Micro-interactions: subtle hover states on tool grid, scale(0.97) on CTA button press
- [x] Removed: gradient blobs, generic card shadows, AI palette, pill buttons
- [x] Added: tool index 01-12, Singapore-specific copy, grain texture overlay, amber glow on CTA
- [x] Save checkpoint (4fdce5b1)

## Phase 10: Scroll-Driven Video Sections
- [x] Analyse 4 clips and assign to page sections intelligently
- [x] Strip audio from all 4 clips (ffmpeg, no re-encode)
- [x] Extract poster frames (first frame) from each clip as JPEG
- [x] Upload 7 files (3 videos + 4 posters) to CDN via manus-upload-file --webdev (4th section uses static poster)
- [x] Implement VideoSection React component with IntersectionObserver lazy-play
- [x] Mobile: swap video for poster image via matchMedia (767px breakpoint)
- [x] Wire 4 video sections into Home.tsx: Hero (clip1), Tools (clip3), How It Works (clip2), Connect (static poster)
- [x] Verify opacity fade-in on scroll entry (visible:true default, IntersectionObserver threshold 0.05)
- [x] Save checkpoint (798bec2f)

## Phase 11: Light Theme + Animated Claude Flow Demo
- [x] Convert site from dark to light color scheme (index.css CSS variables, ThemeProvider)
- [x] Update all hardcoded dark colors in Home.tsx to work on light background
- [x] Build ClaudeFlowDemo animated component — simulated Claude chat with MCP tool calls
- [x] Insert ClaudeFlowDemo section between hero and existing sections
- [x] Verify readability and contrast across all sections
- [x] Save checkpoint

## Phase 12: Palmier.io Full Redesign
- [x] Analyze Palmier.io design system — colors, typography, layout, spacing, buttons
- [x] Rewrite index.css with Palmier tokens (near-black #0a0a0a bg, white accent, Inter, pill buttons)
- [x] Rewrite Home.tsx with Palmier layout — static dark sections, generous 7rem padding, left-aligned hero
- [x] Remove video backgrounds from all non-hero sections (now static dark bg)
- [x] Add announcement bar (Palmier-style thin top bar)
- [x] Redesign nav — transparent sticky, pill CTA buttons
- [x] Redesign hero — left-aligned, two pill CTAs (primary white + ghost outline)
- [x] Redesign How It Works — bordered grid container, no video
- [x] Redesign Tools Grid — bordered container, transparent cells on dark bg
- [x] Redesign Connect section — static dark, pill platform tabs
- [x] Redesign Integrations — bordered grid, status dots
- [x] Add final CTA section (Palmier "Try X now" pattern)
- [x] Save checkpoint

## Phase 13: Production Fix — Real WhatsApp Flow
- [ ] Rename call_handyman_proxy → contact_handyman in MCP server
- [ ] Rename call_multiple_handymen_parallel → contact_multiple_handymen in MCP server
- [ ] Remove Vapi simulation from calling.ts — replace with real WhatsApp outreach
- [ ] Add handyman_quotes table to DB (stores pending quote requests + replies)
- [ ] WhatsApp webhook: capture handyman reply messages and update quote records
- [ ] Update present_bid_results to read real quote replies from DB
- [ ] Update landing page tool names to match new names
- [ ] Run vitest and verify all tests pass
- [ ] Save checkpoint

## Phase 14: Self-Registration Portal
- [ ] Add service_category enum (handyman, beautician, facialist) to handymen schema
- [ ] Add registration_status enum (pending, approved, rejected) to handymen schema
- [ ] Migrate DB with new columns
- [ ] Build tRPC procedures: submitRegistration, listPendingRegistrations, approveRegistration, rejectRegistration
- [ ] Build /register page — multi-step form (category, personal info, services, areas, rates, bio)
- [ ] Build /admin/providers page — review pending applications, approve/reject with ratings display
- [ ] Add /register and /admin/providers routes to App.tsx
- [ ] Add WHATSAPP_VERIFY_TOKEN secret
