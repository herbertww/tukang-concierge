import { describe, it, expect, vi } from "vitest";

// ─── Mock DB ──────────────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  searchHandymen: vi.fn(async () => [
    {
      id: 1, name: "Ahmad Bin Razali", phone: "+6591234001", whatsappPhone: "+6591234001",
      services: '["plumbing","pipe_repair"]', areas: '["Tampines","Bedok"]',
      rateMin: "60.00", rateMax: "120.00", currency: "SGD",
      rating: "4.80", reviewCount: 47, acraRegistered: true, acraNumber: "SS0123456A",
      bio: "Licensed plumber", yearsExperience: 12, available: true, avatarUrl: null, createdAt: new Date(),
    },
    {
      id: 3, name: "Ravi Kumar", phone: "+6591234003", whatsappPhone: "+6591234003",
      services: '["aircon","aircon_servicing"]', areas: '["Tiong Bahru","Queenstown"]',
      rateMin: "50.00", rateMax: "250.00", currency: "SGD",
      rating: "4.70", reviewCount: 89, acraRegistered: true, acraNumber: "SS0345678C",
      bio: "Aircon specialist", yearsExperience: 10, available: true, avatarUrl: null, createdAt: new Date(),
    },
  ]),
  getHandymanById: vi.fn(async (id: number) => {
    if (id === 1) return {
      id: 1, name: "Ahmad Bin Razali", phone: "+6591234001", whatsappPhone: "+6591234001",
      services: '["plumbing"]', areas: '["Tampines"]',
      rateMin: "60.00", rateMax: "120.00", currency: "SGD",
      rating: "4.80", reviewCount: 47, acraRegistered: true, acraNumber: "SS0123456A",
      bio: "Licensed plumber", yearsExperience: 12, available: true, avatarUrl: null, createdAt: new Date(),
    };
    if (id === 3) return {
      id: 3, name: "Ravi Kumar", phone: "+6591234003", whatsappPhone: "+6591234003",
      services: '["aircon"]', areas: '["Tiong Bahru"]',
      rateMin: "50.00", rateMax: "250.00", currency: "SGD",
      rating: "4.70", reviewCount: 89, acraRegistered: true, acraNumber: "SS0345678C",
      bio: "Aircon specialist", yearsExperience: 10, available: true, avatarUrl: null, createdAt: new Date(),
    };
    if (id === 5) return {
      id: 5, name: "Tan Wei Ming", phone: "+6591234005", whatsappPhone: "+6591234005",
      services: '["carpentry"]', areas: '["Jurong"]',
      rateMin: "70.00", rateMax: "200.00", currency: "SGD",
      rating: "4.60", reviewCount: 33, acraRegistered: false, acraNumber: null,
      bio: "Carpenter", yearsExperience: 7, available: true, avatarUrl: null, createdAt: new Date(),
    };
    return null;
  }),
  getHandymanReviews: vi.fn(async () => [
    { id: 1, handymanId: 1, rating: 5, comment: "Great work!", reviewerName: "Priya T.", createdAt: new Date() },
  ]),
  getAllHandymen: vi.fn(async () => []),
  createBooking: vi.fn(async () => ({ insertId: 42 })),
  saveCallResult: vi.fn(async () => {}),
  getCallResultsBySession: vi.fn(async () => [
    {
      id: 1, sessionId: "test-session", handymanId: 1, handymanName: "Ahmad Bin Razali",
      callStatus: "completed", available: true, quotedPrice: null,
      availableDate: null, availableTime: null,
      transcript: null, vapiCallId: null, responseTimeSec: 0, createdAt: new Date(),
    },
    {
      id: 2, sessionId: "test-session", handymanId: 3, handymanName: "Ravi Kumar",
      callStatus: "completed", available: true, quotedPrice: null,
      availableDate: null, availableTime: null,
      transcript: null, vapiCallId: null, responseTimeSec: 0, createdAt: new Date(),
    },
  ]),
  updateBookingStripeStatus: vi.fn(async () => {}),
  getBookingByStripeSession: vi.fn(async () => null),
  logWhatsAppMessage: vi.fn(async () => {}),
}));

vi.mock("./lib/mem0", () => ({
  getMemories: vi.fn(async () => [
    { id: "m1", memory: "My home address is: 123 Tampines Ave 1, #05-01", user_id: "user1", created_at: "", updated_at: "" },
    { id: "m2", memory: "My budget for handyman services is: $150", user_id: "user1", created_at: "", updated_at: "" },
  ]),
  addMemory: vi.fn(async () => true),
  searchMemories: vi.fn(async () => []),
  parsePreferences: vi.fn(() => ({
    address: "My home address is: 123 Tampines Ave 1, #05-01",
    budget: "150",
  })),
}));

vi.mock("./lib/whatsapp", () => ({
  requestQuoteViaWhatsApp: vi.fn(async (opts: { handymanId: number; handymanName: string }) => ({
    handymanId: opts.handymanId,
    handymanName: opts.handymanName,
    messageSent: true,
    waMessageId: "simulated_wa_" + opts.handymanId,
    simulated: true,
    messageBody: `Hello ${opts.handymanName}, please quote for the job.`,
  })),
  requestQuotesFromMultiple: vi.fn(async (handymen: Array<{ id: number; name: string }>) =>
    handymen.map((h) => ({
      handymanId: h.id,
      handymanName: h.name,
      messageSent: true,
      waMessageId: "simulated_wa_" + h.id,
      simulated: true,
      messageBody: `Hello ${h.name}, please quote for the job.`,
    }))
  ),
  sendAcceptanceNotice: vi.fn(async () => "simulated_wa_accept"),
  sendRejectionNotice: vi.fn(async () => "simulated_wa_reject"),
  sendArrivalAlert: vi.fn(async () => "simulated_wa_arrival"),
}));

vi.mock("./lib/stripe", () => ({
  createPlatformFeeCheckout: vi.fn(async () => ({
    sessionId: "cs_sim_test123",
    url: "https://tukang.manus.space/payment/success?session_id=cs_sim_test123&simulated=true",
    simulated: true,
  })),
  constructWebhookEvent: vi.fn(() => null),
}));

// ─── Helper ───────────────────────────────────────────────────────────────────
import { createMcpServer } from "./mcp";

type ToolRegistry = Record<string, { handler: (args: unknown) => Promise<{ content: Array<{ text: string }> }> }>;

function getTools() {
  const server = createMcpServer();
  return (server as unknown as { _registeredTools: ToolRegistry })._registeredTools;
}

async function callTool(name: string, args: unknown) {
  const tools = getTools();
  const tool = tools[name];
  if (!tool) throw new Error(`Tool "${name}" not found`);
  return tool.handler(args);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Tukang MCP Server — Tool Registry", () => {
  it("registers exactly 12 tools", () => {
    const tools = getTools();
    expect(Object.keys(tools).length).toBe(12);
  });

  it("registers all expected tool names (WhatsApp-only, no Vapi)", () => {
    const tools = getTools();
    const expected = [
      "get_saved_preferences", "update_saved_preferences",
      "search_handymen", "get_handyman_profile", "compare_handyman_prices",
      "quote_job",
      "contact_handyman", "contact_multiple_handymen",
      "present_bid_results", "accept_winning_bid",
      "book_job", "notify_arrival",
    ];
    for (const name of expected) {
      expect(Object.keys(tools), `Tool "${name}" should be registered`).toContain(name);
    }
  });

  it("does NOT register any Vapi tools", () => {
    const tools = getTools();
    expect(Object.keys(tools)).not.toContain("call_handyman_proxy");
    expect(Object.keys(tools)).not.toContain("call_multiple_handymen_parallel");
  });
});

describe("Tool: quote_job", () => {
  it("returns correct estimate for plumbing/simple", async () => {
    const result = await callTool("quote_job", { service_type: "plumbing", complexity: "simple" });
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.estimate.min_price).toBe(60);
    expect(parsed.estimate.max_price).toBe(100);
    expect(parsed.estimate.duration).toBe("1–2 hours");
    expect(parsed.platform_fee).toContain("$5");
  });

  it("returns correct estimate for aircon/complex", async () => {
    const result = await callTool("quote_job", { service_type: "aircon", complexity: "complex" });
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.estimate.min_price).toBe(200);
    expect(parsed.estimate.max_price).toBe(500);
  });

  it("falls back to general for unknown service", async () => {
    const result = await callTool("quote_job", { service_type: "roof_repair", complexity: "moderate" });
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.estimate.min_price).toBe(80);
  });
});

describe("Tool: get_saved_preferences", () => {
  it("returns parsed preferences from Mem0", async () => {
    const result = await callTool("get_saved_preferences", { user_id: "user1" });
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.user_id).toBe("user1");
    expect(parsed.count).toBe(2);
    expect(parsed.preferences).toBeDefined();
  });
});

describe("Tool: update_saved_preferences", () => {
  it("saves preferences and returns success", async () => {
    const result = await callTool("update_saved_preferences", {
      user_id: "user1",
      preferences: { address: "123 Tampines Ave", budget: "$100-$200" },
    });
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.success).toBe(true);
  });
});

describe("Tool: search_handymen", () => {
  it("returns handymen sorted by rating", async () => {
    const result = await callTool("search_handymen", { service_type: "plumbing", area: "Tampines" });
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.found).toBeGreaterThan(0);
    expect(parsed.handymen[0]).toHaveProperty("id");
    expect(parsed.handymen[0]).toHaveProperty("rating");
  });
});

describe("Tool: get_handyman_profile", () => {
  it("returns full profile with trust score", async () => {
    const result = await callTool("get_handyman_profile", { handyman_id: 1 });
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.name).toBe("Ahmad Bin Razali");
    expect(parsed.trust_score).toBeDefined();
    expect(parsed.recent_reviews).toHaveLength(1);
  });

  it("returns not found for invalid ID", async () => {
    const result = await callTool("get_handyman_profile", { handyman_id: 999 });
    expect(result.content[0]!.text).toContain("not found");
  });
});

describe("Tool: contact_handyman (WhatsApp, single)", () => {
  it("sends WhatsApp message and returns session_id", async () => {
    const result = await callTool("contact_handyman", {
      handyman_id: 1,
      service_type: "plumbing",
      area: "Tampines",
      scheduled_date: "Saturday",
    });
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.message_sent).toBe(true);
    expect(parsed.session_id).toBeDefined();
    expect(parsed.note).toContain("ZERO phone calls");
    expect(parsed.simulated).toBe(true);
  });
});

describe("Tool: contact_multiple_handymen (WhatsApp, parallel)", () => {
  it("sends messages to 3 handymen in parallel", async () => {
    const result = await callTool("contact_multiple_handymen", {
      handyman_ids: [1, 3, 5],
      service_type: "plumbing",
      area: "Tampines",
      scheduled_date: "Saturday",
    });
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.total_contacted).toBe(3);
    expect(parsed.messages_sent).toBe(3);
    expect(parsed.session_id).toBeDefined();
    expect(parsed.note).toContain("ZERO phone calls");
  });
});

describe("Tool: present_bid_results", () => {
  it("shows awaiting-reply state when no quotes provided", async () => {
    const result = await callTool("present_bid_results", { session_id: "test-session" });
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.total_contacted).toBe(2);
    expect(parsed.awaiting_reply).toBe(2);
  });

  it("ranks quotes cheapest first when quotes provided", async () => {
    const result = await callTool("present_bid_results", {
      session_id: "test-session",
      quotes: [
        { handyman_id: 1, quoted_price: 120, available_date: "Saturday" },
        { handyman_id: 3, quoted_price: 80, available_date: "Sunday" },
      ],
    });
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.quotes_received).toBe(2);
    expect(parsed.bid_table[0].price).toBe("SGD $80");
    expect(parsed.bid_table[0].badge).toContain("CHEAPEST");
    expect(parsed.winner.handyman_id).toBe(3);
  });
});

describe("Tool: notify_arrival", () => {
  it("sends en_route alert", async () => {
    const result = await callTool("notify_arrival", {
      customer_phone: "+6591234567", handyman_name: "Ahmad", status: "en_route", eta: "15 minutes",
    });
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.status).toBe("en_route");
    expect(parsed.sent).toBe(true);
  });

  it("sends at_door alert", async () => {
    const result = await callTool("notify_arrival", {
      customer_phone: "+6591234567", handyman_name: "Ahmad", status: "at_door",
    });
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.status).toBe("at_door");
  });

  it("sends delayed alert", async () => {
    const result = await callTool("notify_arrival", {
      customer_phone: "+6591234567", handyman_name: "Ahmad", status: "delayed", eta: "30 minutes",
    });
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.status).toBe("delayed");
  });
});

describe("Tool: book_job", () => {
  it("creates booking and returns Stripe checkout URL", async () => {
    const result = await callTool("book_job", {
      user_id: "user1", handyman_id: 1, service_type: "plumbing",
      scheduled_date: "Saturday", address: "123 Tampines Ave 1", agreed_price: 80,
    });
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.booking_confirmed).toBe(true);
    expect(parsed.platform_fee.checkout_url).toContain("http");
    expect(parsed.platform_fee.amount).toBe("SGD $5.00");
    expect(parsed.next_steps).toHaveLength(4);
  });
});

describe("Tool: accept_winning_bid", () => {
  it("sends acceptance + rejections + Stripe link", async () => {
    const result = await callTool("accept_winning_bid", {
      session_id: "test-session", winning_handyman_id: 1,
      service_type: "plumbing", address: "123 Tampines Ave 1",
      scheduled_date: "Saturday", agreed_price: 80, user_id: "user1",
    });
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.winner.name).toBe("Ahmad Bin Razali");
    expect(parsed.acceptance_sent).toBe(true);
    expect(parsed.platform_fee.checkout_url).toContain("http");
    expect(parsed.platform_fee.amount).toBe("SGD $5.00");
    // Runner-up (Ravi Kumar) should get rejection
    expect(parsed.rejections_sent).toHaveLength(1);
  });
});
