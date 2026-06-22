# 🔨 Tukang MCP Server

**Chat-native handyman booking — zero context switching, zero phone calls.**

Tukang is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that lets you book handymen entirely inside Claude (or any MCP-compliant LLM) without ever leaving the chat or making a single phone call.

---

## ✨ Key Features

| Feature | Description |
|---|---|
| **Zero Context Switching** | Everything happens in chat — no app switching |
| **Introvert Mode** | Vapi calls handymen *on your behalf* — you make ZERO phone calls |
| **Parallel Bid Comparison** | Vapi calls 3–5 handymen simultaneously, returns cheapest first |
| **WhatsApp Acceptance** | Winning handyman confirms via WhatsApp; you get instant notification |
| **Stripe Service Fee** | $5 platform fee via Stripe (separate from handyman's rate) |
| **Mem0 Memory** | Saves your address, budget, and preferences across sessions |

---

## 🏗️ Architecture

```
Claude / MCP Client
       │
       ▼
Tukang MCP Server (HTTP :8000)
       │
       ├── SQLite (handymen, bookings, call results)
       ├── Mem0   (user preferences & memory)
       ├── Vapi   (outbound proxy calling)
       ├── WhatsApp Business API (notifications)
       └── Stripe (payment processing)
```

---

## 🛠️ 12 MCP Tools

### Category A — User Context & Memory
| Tool | Description |
|---|---|
| `get_saved_preferences` | Retrieve address, budget, preferred handyman from Mem0 |
| `update_saved_preferences` | Save/update preferences for future auto-fill |

### Category B — Discovery & Search
| Tool | Description |
|---|---|
| `search_handymen` | Find handymen by service, location, budget (Mem0 auto-fill) |
| `get_handyman_profile` | Full profile + reviews + ACRA status + trust score |
| `compare_handyman_prices` | Price comparison table with best-value recommendation |

### Category C — Quoting
| Tool | Description |
|---|---|
| `quote_job` | Estimated price range, duration, inclusions by complexity |

### Category D — Introvert Mode (Vapi Proxy Calling)
| Tool | Description |
|---|---|
| `call_handyman_proxy` | Vapi calls 1 handyman on your behalf |
| `call_multiple_handymen_parallel` | Vapi calls 3–5 handymen in parallel (Promise.all) |

### Category E — Bid Results
| Tool | Description |
|---|---|
| `present_bid_results` | Chat-friendly ranked table, cheapest highlighted |
| `accept_winning_bid` | Accept cheapest → WhatsApp notification + Stripe link |

### Category F — Booking & Payment
| Tool | Description |
|---|---|
| `book_job` | Finalise booking + Stripe $5 fee + Vapi confirmation |
| `notify_arrival` | WhatsApp alert when handyman is en route / at door / delayed |

---

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone <repo-url>
cd tukang
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your API keys
```

Required keys:
- **MEM0_API_KEY** — [app.mem0.ai](https://app.mem0.ai)
- **VAPI_API_KEY** + **VAPI_PHONE_NUMBER_ID** — [dashboard.vapi.ai](https://dashboard.vapi.ai)
- **WHATSAPP_TOKEN** + **WHATSAPP_PHONE_NUMBER_ID** — [Meta for Developers](https://developers.facebook.com/docs/whatsapp)
- **STRIPE_SECRET_KEY** + **STRIPE_SERVICE_FEE_PRICE_ID** — [dashboard.stripe.com](https://dashboard.stripe.com)

> **Dev mode**: The server runs without API keys using simulated responses for Vapi calls and Stripe links. Perfect for local testing.

### 3. Seed the Database

```bash
npm run seed
```

This populates 8 realistic Singaporean handymen with reviews.

### 4. Start the Server

```bash
# Development (hot reload)
npm run dev

# Production
npm run build && npm start
```

Server starts on `http://localhost:8000`.

---

## 🔌 Connecting to Claude

Add to your Claude MCP configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "tukang": {
      "url": "http://localhost:8000/mcp",
      "transport": "http"
    }
  }
}
```

Or for remote deployment:

```json
{
  "mcpServers": {
    "tukang": {
      "url": "https://your-server.com/mcp",
      "transport": "http"
    }
  }
}
```

---

## 💬 Example Chat Flow

```
You: I need an aircon repair in Tampines, budget $150

Claude: [calls search_handymen] Found 3 handymen for ac_repair in Tampines.
        Shall I call them all in parallel to get quotes?

You: Yes please

Claude: [calls call_multiple_handymen_parallel]
        ✅ Vapi called 3 handymen parallel on YOUR BEHALF:
        
        📞 TOTAL CALLED: 3 (Ahmad, John, Ravi)
        ⏱️ Time: 18 seconds (parallel)
        
        👍 RESPONSIVE + AVAILABLE: 2
        
        🏆 TOP 2 (CHEAPEST FIRST):
        | Rank | Name  | Price | Time     | Rating | Response |
        |------|-------|-------|----------|--------|----------|
        | 1⭐  | Ahmad | $75   | Sat 11AM | 4.8⭐  | 8 sec    | 🏆 CHEAPEST
        | 2    | John  | $80   | Sat 9AM  | 5.0⭐  | 12 sec   |
        
        💡 You made ZERO calls. Vapi did all calling for you.
        💬 Reply "Book Ahmad" to accept cheapest.

You: Book Ahmad

Claude: [calls accept_winning_bid]
        ✅ Ahmad has been notified via WhatsApp!
        💳 Pay the $5 platform fee: https://checkout.stripe.com/...
        💰 Pay Ahmad $75 directly after the job.
```

---

## 🔧 API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/mcp` | POST | MCP protocol endpoint |
| `/mcp` | GET | SSE streaming endpoint |
| `/mcp` | DELETE | Session cleanup |
| `/health` | GET | Health check |
| `/webhooks/stripe` | POST | Stripe payment webhook |
| `/payment/success` | GET | Payment success page |
| `/payment/cancel` | GET | Payment cancel page |

---

## 🗄️ Database Schema

The SQLite database (`tukang.db`) contains:

- **handymen** — profiles, ratings, pricing, ACRA status
- **reviews** — per-handyman reviews with ratings and comments
- **bookings** — booking records with status and payment tracking
- **call_results** — Vapi call outcomes (transcription, price, availability)
- **whatsapp_messages** — WhatsApp message log

---

## 🏗️ Project Structure

```
tukang/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── lib/
│   │   ├── config.ts         # Environment configuration
│   │   ├── mem0.ts           # Mem0 memory layer
│   │   ├── vapi.ts           # Vapi calling client
│   │   ├── whatsapp.ts       # WhatsApp Business API
│   │   └── stripe.ts         # Stripe payment integration
│   ├── db/
│   │   ├── database.ts       # SQLite layer (sql.js)
│   │   └── seed.ts           # Database seeder
│   └── tools/
│       ├── preferences.ts    # Tools 1–2: Memory
│       ├── discovery.ts      # Tools 3–5: Search
│       ├── quoting.ts        # Tool 6: Quotes
│       ├── calling.ts        # Tools 7–8: Vapi calling
│       ├── bids.ts           # Tools 9–10: Bid results
│       └── booking.ts        # Tools 11–12: Booking
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🔐 Security Notes

- All API keys are loaded from environment variables — never hardcoded
- Stripe webhooks are verified with signature validation
- WhatsApp webhook uses a verify token
- SQLite database is local — no external database credentials needed

---

## 📦 Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript / Node.js |
| MCP Framework | `@modelcontextprotocol/sdk` |
| Transport | HTTP Streamable (port 8000) |
| Database | SQLite via `sql.js` (pure JS) |
| Memory | Mem0 REST API |
| Voice Calling | Vapi.ai outbound calls |
| Messaging | WhatsApp Business Cloud API |
| Payments | Stripe Checkout |
| Validation | Zod |

---

*Built with ❤️ for introverts who just want their aircon fixed.*
