/**
 * oauth.ts
 * Minimal, open OAuth 2.1 layer so MCP clients that REQUIRE the OAuth handshake
 * (e.g. Perplexity's "Add custom connector", which mandates Dynamic Client
 * Registration) can connect. Tukang's MCP server is intentionally unauthenticated
 * — the product is gated by the $5 fee, not by MCP auth — so this implementation
 * auto-approves every client and issues bearer tokens that the /mcp endpoint does
 * not actually require. Clients that don't need OAuth (Claude, ChatGPT, Qwen)
 * continue to POST /mcp directly and are unaffected.
 *
 * Implements: RFC 9728 (protected-resource metadata), RFC 8414 (authorization-
 * server metadata), RFC 7591 (dynamic client registration), authorization-code
 * grant with PKCE (S256/plain), and refresh_token grant.
 */

import express, { type Express, type Request, type Response } from "express";
import { randomBytes, createHash } from "crypto";
import { config } from "./config.js";

const ISSUER = (config.stripe.publicUrl || "http://localhost:8000").replace(/\/$/, "");

interface AuthCode {
  clientId: string;
  redirectUri: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  expires: number;
}

// Ephemeral in-memory state (mirrors the in-memory transports Map). Fine for an
// open connector: lost state just means a client re-runs the (instant) handshake.
const clients = new Map<string, { redirectUris: string[] }>();
const codes = new Map<string, AuthCode>();
const tokens = new Map<string, { clientId: string; expires: number }>();

const rand = (n = 32): string => randomBytes(n).toString("base64url");

function verifyPkce(challenge: string, method: string | undefined, verifier?: string): boolean {
  if (!verifier) return false;
  if (method === "S256" || method === undefined) {
    return createHash("sha256").update(verifier).digest("base64url") === challenge;
  }
  return verifier === challenge; // "plain"
}

export function registerOAuthRoutes(app: Express): void {
  // ── RFC 9728: Protected Resource Metadata ──────────────────────────────────
  const resourceMeta = {
    resource: `${ISSUER}/mcp`,
    authorization_servers: [ISSUER],
  };
  const sendResourceMeta = (_req: Request, res: Response) => res.json(resourceMeta);
  app.get("/.well-known/oauth-protected-resource", sendResourceMeta);
  app.get("/.well-known/oauth-protected-resource/mcp", sendResourceMeta);

  // ── RFC 8414: Authorization Server Metadata ────────────────────────────────
  const asMeta = {
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/authorize`,
    token_endpoint: `${ISSUER}/token`,
    registration_endpoint: `${ISSUER}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256", "plain"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp"],
  };
  const sendAsMeta = (_req: Request, res: Response) => res.json(asMeta);
  app.get("/.well-known/oauth-authorization-server", sendAsMeta);
  app.get("/.well-known/oauth-authorization-server/mcp", sendAsMeta);
  app.get("/.well-known/openid-configuration", sendAsMeta);

  // ── RFC 7591: Dynamic Client Registration (open — accept anyone) ───────────
  app.post("/register", (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const clientId = `tukang_${rand(12)}`;
    const redirectUris = Array.isArray(body.redirect_uris)
      ? (body.redirect_uris as string[])
      : [];
    clients.set(clientId, { redirectUris });
    res.status(201).json({
      client_id: clientId,
      redirect_uris: redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_id_issued_at: Math.floor(Date.now() / 1000),
      ...(body.client_name ? { client_name: body.client_name } : {}),
    });
  });

  // ── Authorization endpoint — auto-approve (no interactive login) ───────────
  app.get("/authorize", (req: Request, res: Response) => {
    const q = req.query as Record<string, string | undefined>;
    if (!q.redirect_uri) {
      res.status(400).send("missing redirect_uri");
      return;
    }
    const code = rand(24);
    codes.set(code, {
      clientId: q.client_id ?? "unknown",
      redirectUri: q.redirect_uri,
      codeChallenge: q.code_challenge,
      codeChallengeMethod: q.code_challenge_method,
      expires: Date.now() + 5 * 60 * 1000,
    });
    let target: URL;
    try {
      target = new URL(q.redirect_uri);
    } catch {
      res.status(400).send("invalid redirect_uri");
      return;
    }
    target.searchParams.set("code", code);
    if (q.state) target.searchParams.set("state", q.state);
    res.redirect(target.toString());
  });

  // ── Token endpoint (form-encoded per OAuth) ────────────────────────────────
  app.post("/token", express.urlencoded({ extended: true }), (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, string>;
    const issue = (clientId: string) => {
      const accessToken = rand(32);
      tokens.set(accessToken, { clientId, expires: Date.now() + 3600 * 1000 });
      return {
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: rand(32),
        scope: "mcp",
      };
    };

    if (body.grant_type === "authorization_code") {
      const rec = body.code ? codes.get(body.code) : undefined;
      if (!rec || rec.expires < Date.now()) {
        res.status(400).json({ error: "invalid_grant" });
        return;
      }
      codes.delete(body.code);
      if (rec.codeChallenge && !verifyPkce(rec.codeChallenge, rec.codeChallengeMethod, body.code_verifier)) {
        res.status(400).json({ error: "invalid_grant", error_description: "PKCE verification failed" });
        return;
      }
      res.json(issue(rec.clientId));
      return;
    }

    if (body.grant_type === "refresh_token") {
      res.json(issue("refresh"));
      return;
    }

    res.status(400).json({ error: "unsupported_grant_type" });
  });
}
