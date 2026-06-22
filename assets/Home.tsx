import { useState, useEffect, useRef, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type HealthStatus = {
  status: string;
  tools: number;
  integrations: { mem0: boolean; whatsapp: boolean; stripe: boolean };
};

type Platform = "claude-ai" | "perplexity" | "claude-desktop" | "qwen";

// ─── CDN assets ───────────────────────────────────────────────────────────────

const ASSETS = {
  video1:  "/manus-storage/dreamina-2026-06-14-9866-Aconfidentmanreclinesinaluxurywhi_720cca05.mp4",
  poster1: "/manus-storage/poster-dreamina-2026-06-14-9866-Aconfidentmanre_458feff3.jpg",
  video2:  "/manus-storage/dreamina-2026-06-14-9139-Tukangisamcptoo_c3f49224.mp4",
  poster2: "/manus-storage/poster-dreamina-2026-06-14-9139-Tukangisamcptoo_8624729e.jpg",
  video3:  "/manus-storage/video-section3-new_5c1beb4b.mp4",
  poster3: "/manus-storage/poster-section3-new_83f90219.jpg",
  video4:  "/manus-storage/dreamina-2026-06-14-9554-Tukangisamcptoo_36e0d26a.mp4",
  poster4: "/manus-storage/poster-dreamina-2026-06-14-9554-Tukangisamcptoo_689567d9.jpg",
};

// ─── Data ─────────────────────────────────────────────────────────────────────

const MCP_URL = "https://tukangmcp-mk92pgzc.manus.space/mcp";

const TOOLS: { index: string; name: string; desc: string; category: string }[] = [
  { index: "01", name: "get_saved_preferences",       category: "Memory",    desc: "Recall your address, budget, and preferred handymen" },
  { index: "02", name: "update_saved_preferences",    category: "Memory",    desc: "Save new preferences for future sessions" },
  { index: "03", name: "search_handymen",             category: "Discovery", desc: "Find handymen by service type, area, and budget" },
  { index: "04", name: "get_handyman_profile",        category: "Discovery", desc: "Full profile, reviews, and availability" },
  { index: "05", name: "compare_handyman_prices",     category: "Discovery", desc: "Side-by-side rate comparison across providers" },
  { index: "06", name: "quote_job",                   category: "Quoting",   desc: "Instant price range, duration, and inclusions" },
  { index: "07", name: "contact_handyman",            category: "Introvert", desc: "WhatsApp a handyman on your behalf — no call needed" },
  { index: "08", name: "contact_multiple_handymen",   category: "Introvert", desc: "Broadcast to 3–5 handymen simultaneously" },
  { index: "09", name: "present_bid_results",         category: "Bids",      desc: "Compare responses and surface the best offer" },
  { index: "10", name: "accept_winning_bid",          category: "Bids",      desc: "Accept winner, reject runners-up, get payment link" },
  { index: "11", name: "book_job",                    category: "Booking",   desc: "Finalise booking and generate $5 platform fee link" },
  { index: "12", name: "notify_arrival",              category: "Booking",   desc: "Send en-route, at-door, or delayed WhatsApp alerts" },
];

const CATEGORY_COLORS: Record<string, string> = {
  Memory:    "#3b82f6",
  Discovery: "#10b981",
  Quoting:   "#8b5cf6",
  Introvert: "#f59e0b",
  Bids:      "#ef4444",
  Booking:   "#06b6d4",
};

const PLATFORMS: { id: Platform; label: string; badge: string }[] = [
  { id: "claude-ai",      label: "Claude.ai",      badge: "No terminal" },
  { id: "perplexity",     label: "Perplexity",     badge: "Pro plan" },
  { id: "claude-desktop", label: "Claude Desktop", badge: "Config file" },
  { id: "qwen",           label: "Qwen",           badge: "Config file" },
];

type StepItem = { step: string; detail: React.ReactNode };

const PLATFORM_STEPS: Record<Platform, StepItem[]> = {
  "claude-ai": [
    { step: "Open Claude.ai",            detail: <>Go to <a href="https://claude.ai" target="_blank" rel="noopener noreferrer" style={{ color: "var(--amber)", textDecoration: "underline" }}>claude.ai</a> and sign in.</> },
    { step: "Settings → Integrations",   detail: "Click your profile picture (top-right) → Settings → Integrations." },
    { step: "Add integration",           detail: "Click 'Add integration' and paste the MCP URL into the Integration URL field." },
    { step: "Authorise",                 detail: "Claude runs a quick OAuth handshake — click through any prompt." },
    { step: "Start prompting",           detail: <><em>"Book a plumber for Saturday in Jurong"</em> and you're live.</> },
  ],
  "perplexity": [
    { step: "Open Perplexity",           detail: <>Go to <a href="https://perplexity.ai" target="_blank" rel="noopener noreferrer" style={{ color: "var(--amber)", textDecoration: "underline" }}>perplexity.ai</a> with a Pro account.</> },
    { step: "Account → Connectors",      detail: "Click your profile icon → Account settings → Connectors in the left sidebar." },
    { step: "Add custom connector",      detail: "Click + Custom connector (top-right) → select Remote." },
    { step: "Fill in the fields",        detail: <>Name: <strong>Tukang</strong> · Transport: <strong>Streamable HTTP</strong> · Auth: <strong>None</strong></> },
    { step: "Paste the MCP URL",         detail: "Paste the URL below, check the acknowledgement box, and click Add." },
  ],
  "claude-desktop": [
    { step: "Install Claude Desktop",    detail: <>Download from <a href="https://claude.ai/download" target="_blank" rel="noopener noreferrer" style={{ color: "var(--amber)", textDecoration: "underline" }}>claude.ai/download</a> if you haven't already.</> },
    { step: "Open config file",          detail: "Settings → Developer → Edit Config. Opens ~/.claude/claude_desktop_config.json." },
    { step: "Add the server block",      detail: "Paste the JSON config shown below into the mcpServers object." },
    { step: "Save and restart",          detail: "Save the file and fully quit + reopen Claude Desktop." },
    { step: "Verify connection",         detail: "Look for the 🔨 hammer icon in the toolbar — Tukang is connected." },
  ],
  "qwen": [
    { step: "Open Qwen Desktop",         detail: "Open the Qwen Desktop app on your computer." },
    { step: "Settings → MCP Servers",    detail: "Go to Settings → Tools → MCP Servers." },
    { step: "Add HTTP server",           detail: "Click Add Server, choose HTTP type, paste the MCP URL." },
    { step: "Save and reload",           detail: "Save and restart the app to activate the connection." },
    { step: "Start prompting",           detail: <><em>"Find a plumber in Jurong"</em> to test the connection.</> },
  ],
};

const PLATFORM_CONFIG: Record<Platform, string> = {
  "claude-ai":      MCP_URL,
  "perplexity":     MCP_URL,
  "claude-desktop": `{
  "mcpServers": {
    "tukang": {
      "type": "http",
      "url": "${MCP_URL}"
    }
  }
}`,
  "qwen": MCP_URL,
};

// ─── Claude Flow Demo ─────────────────────────────────────────────────────────

type FlowStep =
  | { kind: "user"; text: string }
  | { kind: "thinking"; text: string }
  | { kind: "tool"; name: string; input: string; output: string }
  | { kind: "assistant"; text: string };

const FLOW_SCRIPT: FlowStep[] = [
  { kind: "user",      text: "Book me a plumber in Tampines for Saturday afternoon" },
  { kind: "thinking",  text: "Searching for available plumbers in Tampines..." },
  { kind: "tool",      name: "search_handymen",
    input:  '{ "service": "plumber", "area": "Tampines" }',
    output: "Found 3: Ahmad Fauzi ★4.8 $80/hr · Ravi Kumar ★4.6 $65/hr · Muthu Selvam ★4.5 $70/hr" },
  { kind: "thinking",  text: "Contacting top 3 for Saturday quotes..." },
  { kind: "tool",      name: "contact_multiple_handymen",
    input:  '{ "handyman_ids": [1, 2, 3], "message": "Quote for plumbing, Tampines, Sat 2pm" }',
    output: "WhatsApp sent to 3 handymen. Awaiting replies..." },
  { kind: "assistant", text: "I've WhatsApp'd 3 plumbers on your behalf. Checking for replies now..." },
  { kind: "tool",      name: "present_bid_results",
    input:  '{ "job_id": "JOB-2841" }',
    output: "Ravi Kumar: $95 for 2hrs ✓ · Ahmad Fauzi: $120 for 2hrs · Muthu: no reply" },
  { kind: "thinking",  text: "Ravi is cheapest and highly rated. Recommending him." },
  { kind: "assistant", text: "Ravi Kumar replied fastest at **$95 for 2 hours** (★4.6, 47 jobs). That's $25 cheaper than Ahmad. Shall I book Ravi?" },
  { kind: "user",      text: "Yes, book Ravi." },
  { kind: "tool",      name: "book_job",
    input:  '{ "handyman_id": 2, "job_id": "JOB-2841" }',
    output: "Booking confirmed. $5 platform fee: tukangmcp.manus.space/pay/JOB-2841" },
  { kind: "assistant", text: "Done! Ravi is booked for Saturday 2pm. Pay the $5 platform fee to confirm:\n→ tukangmcp.manus.space/pay/JOB-2841\n\nRavi will WhatsApp you when he's on his way." },
];

const CHAR_DELAY = 28;
const STEP_PAUSE = 900;
const RESTART_DELAY = 4000;

function ClaudeFlowDemo() {
  type RenderedStep = FlowStep & { id: number; textSoFar?: string; expanded?: boolean };
  const [steps, setSteps] = useState<RenderedStep[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runningRef = useRef(true);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    runningRef.current = true;

    async function runScript() {
      while (runningRef.current) {
        setSteps([]);
        setIsTyping(false);

        for (let si = 0; si < FLOW_SCRIPT.length; si++) {
          if (!runningRef.current) return;
          const step = FLOW_SCRIPT[si];
          const id = si;

          await new Promise<void>((resolve) => { timerRef.current = setTimeout(resolve, STEP_PAUSE); });
          if (!runningRef.current) return;

          if (step.kind === "user" || step.kind === "assistant") {
            setIsTyping(true);
            const fullText = step.text;
            setSteps((prev) => [...prev, { ...step, id, textSoFar: "" }]);
            scrollToBottom();
            for (let ci = 1; ci <= fullText.length; ci++) {
              if (!runningRef.current) return;
              await new Promise<void>((resolve) => { timerRef.current = setTimeout(resolve, CHAR_DELAY); });
              setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, textSoFar: fullText.slice(0, ci) } : s)));
              if (ci % 8 === 0) scrollToBottom();
            }
            setIsTyping(false);
          } else if (step.kind === "thinking") {
            setSteps((prev) => [...prev, { ...step, id }]);
            scrollToBottom();
            await new Promise<void>((resolve) => { timerRef.current = setTimeout(resolve, 600); });
          } else if (step.kind === "tool") {
            setSteps((prev) => [...prev, { ...step, id, expanded: false }]);
            scrollToBottom();
            await new Promise<void>((resolve) => { timerRef.current = setTimeout(resolve, 400); });
            setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, expanded: true } : s)));
            scrollToBottom();
          }
        }

        await new Promise<void>((resolve) => { timerRef.current = setTimeout(resolve, RESTART_DELAY); });
      }
    }

    runScript();
    return () => {
      runningRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [scrollToBottom]);

  useEffect(() => { scrollToBottom(); }, [steps, scrollToBottom]);

  function renderStepContent(step: RenderedStep) {
    if (step.kind === "user") {
      return (
        <div className="flex justify-end mb-3 flow-bubble-in">
          <div style={{ maxWidth: "75%", background: "var(--amber)", color: "#0a0a0a", borderRadius: "18px 18px 4px 18px", padding: "0.6rem 1rem", fontSize: "0.875rem", lineHeight: 1.5 }}>
            {step.textSoFar ?? step.text}
            {isTyping && step.id === steps[steps.length - 1]?.id && <span className="flow-cursor" style={{ background: "#0a0a0a" }} />}
          </div>
        </div>
      );
    }

    if (step.kind === "thinking") {
      return (
        <div className="flex items-center gap-2 mb-2 flow-bubble-in" style={{ paddingLeft: "0.5rem" }}>
          <div style={{ display: "flex", gap: 3 }}>
            {[0, 1, 2].map((i) => (
              <span key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--text-muted)", display: "inline-block", animation: `pulse-dot 1.2s ease-in-out ${i * 0.2}s infinite` }} />
            ))}
          </div>
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontStyle: "italic" }}>{step.text}</span>
        </div>
      );
    }

    if (step.kind === "tool") {
      return (
        <div className="mb-3 flow-bubble-in" style={{ paddingLeft: "0.25rem" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.22)", borderRadius: "6px 6px 0 0", padding: "0.3rem 0.7rem", fontSize: "0.72rem", fontFamily: "var(--font-mono)", color: "var(--amber)" }}>
            <span style={{ fontSize: "0.65rem" }}>⚙</span>
            {step.name}
          </div>
          {step.expanded && (
            <div className="flow-tool-expand" style={{ background: "var(--surface-sunken)", border: "1px solid var(--surface-border)", borderTop: "none", borderRadius: "0 6px 6px 6px", padding: "0.6rem 0.75rem", fontSize: "0.72rem", fontFamily: "var(--font-mono)", lineHeight: 1.55 }}>
              <div style={{ color: "var(--text-muted)", marginBottom: "0.35rem" }}>
                <span style={{ color: "var(--text-secondary)" }}>input</span>{"  "}{step.input}
              </div>
              <div style={{ color: "var(--text-secondary)" }}>
                <span style={{ color: "#059669" }}>result</span>{"  "}{step.output}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (step.kind === "assistant") {
      const parts = (step.textSoFar ?? step.text).split(/(\*\*[^*]+\*\*)/g);
      return (
        <div className="flex gap-2 mb-3 flow-bubble-in">
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "oklch(0.55 0.18 270)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
            <span style={{ fontSize: "0.65rem", color: "white", fontWeight: 700 }}>C</span>
          </div>
          <div style={{ maxWidth: "80%", background: "var(--surface-raised)", border: "1px solid var(--surface-border)", borderRadius: "4px 18px 18px 18px", padding: "0.6rem 1rem", fontSize: "0.875rem", lineHeight: 1.6, color: "var(--text-primary)", whiteSpace: "pre-line" }}>
            {parts.map((part, i) =>
              part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>
            )}
            {isTyping && step.id === steps[steps.length - 1]?.id && <span className="flow-cursor" />}
          </div>
        </div>
      );
    }

    return null;
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--surface-border)", borderRadius: "14px", boxShadow: "0 4px 32px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden", maxWidth: "540px", width: "100%" }}>
      {/* Window chrome */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.75rem 1rem", background: "var(--surface-raised)", borderBottom: "1px solid var(--surface-border)" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <span key={c} style={{ width: 12, height: 12, borderRadius: "50%", background: c, display: "inline-block" }} />
          ))}
        </div>
        <span style={{ flex: 1, textAlign: "center", fontSize: "0.72rem", fontFamily: "var(--font-mono)", color: "var(--text-muted)", letterSpacing: "0.03em" }}>
          Claude — Tukang MCP connected
        </span>
      </div>
      {/* Chat area */}
      <div ref={scrollRef} style={{ height: 420, overflowY: "auto", padding: "1rem 1rem 0.5rem", scrollBehavior: "smooth" }}>
        {steps.map((step) => <div key={step.id}>{renderStepContent(step)}</div>)}
        <div style={{ height: 12 }} />
      </div>
      {/* Input bar */}
      <div style={{ padding: "0.75rem 1rem", borderTop: "1px solid var(--surface-border)", display: "flex", alignItems: "center", gap: "0.5rem", background: "var(--surface-raised)" }}>
        <div style={{ flex: 1, height: 36, background: "var(--surface-sunken)", borderRadius: 8, border: "1px solid var(--surface-border)", display: "flex", alignItems: "center", paddingLeft: "0.75rem" }}>
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Message Claude…</span>
        </div>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--amber)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span style={{ color: "white", fontSize: "0.8rem" }}>↑</span>
        </div>
      </div>
    </div>
  );
}

// ─── Hero video section (only used for the hero) ──────────────────────────────

function HeroVideo({ videoSrc, posterSrc, children }: { videoSrc: string; posterSrc: string; children: React.ReactNode }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || isMobile) return;
    if (!loaded) {
      vid.src = videoSrc;
      setLoaded(true);
    }
    vid.play().catch(() => {});
  }, [videoSrc, isMobile, loaded]);

  return (
    <section style={{ position: "relative", minHeight: "92vh", overflow: "hidden" }}>
      {isMobile ? (
        <div aria-hidden="true" className="mobile-poster-bg" style={{ position: "absolute", inset: 0, backgroundImage: `url(${posterSrc})`, backgroundSize: "cover", backgroundPosition: "center", zIndex: 0 }} />
      ) : (
        <video ref={videoRef} poster={posterSrc} muted loop playsInline autoPlay={false} aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: 0 }} />
      )}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "rgba(10,10,10,0.72)", zIndex: 1 }} />
      <div className="hero-content" style={{ position: "relative", zIndex: 2 }}>
        {children}
      </div>
    </section>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LiveBadge({ health }: { health: HealthStatus | null }) {
  if (!health) {
    return (
      <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--p-text-muted)", fontSize: "0.75rem", fontFamily: "var(--font-mono)" }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4b5563", display: "inline-block" }} />
        Checking...
      </span>
    );
  }
  return (
    <a href="/health" target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--p-text-muted)", fontSize: "0.75rem", fontFamily: "var(--font-mono)", textDecoration: "none", transition: "opacity 0.15s" }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.6")}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
    >
      <span className="status-dot" />
      Live · {health.tools} tools
    </a>
  );
}

function ToolGrid() {
  const [hovered, setHovered] = useState<string | null>(null);
  return (
    <div style={{ border: "1px solid var(--p-border)", borderRadius: 12, overflow: "hidden" }}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" style={{ gap: "1px", background: "var(--p-border)" }}>
        {TOOLS.map((tool) => (
          <div
            key={tool.index}
            onMouseEnter={() => setHovered(tool.index)}
            onMouseLeave={() => setHovered(null)}
            style={{ background: hovered === tool.index ? "rgba(255,255,255,0.05)" : "var(--p-bg)", padding: "1.25rem 1.5rem", transition: "background 0.15s" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: "var(--p-text-muted)", letterSpacing: "0.06em" }}>{tool.index}</span>
              <span style={{ fontSize: "0.6rem", fontFamily: "var(--font-mono)", letterSpacing: "0.08em", textTransform: "uppercase", color: CATEGORY_COLORS[tool.category] ?? "#6b7280" }}>{tool.category}</span>
            </div>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--p-text)", marginBottom: "0.375rem" }}>{tool.name}</p>
            <p style={{ fontSize: "0.8rem", color: "var(--p-text-muted)", lineHeight: 1.5 }}>{tool.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlatformGuide() {
  const [active, setActive] = useState<Platform>("claude-ai");
  const [copied, setCopied] = useState(false);
  const config = PLATFORM_CONFIG[active];
  const steps = PLATFORM_STEPS[active];
  const isMultiline = config.includes("\n");

  function copyConfig() {
    navigator.clipboard.writeText(config).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div>
      {/* Platform tabs */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "2.5rem" }}>
        {PLATFORMS.map((p) => (
          <button
            key={p.id}
            onClick={() => setActive(p.id)}
            style={{
              display: "flex", alignItems: "center", gap: "0.5rem",
              padding: "0.5rem 1rem",
              background: active === p.id ? "#ffffff" : "transparent",
              color: active === p.id ? "#0a0a0a" : "var(--p-text-dim)",
              border: `1px solid ${active === p.id ? "#ffffff" : "var(--p-border)"}`,
              borderRadius: 9999,
              fontSize: "0.875rem",
              fontWeight: active === p.id ? 500 : 400,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {p.label}
            <span style={{ fontSize: "0.6rem", fontFamily: "var(--font-mono)", padding: "2px 6px", borderRadius: 3, background: active === p.id ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.06)", color: active === p.id ? "#0a0a0a" : "var(--p-text-muted)" }}>
              {p.badge}
            </span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: "3rem" }}>
        {/* Steps */}
        <div>
          {steps.map((s, i) => (
            <div key={i} style={{ display: "flex", gap: "1rem", paddingBottom: "1.5rem", position: "relative" }}>
              {i < steps.length - 1 && (
                <div style={{ position: "absolute", left: 15, top: 32, bottom: 0, width: 1, background: "var(--p-border)" }} />
              )}
              <div style={{ position: "relative", zIndex: 1, flexShrink: 0, width: 30, height: 30, borderRadius: "50%", background: "var(--p-bg-card)", border: "1px solid var(--p-border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--amber)", fontFamily: "var(--font-mono)", fontSize: "0.7rem", fontWeight: 500 }}>
                {i + 1}
              </div>
              <div style={{ paddingTop: 4 }}>
                <p style={{ fontSize: "0.9rem", fontWeight: 500, color: "var(--p-text)", marginBottom: 3 }}>{s.step}</p>
                <p style={{ fontSize: "0.85rem", color: "var(--p-text-dim)", lineHeight: 1.6 }}>{s.detail}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Config block */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
            <span style={{ fontSize: "0.65rem", fontFamily: "var(--font-mono)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--p-text-muted)" }}>
              {isMultiline ? "claude_desktop_config.json" : "MCP Server URL"}
            </span>
            <button
              onClick={copyConfig}
              style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", padding: "4px 12px", borderRadius: 9999, background: copied ? "#ffffff" : "transparent", color: copied ? "#0a0a0a" : "var(--p-text-dim)", border: "1px solid var(--p-border)", cursor: "pointer", transition: "all 0.15s" }}
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
          <div style={{ background: "var(--p-bg-card)", border: "1px solid var(--p-border)", borderRadius: 8, fontFamily: "var(--font-mono)", fontSize: "0.8125rem", lineHeight: 1.6, padding: "1rem 1.25rem", overflowX: "auto" }}>
            <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", color: "var(--p-text)", margin: 0 }}>{config}</pre>
          </div>

          <div style={{ marginTop: 16, padding: "1rem 1.25rem", background: "var(--p-bg-card)", border: "1px solid var(--p-border)", borderRadius: 8 }}>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--p-text-muted)", marginBottom: 8 }}>
              What happens when you connect
            </p>
            {[
              "12 tools register in your AI client instantly",
              "Your preferences are remembered across sessions via Mem0",
              "Handymen are contacted via WhatsApp — no calls made",
              "$5 platform fee link generated on booking confirmation",
            ].map((line) => (
              <div key={line} style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", marginBottom: "0.375rem" }}>
                <span style={{ color: "var(--amber)", fontFamily: "var(--font-mono)", fontSize: "0.75rem", marginTop: 1 }}>→</span>
                <span style={{ fontSize: "0.8rem", color: "var(--p-text-dim)" }}>{line}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Home() {
  const [health, setHealth] = useState<HealthStatus | null>(null);

  useEffect(() => {
    const fetchHealth = () => {
      fetch("/health").then((r) => r.json()).then((d) => setHealth(d)).catch(() => {});
    };
    fetchHealth();
    const iv = setInterval(fetchHealth, 30000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "var(--p-bg)", fontFamily: "var(--font-sans)" }}>

      {/* ── Announcement bar ── */}
      <div style={{ background: "var(--p-bg-raised)", borderBottom: "1px solid var(--p-border)", padding: "0.5rem 1.5rem", textAlign: "center", fontSize: "0.8125rem", color: "var(--p-text-dim)" }}>
        🇸🇬 Singapore · Hosted MCP Server · Zero setup required
      </div>

      {/* ── Nav ── */}
      <nav style={{ position: "sticky", top: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.875rem 2rem", background: "rgba(10,10,10,0.85)", backdropFilter: "blur(16px)", borderBottom: "1px solid var(--p-border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ fontWeight: 600, fontSize: "1rem", color: "var(--p-text)", letterSpacing: "-0.02em" }}>Tukang</span>
          <span style={{ fontSize: "0.6rem", fontFamily: "var(--font-mono)", letterSpacing: "0.06em", padding: "3px 8px", borderRadius: 9999, background: "rgba(249,115,22,0.10)", border: "1px solid rgba(249,115,22,0.35)", color: "var(--amber)" }}>
            MCP SERVER
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
          <LiveBadge health={health} />
          <a href="#connect" className="btn-primary" style={{ padding: "0.5rem 1.125rem", fontSize: "0.8125rem" }}>
            Connect →
          </a>
        </div>
      </nav>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* HERO — video background, left-aligned, Palmier layout                 */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <HeroVideo videoSrc={ASSETS.video1} posterSrc={ASSETS.poster1}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "8rem 2rem 7rem" }}>
          <div style={{ maxWidth: "52rem" }}>
            {/* Headline */}
            <h1 style={{ fontWeight: 500, fontSize: "clamp(2.75rem, 7vw, 5.5rem)", letterSpacing: "-0.03em", lineHeight: 1.05, color: "#ffffff", marginBottom: "0.75rem" }}>
              Book handymen by
              <br />
              <span style={{ color: "var(--amber)" }}>prompting Claude.</span>
            </h1>

            {/* Descriptor */}
            <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", letterSpacing: "0.08em", color: "rgba(255,255,255,0.45)", marginBottom: "1.75rem", textTransform: "uppercase" }}>
              Plumbers · Electricians · Aircon · Carpentry · Painting · General repairs
            </p>

            {/* Subheadline */}
            <p style={{ fontSize: "1.125rem", color: "rgba(255,255,255,0.70)", lineHeight: 1.65, maxWidth: "38rem", marginBottom: "2.5rem" }}>
              Tukang is a hosted MCP server. Connect it once to MCP-able AI like Claude or Perplexity,
              then just ask in plain English. It WhatsApps handymen on your behalf and you pick the best/cheapest.{" "}
              <strong style={{ color: "#ffffff", fontWeight: 500 }}>Zero phone calls, zero manual googling, zero fuss.</strong>
            </p>

            {/* Prompt examples */}
            <div style={{ background: "rgba(10,10,10,0.65)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 10, padding: "1.25rem 1.5rem", maxWidth: "38rem", marginBottom: "2.5rem", backdropFilter: "blur(8px)" }}>
              <p style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", letterSpacing: "0.06em", color: "rgba(255,255,255,0.55)", marginBottom: "0.75rem" }}>
                Then just prompt your AI:
              </p>
              {[
                '"Book a plumber for Saturday in Tampines"',
                '"Get me 3 aircon quotes, WhatsApp them for me"',
                '"Search for electricians in Jurong under $150"',
              ].map((ex) => (
                <div key={ex} style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", marginBottom: "0.375rem" }}>
                  <span style={{ color: "var(--amber)", fontFamily: "var(--font-mono)", fontSize: "0.8rem", marginTop: 1 }}>&gt;</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "rgba(255,255,255,0.65)" }}>{ex}</span>
                </div>
              ))}
            </div>

            {/* CTAs */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
              <a href="#connect" className="btn-primary">
                Connect to your AI →
              </a>
              <a href="#demo" className="btn-ghost">
                See it in action
              </a>
            </div>
          </div>
        </div>
      </HeroVideo>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* CLAUDE FLOW DEMO — white island on dark page                           */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <section id="demo" style={{ background: "var(--p-bg)", borderTop: "1px solid var(--p-border)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "7rem 2rem" }}>
          <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: "4rem", alignItems: "center" }}>
            {/* Left: copy */}
            <div>
              <h2 style={{ fontWeight: 500, fontSize: "clamp(1.75rem, 3.5vw, 2.75rem)", letterSpacing: "-0.025em", color: "var(--p-text)", lineHeight: 1.15, marginBottom: "1.25rem" }}>
                One prompt.{" "}
                <span style={{ color: "var(--amber)" }}>Tukang handles the rest.</span>
              </h2>
              <p style={{ fontSize: "1rem", color: "var(--p-text-dim)", lineHeight: 1.7, marginBottom: "2rem", maxWidth: "34rem" }}>
                When you connect Tukang to Claude, it registers 12 tools silently in the background.
                You never see them — you just describe what you need in plain English, and Claude
                orchestrates the entire booking flow on your behalf.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                {[
                  { icon: "🔍", label: "Searches the handyman database by service and area" },
                  { icon: "💬", label: "WhatsApps 3–5 handymen simultaneously for quotes" },
                  { icon: "⚖️",  label: "Compares bids and surfaces the best offer" },
                  { icon: "✅", label: "Books the winner and generates a $5 payment link" },
                ].map((item) => (
                  <div key={item.label} style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
                    <span style={{ fontSize: "1rem", lineHeight: 1.6, flexShrink: 0 }}>{item.icon}</span>
                    <span style={{ fontSize: "0.9rem", color: "var(--p-text-dim)", lineHeight: 1.6 }}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: demo */}
            <div style={{ display: "flex", justifyContent: "center" }}>
              <ClaudeFlowDemo />
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* CONNECT — right after demo, platform guide                              */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <section id="connect" style={{ background: "var(--p-bg-raised)", borderTop: "1px solid var(--p-border)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "7rem 2rem" }}>
          <h2 style={{ fontWeight: 500, fontSize: "clamp(1.75rem, 3.5vw, 2.75rem)", letterSpacing: "-0.025em", color: "var(--p-text)", marginBottom: "0.75rem" }}>
            Pick your platform.
          </h2>
          <p style={{ fontSize: "1rem", color: "var(--p-text-dim)", marginBottom: "3rem", maxWidth: "36rem", lineHeight: 1.6 }}>
            No terminal required for Claude.ai and Perplexity. One config file for desktop clients.
          </p>
          <PlatformGuide />
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* HOW IT WORKS — static dark section, 4-step grid                       */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <section style={{ background: "var(--p-bg)", borderTop: "1px solid var(--p-border)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "7rem 2rem" }}>
          <h2 style={{ fontWeight: 500, fontSize: "clamp(1.75rem, 3.5vw, 2.75rem)", letterSpacing: "-0.025em", color: "var(--p-text)", marginBottom: "0.75rem" }}>
            The full flow, end to end.
          </h2>
          <p style={{ fontSize: "1rem", color: "var(--p-text-dim)", lineHeight: 1.7, maxWidth: "36rem", marginBottom: "3.5rem" }}>
            From a plain-English prompt to a confirmed booking — no phone calls, no manual searching, no context-switching.
          </p>

          <div style={{ border: "1px solid var(--p-border)", borderRadius: 12, overflow: "hidden" }}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4" style={{ gap: "1px", background: "var(--p-border)" }}>
              {[
                { n: "1", title: "You prompt",        body: "Tell your AI what you need in plain English. Area, service, budget — or just 'fix my tap'." },
                { n: "2", title: "Tukang searches",   body: "Finds matching handymen from the database. Filters by service, area, rating, and rate." },
                { n: "3", title: "WhatsApp outreach", body: "Contacts 1–5 handymen on your behalf with a quote request. You never make a call." },
                { n: "4", title: "Bid & book",        body: "Compares responses, accepts the best bid, sends rejections, and generates a $5 payment link." },
              ].map((step) => (
                <div key={step.n} style={{ background: "var(--p-bg)", padding: "1.75rem 1.5rem" }}>
                  <div style={{ fontWeight: 500, fontSize: "2.5rem", color: "var(--amber)", opacity: 0.35, lineHeight: 1, marginBottom: "1rem", fontFamily: "var(--font-sans)" }}>
                    {step.n}
                  </div>
                  <h3 style={{ fontWeight: 500, fontSize: "1rem", color: "var(--p-text)", letterSpacing: "-0.01em", marginBottom: "0.5rem" }}>
                    {step.title}
                  </h3>
                  <p style={{ fontSize: "0.85rem", color: "var(--p-text-dim)", lineHeight: 1.6 }}>{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TOOLS GRID — static dark section                                       */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <section style={{ background: "var(--p-bg-raised)", borderTop: "1px solid var(--p-border)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "7rem 2rem" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem", marginBottom: "2.5rem" }}>
            <div>
              <h2 style={{ fontWeight: 500, fontSize: "clamp(1.75rem, 3.5vw, 2.75rem)", letterSpacing: "-0.025em", color: "var(--p-text)" }}>
                Everything handled inside chat.
              </h2>
            </div>
            <p style={{ fontSize: "0.875rem", color: "var(--p-text-muted)", maxWidth: "22rem", lineHeight: 1.6 }}>
              All 12 tools run server-side. No keys, no config, no leaving your AI client.
            </p>
          </div>
          <ToolGrid />
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* INTEGRATIONS — static dark section                                     */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <section style={{ background: "var(--p-bg)", borderTop: "1px solid var(--p-border)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "7rem 2rem" }}>
          <h2 style={{ fontWeight: 500, fontSize: "clamp(1.75rem, 3.5vw, 2.75rem)", letterSpacing: "-0.025em", color: "var(--p-text)", marginBottom: "0.75rem" }}>
            All keys live on the server.
          </h2>
          <p style={{ fontSize: "1rem", color: "var(--p-text-dim)", marginBottom: "3rem", maxWidth: "36rem", lineHeight: 1.6 }}>
            Pre-configured integrations. Zero setup on your end.
          </p>

          <div style={{ border: "1px solid var(--p-border)", borderRadius: 12, overflow: "hidden" }}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" style={{ gap: "1px", background: "var(--p-border)" }}>
              {[
                { name: "MySQL Database",    desc: "14 Singapore handymen pre-seeded. Covers all districts from Jurong to Tampines.", status: "live", statusColor: "#10b981" },
                { name: "Mem0",              desc: "Persistent user preferences. Your address and budget remembered across sessions.", status: health?.integrations.mem0 ? "live" : "pending", statusColor: health?.integrations.mem0 ? "#10b981" : "#f59e0b" },
                { name: "WhatsApp Business", desc: "Outbound messages sent on your behalf. Handymen receive quote requests directly.", status: health?.integrations.whatsapp ? "live" : "pending", statusColor: health?.integrations.whatsapp ? "#10b981" : "#f59e0b" },
                { name: "Stripe",            desc: "$5 platform fee checkout link generated on every confirmed booking.", status: health?.integrations.stripe ? "live" : "pending", statusColor: health?.integrations.stripe ? "#10b981" : "#f59e0b" },
              ].map((int) => (
                <div key={int.name} style={{ background: "var(--p-bg)", padding: "1.5rem" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                    <span style={{ fontSize: "0.9rem", fontWeight: 500, color: "var(--p-text)" }}>{int.name}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: int.statusColor, letterSpacing: "0.05em" }}>{int.status}</span>
                  </div>
                  <p style={{ fontSize: "0.8rem", color: "var(--p-text-muted)", lineHeight: 1.55 }}>{int.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* FINAL CTA — Palmier-style centered close                               */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <section style={{ background: "var(--p-bg-raised)", borderTop: "1px solid var(--p-border)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "7rem 2rem", textAlign: "center" }}>
          <h2 style={{ fontWeight: 500, fontSize: "clamp(1.75rem, 3.5vw, 2.75rem)", letterSpacing: "-0.025em", color: "var(--p-text)", marginBottom: "1.25rem" }}>
            Try Tukang now.
          </h2>
          <p style={{ fontSize: "1rem", color: "var(--p-text-dim)", lineHeight: 1.7, maxWidth: "32rem", margin: "0 auto 2.5rem" }}>
            Connect once. Book handymen by prompting your AI. No calls, no forms, no fuss.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", justifyContent: "center" }}>
            <a href="#connect" className="btn-primary">
              Connect to your AI →
            </a>
            <a href="/health" target="_blank" rel="noopener noreferrer" className="btn-ghost">
              View server status
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: "1px solid var(--p-border)", padding: "2rem 2rem" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span style={{ fontWeight: 600, color: "var(--p-text)", fontSize: "0.9rem" }}>Tukang</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--p-text-muted)" }}>Handyman Booking MCP Server</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
            {["/health", "/mcp"].map((path) => (
              <a key={path} href={path} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--p-text-muted)", textDecoration: "none", transition: "opacity 0.15s" }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.5")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
              >
                {path}
              </a>
            ))}
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--p-text-muted)" }}>Singapore 🇸🇬</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
