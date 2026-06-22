import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";

type Category = "handyman" | "beautician" | "facialist";

const CATEGORY_INFO: Record<Category, { label: string; emoji: string; description: string; serviceOptions: string[] }> = {
  handyman: {
    label: "Handyman",
    emoji: "🔨",
    description: "Plumbing, electrical, aircon, carpentry, painting, general repairs",
    serviceOptions: ["Plumbing", "Electrical", "Aircon Servicing", "Carpentry", "Painting", "Tiling", "General Repairs", "Moving & Shifting", "Cleaning"],
  },
  beautician: {
    label: "Beautician",
    emoji: "💅",
    description: "Nails, lashes, brows, waxing, makeup, hair",
    serviceOptions: ["Nails", "Eyelash Extensions", "Eyebrow Threading", "Waxing", "Makeup", "Hair Styling", "Hair Colour", "Keratin Treatment"],
  },
  facialist: {
    label: "Facialist",
    emoji: "✨",
    description: "Facials, skin treatments, extractions, LED therapy, microneedling",
    serviceOptions: ["Classic Facial", "Deep Cleansing", "Extractions", "LED Therapy", "Microneedling", "Chemical Peel", "Hydrafacial", "Anti-Ageing Treatment"],
  },
};

const SG_AREAS = [
  "Ang Mo Kio", "Bedok", "Bishan", "Bukit Batok", "Bukit Merah", "Bukit Panjang",
  "Bukit Timah", "Central", "Choa Chu Kang", "Clementi", "Geylang", "Hougang",
  "Jurong East", "Jurong West", "Kallang", "Marine Parade", "Novena", "Pasir Ris",
  "Punggol", "Queenstown", "Sembawang", "Sengkang", "Serangoon", "Tampines",
  "Toa Payoh", "Woodlands", "Yishun",
];

type Step = "category" | "details" | "services" | "rates" | "review" | "done";

export default function Register() {
  const [step, setStep] = useState<Step>("category");
  const [category, setCategory] = useState<Category | null>(null);
  const [form, setForm] = useState({
    name: "", phone: "", whatsappPhone: "", email: "",
    instagramHandle: "", portfolioUrl: "",
    bio: "", yearsExperience: 1,
    acraRegistered: false, acraNumber: "",
    services: [] as string[],
    areas: [] as string[],
    rateMin: 0, rateMax: 0,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = trpc.registration.submit.useMutation();

  function set(field: string, value: unknown) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => { const n = { ...e }; delete n[field]; return n; });
  }

  function toggleItem(field: "services" | "areas", item: string) {
    setForm((f) => {
      const arr = f[field];
      return { ...f, [field]: arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item] };
    });
  }

  function validateDetails() {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (!form.phone.trim()) e.phone = "Phone is required";
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Invalid email";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function validateServices() {
    const e: Record<string, string> = {};
    if (form.services.length === 0) e.services = "Select at least one service";
    if (form.areas.length === 0) e.areas = "Select at least one area";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function validateRates() {
    const e: Record<string, string> = {};
    if (!form.rateMin || form.rateMin <= 0) e.rateMin = "Enter your minimum rate";
    if (!form.rateMax || form.rateMax <= 0) e.rateMax = "Enter your maximum rate";
    if (form.rateMax < form.rateMin) e.rateMax = "Max rate must be ≥ min rate";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit() {
    if (!category) return;
    try {
      await submit.mutateAsync({
        ...form,
        serviceCategory: category,
        whatsappPhone: form.whatsappPhone || form.phone,
        email: form.email || undefined,
        instagramHandle: form.instagramHandle || undefined,
        portfolioUrl: form.portfolioUrl || undefined,
        bio: form.bio || undefined,
        acraNumber: form.acraNumber || undefined,
      });
      setStep("done");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Submission failed. Please try again.";
      setErrors({ submit: msg });
    }
  }

  const catInfo = category ? CATEGORY_INFO[category] : null;
  const stepIndex = ["category", "details", "services", "rates", "review"].indexOf(step);

  if (step === "done") {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
        <div style={{ maxWidth: 480, textAlign: "center" }}>
          <div style={{ fontSize: 64, marginBottom: "1.5rem" }}>🎉</div>
          <h1 style={{ fontSize: "2rem", fontWeight: 700, color: "#fff", marginBottom: "1rem" }}>Application submitted!</h1>
          <p style={{ color: "rgba(255,255,255,0.6)", lineHeight: 1.7, marginBottom: "2rem" }}>
            We'll review your application and reach out via WhatsApp within 1–2 business days.
            Once approved, you'll start receiving job requests automatically.
          </p>
          <Link href="/">
            <Button style={{ background: "#fff", color: "#0a0a0a", borderRadius: 999, padding: "0.75rem 2rem", fontWeight: 600 }}>
              Back to Tukang
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff", fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* Nav */}
      <nav style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "1rem 2rem", display: "flex", alignItems: "center", gap: "1rem" }}>
        <Link href="/" style={{ color: "rgba(255,255,255,0.5)", textDecoration: "none", fontSize: "0.875rem" }}>← Tukang</Link>
        <span style={{ color: "rgba(255,255,255,0.2)" }}>/</span>
        <span style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.8)" }}>Join as a provider</span>
      </nav>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "3rem 1.5rem" }}>
        {/* Progress */}
        {step !== "category" && (
          <div style={{ display: "flex", gap: 6, marginBottom: "2.5rem" }}>
            {["details", "services", "rates", "review"].map((s, i) => (
              <div key={s} style={{
                height: 3, flex: 1, borderRadius: 999,
                background: i < stepIndex - 1 ? "#fff" : i === stepIndex - 1 ? "#fff" : "rgba(255,255,255,0.15)",
                transition: "background 0.3s",
              }} />
            ))}
          </div>
        )}

        {/* Step: Category */}
        {step === "category" && (
          <div>
            <h1 style={{ fontSize: "2.5rem", fontWeight: 700, lineHeight: 1.15, marginBottom: "0.75rem" }}>
              Join Tukang<br />as a provider.
            </h1>
            <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: "2.5rem", lineHeight: 1.7 }}>
              Get job requests sent directly to your WhatsApp. Zero cold calls, zero chasing clients.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {(Object.entries(CATEGORY_INFO) as [Category, typeof CATEGORY_INFO[Category]][]).map(([key, info]) => (
                <button
                  key={key}
                  onClick={() => { setCategory(key); setStep("details"); }}
                  style={{
                    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 12, padding: "1.25rem 1.5rem", textAlign: "left", cursor: "pointer",
                    transition: "border-color 0.2s, background 0.2s", color: "#fff",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.3)"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.07)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.1)"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.25rem" }}>
                    <span style={{ fontSize: "1.5rem" }}>{info.emoji}</span>
                    <span style={{ fontWeight: 600, fontSize: "1.1rem" }}>{info.label}</span>
                  </div>
                  <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.875rem", margin: 0 }}>{info.description}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step: Personal Details */}
        {step === "details" && catInfo && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <span style={{ fontSize: "1.5rem" }}>{catInfo.emoji}</span>
              <Badge style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "none" }}>{catInfo.label}</Badge>
            </div>
            <h2 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "2rem" }}>Your details</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <Field label="Full name *" error={errors.name}>
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ahmad bin Rashid" style={inputStyle} />
              </Field>
              <Field label="Phone number *" error={errors.phone}>
                <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+65 9123 4567" style={inputStyle} />
              </Field>
              <Field label="WhatsApp number (if different)">
                <Input value={form.whatsappPhone} onChange={(e) => set("whatsappPhone", e.target.value)} placeholder="+65 9123 4567" style={inputStyle} />
              </Field>
              <Field label="Email" error={errors.email}>
                <Input value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@email.com" style={inputStyle} />
              </Field>
              {category === "beautician" || category === "facialist" ? (
                <Field label="Instagram handle">
                  <Input value={form.instagramHandle} onChange={(e) => set("instagramHandle", e.target.value)} placeholder="@yourhandle" style={inputStyle} />
                </Field>
              ) : null}
              <Field label="Years of experience">
                <Input type="number" min={0} max={60} value={form.yearsExperience} onChange={(e) => set("yearsExperience", parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: 120 }} />
              </Field>
              <Field label="Bio (optional)">
                <Textarea value={form.bio} onChange={(e) => set("bio", e.target.value)} placeholder="Tell customers a bit about yourself and your work..." rows={3} style={{ ...inputStyle, resize: "vertical" }} />
              </Field>
              {category === "handyman" && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <input type="checkbox" id="acra" checked={form.acraRegistered} onChange={(e) => set("acraRegistered", e.target.checked)} style={{ width: 18, height: 18, cursor: "pointer" }} />
                  <label htmlFor="acra" style={{ color: "rgba(255,255,255,0.7)", cursor: "pointer" }}>ACRA registered business</label>
                </div>
              )}
              {form.acraRegistered && (
                <Field label="ACRA number">
                  <Input value={form.acraNumber} onChange={(e) => set("acraNumber", e.target.value)} placeholder="202312345A" style={inputStyle} />
                </Field>
              )}
            </div>
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "2rem" }}>
              <Button variant="outline" onClick={() => setStep("category")} style={ghostBtnStyle}>Back</Button>
              <Button onClick={() => { if (validateDetails()) setStep("services"); }} style={primaryBtnStyle}>Continue →</Button>
            </div>
          </div>
        )}

        {/* Step: Services & Areas */}
        {step === "services" && catInfo && (
          <div>
            <h2 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.5rem" }}>Services & coverage</h2>
            <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: "2rem" }}>Select everything you offer and where you operate.</p>

            <h3 style={{ fontSize: "0.875rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: "0.75rem" }}>Services offered</h3>
            {errors.services && <p style={{ color: "#f87171", fontSize: "0.875rem", marginBottom: "0.5rem" }}>{errors.services}</p>}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "2rem" }}>
              {catInfo.serviceOptions.map((s) => (
                <button key={s} onClick={() => toggleItem("services", s)} style={{
                  padding: "0.4rem 0.9rem", borderRadius: 999, border: "1px solid",
                  borderColor: form.services.includes(s) ? "#fff" : "rgba(255,255,255,0.2)",
                  background: form.services.includes(s) ? "#fff" : "transparent",
                  color: form.services.includes(s) ? "#0a0a0a" : "rgba(255,255,255,0.7)",
                  cursor: "pointer", fontSize: "0.875rem", fontWeight: 500, transition: "all 0.15s",
                }}>{s}</button>
              ))}
            </div>

            <h3 style={{ fontSize: "0.875rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: "0.75rem" }}>Areas covered</h3>
            {errors.areas && <p style={{ color: "#f87171", fontSize: "0.875rem", marginBottom: "0.5rem" }}>{errors.areas}</p>}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              {SG_AREAS.map((a) => (
                <button key={a} onClick={() => toggleItem("areas", a)} style={{
                  padding: "0.4rem 0.9rem", borderRadius: 999, border: "1px solid",
                  borderColor: form.areas.includes(a) ? "#fff" : "rgba(255,255,255,0.2)",
                  background: form.areas.includes(a) ? "#fff" : "transparent",
                  color: form.areas.includes(a) ? "#0a0a0a" : "rgba(255,255,255,0.7)",
                  cursor: "pointer", fontSize: "0.875rem", fontWeight: 500, transition: "all 0.15s",
                }}>{a}</button>
              ))}
            </div>

            <div style={{ display: "flex", gap: "0.75rem", marginTop: "2rem" }}>
              <Button variant="outline" onClick={() => setStep("details")} style={ghostBtnStyle}>Back</Button>
              <Button onClick={() => { if (validateServices()) setStep("rates"); }} style={primaryBtnStyle}>Continue →</Button>
            </div>
          </div>
        )}

        {/* Step: Rates */}
        {step === "rates" && (
          <div>
            <h2 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.5rem" }}>Your rates</h2>
            <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: "2rem" }}>Customers see your rate range before requesting a quote.</p>
            <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
              <Field label="Minimum rate (SGD/hr) *" error={errors.rateMin}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ color: "rgba(255,255,255,0.4)" }}>$</span>
                  <Input type="number" min={0} value={form.rateMin || ""} onChange={(e) => set("rateMin", parseFloat(e.target.value) || 0)} placeholder="50" style={{ ...inputStyle, width: 120 }} />
                </div>
              </Field>
              <Field label="Maximum rate (SGD/hr) *" error={errors.rateMax}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ color: "rgba(255,255,255,0.4)" }}>$</span>
                  <Input type="number" min={0} value={form.rateMax || ""} onChange={(e) => set("rateMax", parseFloat(e.target.value) || 0)} placeholder="120" style={{ ...inputStyle, width: 120 }} />
                </div>
              </Field>
            </div>
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.8rem", marginTop: "0.75rem" }}>
              You can always negotiate the final price with each customer.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "2rem" }}>
              <Button variant="outline" onClick={() => setStep("services")} style={ghostBtnStyle}>Back</Button>
              <Button onClick={() => { if (validateRates()) setStep("review"); }} style={primaryBtnStyle}>Review application →</Button>
            </div>
          </div>
        )}

        {/* Step: Review */}
        {step === "review" && catInfo && category && (
          <div>
            <h2 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "2rem" }}>Review & submit</h2>
            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
              <ReviewRow label="Category" value={`${catInfo.emoji} ${catInfo.label}`} />
              <ReviewRow label="Name" value={form.name} />
              <ReviewRow label="Phone" value={form.phone} />
              {form.email && <ReviewRow label="Email" value={form.email} />}
              {form.instagramHandle && <ReviewRow label="Instagram" value={form.instagramHandle} />}
              <ReviewRow label="Experience" value={`${form.yearsExperience} year${form.yearsExperience !== 1 ? "s" : ""}`} />
              <ReviewRow label="Services" value={form.services.join(", ")} />
              <ReviewRow label="Areas" value={form.areas.join(", ")} />
              <ReviewRow label="Rate" value={`SGD $${form.rateMin}–$${form.rateMax}/hr`} />
              {form.bio && <ReviewRow label="Bio" value={form.bio} />}
            </div>
            {errors.submit && (
              <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 8, padding: "0.75rem 1rem", marginTop: "1rem", color: "#f87171", fontSize: "0.875rem" }}>
                {errors.submit}
              </div>
            )}
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "2rem" }}>
              <Button variant="outline" onClick={() => setStep("rates")} style={ghostBtnStyle}>Back</Button>
              <Button onClick={handleSubmit} disabled={submit.isPending} style={{ ...primaryBtnStyle, opacity: submit.isPending ? 0.6 : 1 }}>
                {submit.isPending ? "Submitting..." : "Submit application"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: "0.875rem", color: "rgba(255,255,255,0.6)", marginBottom: "0.4rem" }}>{label}</label>
      {children}
      {error && <p style={{ color: "#f87171", fontSize: "0.8rem", marginTop: "0.25rem" }}>{error}</p>}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: "1rem", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "0.75rem" }}>
      <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.875rem", minWidth: 100 }}>{label}</span>
      <span style={{ color: "#fff", fontSize: "0.875rem", flex: 1 }}>{value}</span>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8,
  color: "#fff",
  padding: "0.6rem 0.9rem",
};

const primaryBtnStyle: React.CSSProperties = {
  background: "#fff",
  color: "#0a0a0a",
  borderRadius: 999,
  padding: "0.65rem 1.75rem",
  fontWeight: 600,
  fontSize: "0.95rem",
  border: "none",
  cursor: "pointer",
};

const ghostBtnStyle: React.CSSProperties = {
  background: "transparent",
  color: "rgba(255,255,255,0.6)",
  borderRadius: 999,
  padding: "0.65rem 1.25rem",
  fontWeight: 500,
  fontSize: "0.95rem",
  border: "1px solid rgba(255,255,255,0.15)",
  cursor: "pointer",
};
