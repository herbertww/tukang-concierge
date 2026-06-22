import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "wouter";

type StatusFilter = "pending" | "approved" | "rejected" | "all";
type CategoryFilter = "handyman" | "beautician" | "facialist" | "all";

const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b",
  approved: "#22c55e",
  rejected: "#ef4444",
};

const CATEGORY_EMOJI: Record<string, string> = {
  handyman: "🔨",
  beautician: "💅",
  facialist: "✨",
};

export default function AdminProviders() {
  const { user, loading: isLoading } = useAuth();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [actionId, setActionId] = useState<number | null>(null);

  const { data: providers, refetch, isLoading: loadingProviders } = trpc.registration.list.useQuery({
    status: statusFilter,
    category: categoryFilter,
  });

  const approve = trpc.registration.approve.useMutation({
    onSuccess: () => { refetch(); setActionId(null); },
  });
  const reject = trpc.registration.reject.useMutation({
    onSuccess: () => { refetch(); setActionId(null); },
  });

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "rgba(255,255,255,0.4)" }}>Loading...</div>
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "1rem" }}>
        <div style={{ fontSize: 48 }}>🔒</div>
        <h1 style={{ color: "#fff", fontWeight: 700 }}>Admin access required</h1>
        <Link href="/"><Button style={{ background: "#fff", color: "#0a0a0a", borderRadius: 999 }}>Go home</Button></Link>
      </div>
    );
  }

  const pendingCount = providers?.filter((p) => p.registrationStatus === "pending").length ?? 0;

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff", fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* Nav */}
      <nav style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "1rem 2rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <Link href="/" style={{ color: "rgba(255,255,255,0.5)", textDecoration: "none", fontSize: "0.875rem" }}>← Tukang</Link>
          <span style={{ color: "rgba(255,255,255,0.2)" }}>/</span>
          <span style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.8)" }}>Provider applications</span>
          {pendingCount > 0 && (
            <span style={{ background: "#f59e0b", color: "#0a0a0a", borderRadius: 999, padding: "0.15rem 0.6rem", fontSize: "0.75rem", fontWeight: 700 }}>
              {pendingCount} pending
            </span>
          )}
        </div>
        <Link href="/register" style={{ textDecoration: "none" }}>
          <Button style={{ background: "rgba(255,255,255,0.08)", color: "#fff", borderRadius: 999, border: "1px solid rgba(255,255,255,0.15)", fontSize: "0.875rem" }}>
            View registration form
          </Button>
        </Link>
      </nav>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "2.5rem 1.5rem" }}>
        {/* Filters */}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "2rem" }}>
          <div style={{ display: "flex", gap: "0.375rem", background: "rgba(255,255,255,0.05)", borderRadius: 999, padding: "0.25rem" }}>
            {(["pending", "approved", "rejected", "all"] as StatusFilter[]).map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)} style={{
                padding: "0.35rem 0.9rem", borderRadius: 999, border: "none", cursor: "pointer",
                background: statusFilter === s ? "#fff" : "transparent",
                color: statusFilter === s ? "#0a0a0a" : "rgba(255,255,255,0.5)",
                fontWeight: statusFilter === s ? 600 : 400, fontSize: "0.875rem", transition: "all 0.15s",
                textTransform: "capitalize",
              }}>{s}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: "0.375rem", background: "rgba(255,255,255,0.05)", borderRadius: 999, padding: "0.25rem" }}>
            {(["all", "handyman", "beautician", "facialist"] as CategoryFilter[]).map((c) => (
              <button key={c} onClick={() => setCategoryFilter(c)} style={{
                padding: "0.35rem 0.9rem", borderRadius: 999, border: "none", cursor: "pointer",
                background: categoryFilter === c ? "rgba(255,255,255,0.15)" : "transparent",
                color: categoryFilter === c ? "#fff" : "rgba(255,255,255,0.5)",
                fontWeight: categoryFilter === c ? 600 : 400, fontSize: "0.875rem", transition: "all 0.15s",
                textTransform: "capitalize",
              }}>
                {c !== "all" ? `${CATEGORY_EMOJI[c]} ` : ""}{c}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        {loadingProviders ? (
          <div style={{ color: "rgba(255,255,255,0.3)", textAlign: "center", padding: "4rem" }}>Loading applications...</div>
        ) : !providers || providers.length === 0 ? (
          <div style={{ textAlign: "center", padding: "4rem", color: "rgba(255,255,255,0.3)" }}>
            <div style={{ fontSize: 48, marginBottom: "1rem" }}>📭</div>
            <p>No {statusFilter !== "all" ? statusFilter : ""} applications{categoryFilter !== "all" ? ` for ${categoryFilter}s` : ""}.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {providers.map((p) => {
              const isExpanded = expandedId === p.id;
              const isActing = actionId === p.id;
              const services = Array.isArray(p.services) ? p.services : [];
              const areas = Array.isArray(p.areas) ? p.areas : [];

              return (
                <div key={p.id} style={{
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 12, overflow: "hidden", transition: "border-color 0.2s",
                }}>
                  {/* Header row */}
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : p.id)}
                    style={{ padding: "1.25rem 1.5rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "1rem" }}
                  >
                    <span style={{ fontSize: "1.5rem" }}>{CATEGORY_EMOJI[p.serviceCategory] ?? "👤"}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 600, fontSize: "1rem" }}>{p.name}</span>
                        <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.875rem" }}>·</span>
                        <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.875rem" }}>{p.phone}</span>
                        {p.email && <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.8rem" }}>{p.email}</span>}
                      </div>
                      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.3rem", flexWrap: "wrap" }}>
                        <span style={{
                          fontSize: "0.75rem", fontWeight: 600, padding: "0.15rem 0.6rem",
                          borderRadius: 999, border: `1px solid ${STATUS_COLORS[p.registrationStatus]}33`,
                          color: STATUS_COLORS[p.registrationStatus], textTransform: "capitalize",
                        }}>{p.registrationStatus}</span>
                        <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.8rem" }}>
                          SGD ${p.rateMin}–${p.rateMax}/hr · {p.yearsExperience}yr exp
                        </span>
                        <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.8rem" }}>
                          ★ {p.rating} ({p.reviewCount} reviews)
                        </span>
                      </div>
                    </div>
                    <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "1.2rem" }}>{isExpanded ? "▲" : "▼"}</span>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "1.5rem" }}>
                      {/* Services & Areas */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "1.5rem" }}>
                        <div>
                          <h4 style={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: "0.5rem" }}>Services</h4>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
                            {services.map((s: string) => (
                              <span key={s} style={{ padding: "0.25rem 0.6rem", borderRadius: 999, background: "rgba(255,255,255,0.07)", fontSize: "0.8rem", color: "rgba(255,255,255,0.7)" }}>{s}</span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <h4 style={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: "0.5rem" }}>Areas</h4>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
                            {areas.map((a: string) => (
                              <span key={a} style={{ padding: "0.25rem 0.6rem", borderRadius: 999, background: "rgba(255,255,255,0.07)", fontSize: "0.8rem", color: "rgba(255,255,255,0.7)" }}>{a}</span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Bio */}
                      {p.bio && (
                        <div style={{ marginBottom: "1.5rem" }}>
                          <h4 style={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: "0.5rem" }}>Bio</h4>
                          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.875rem", lineHeight: 1.6 }}>{p.bio}</p>
                        </div>
                      )}

                      {/* Links */}
                      {(p.instagramHandle || p.portfolioUrl) && (
                        <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem" }}>
                          {p.instagramHandle && (
                            <a href={`https://instagram.com/${p.instagramHandle.replace("@", "")}`} target="_blank" rel="noopener noreferrer"
                              style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.875rem", textDecoration: "none" }}>
                              📸 {p.instagramHandle}
                            </a>
                          )}
                          {p.portfolioUrl && (
                            <a href={p.portfolioUrl} target="_blank" rel="noopener noreferrer"
                              style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.875rem", textDecoration: "none" }}>
                              🔗 Portfolio
                            </a>
                          )}
                        </div>
                      )}

                      {/* Recent reviews */}
                      {p.recentReviews && p.recentReviews.length > 0 && (
                        <div style={{ marginBottom: "1.5rem" }}>
                          <h4 style={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: "0.75rem" }}>Recent reviews</h4>
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                            {p.recentReviews.map((r) => (
                              <div key={r.id} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "0.75rem 1rem" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                                  <span style={{ color: "#f59e0b" }}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                                  <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.8rem" }}>{r.reviewerName ?? "Anonymous"}</span>
                                </div>
                                {r.comment && <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.8rem", margin: 0 }}>{r.comment}</p>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Admin notes + actions */}
                      {p.registrationStatus === "pending" && (
                        <div>
                          <h4 style={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: "0.5rem" }}>Notes (optional)</h4>
                          <Textarea
                            value={notes[p.id] ?? ""}
                            onChange={(e) => setNotes((n) => ({ ...n, [p.id]: e.target.value }))}
                            placeholder="Internal notes about this application..."
                            rows={2}
                            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#fff", resize: "vertical", marginBottom: "1rem" }}
                          />
                          <div style={{ display: "flex", gap: "0.75rem" }}>
                            <Button
                              onClick={() => { setActionId(p.id); approve.mutate({ id: p.id, notes: notes[p.id] }); }}
                              disabled={isActing && approve.isPending}
                              style={{ background: "#22c55e", color: "#fff", borderRadius: 999, border: "none", padding: "0.6rem 1.5rem", fontWeight: 600, cursor: "pointer" }}
                            >
                              {isActing && approve.isPending ? "Approving..." : "✓ Approve"}
                            </Button>
                            <Button
                              onClick={() => { setActionId(p.id); reject.mutate({ id: p.id, notes: notes[p.id] }); }}
                              disabled={isActing && reject.isPending}
                              style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", borderRadius: 999, border: "1px solid rgba(239,68,68,0.3)", padding: "0.6rem 1.5rem", fontWeight: 600, cursor: "pointer" }}
                            >
                              {isActing && reject.isPending ? "Rejecting..." : "✗ Reject"}
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Already actioned */}
                      {p.registrationStatus !== "pending" && p.registrationNotes && (
                        <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "0.75rem 1rem" }}>
                          <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)" }}>Admin notes: </span>
                          <span style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.6)" }}>{p.registrationNotes}</span>
                        </div>
                      )}

                      {/* Re-action on approved/rejected */}
                      {p.registrationStatus === "approved" && (
                        <div style={{ marginTop: "1rem" }}>
                          <Button
                            onClick={() => { setActionId(p.id); reject.mutate({ id: p.id, notes: "Revoked by admin" }); }}
                            style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", borderRadius: 999, border: "1px solid rgba(239,68,68,0.2)", padding: "0.5rem 1.25rem", fontSize: "0.875rem", cursor: "pointer" }}
                          >
                            Revoke approval
                          </Button>
                        </div>
                      )}
                      {p.registrationStatus === "rejected" && (
                        <div style={{ marginTop: "1rem" }}>
                          <Button
                            onClick={() => { setActionId(p.id); approve.mutate({ id: p.id, notes: "Re-approved by admin" }); }}
                            style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e", borderRadius: 999, border: "1px solid rgba(34,197,94,0.2)", padding: "0.5rem 1.25rem", fontSize: "0.875rem", cursor: "pointer" }}
                          >
                            Re-approve
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
