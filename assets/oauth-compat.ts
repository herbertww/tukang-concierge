/**
 * OAuth 2.0 compatibility layer for Claude.ai MCP integration.
 *
 * Tukang is a PUBLIC, no-auth MCP server. However, Claude.ai requires
 * MCP servers to advertise OAuth metadata (RFC 9728, RFC 8414, RFC 7591)
 * before it will connect. We implement a minimal "passthrough" OAuth flow:
 *
 *   1. /.well-known/oauth-protected-resource  → tells Claude where the AS is
 *   2. /.well-known/oauth-authorization-server → AS metadata (we ARE the AS)
 *   3. POST /register                          → dynamic client registration
 *   4. GET  /authorize                         → immediately issues a code
 *   5. POST /token                             → exchanges code for a dummy token
 *
 * The resulting "access token" is a static string that our /mcp endpoint
 * accepts (or ignores — since we have no auth). This satisfies Claude.ai's
 * OAuth handshake without requiring the user to log in to anything.
 */

import type { Express, Request, Response } from "express";
import { nanoid } from "nanoid";

// In-memory stores (fine for stateless single-instance deployment)
const registeredClients = new Map<string, { clientId: string; clientSecret: string; redirectUris: string[] }>();
const authCodes = new Map<string, { clientId: string; redirectUri: string; expiresAt: number }>();

const SERVER_URL = process.env.SERVER_URL ?? "https://tukangmcp-mk92pgzc.manus.space";
const STATIC_TOKEN = "tukang-public-access-token";

export function registerOAuthCompatRoutes(app: Express) {
  // ── RFC 9728: Protected Resource Metadata ─────────────────────────────────
  // Claude.ai fetches this first to discover where the authorization server is.
  app.get("/.well-known/oauth-protected-resource", (_req: Request, res: Response) => {
    res.json({
      resource: `${SERVER_URL}/mcp`,
      authorization_servers: [`${SERVER_URL}`],
      bearer_methods_supported: ["header"],
      resource_documentation: `${SERVER_URL}`,
    });
  });

  // ── RFC 8414: Authorization Server Metadata ───────────────────────────────
  // Claude.ai fetches this to learn registration, auth, and token endpoints.
  app.get("/.well-known/oauth-authorization-server", (_req: Request, res: Response) => {
    res.json({
      issuer: SERVER_URL,
      authorization_endpoint: `${SERVER_URL}/authorize`,
      token_endpoint: `${SERVER_URL}/token`,
      registration_endpoint: `${SERVER_URL}/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
      scopes_supported: ["mcp"],
    });
  });

  // ── RFC 7591: Dynamic Client Registration ─────────────────────────────────
  // Claude.ai POSTs here to register itself as an OAuth client.
  app.post("/register", (req: Request, res: Response) => {
    const clientId = `tukang-client-${nanoid(8)}`;
    const clientSecret = nanoid(32);
    const redirectUris: string[] = req.body?.redirect_uris ?? [];

    registeredClients.set(clientId, { clientId, clientSecret, redirectUris });

    res.status(201).json({
      client_id: clientId,
      client_secret: clientSecret,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_secret_expires_at: 0, // never expires
      redirect_uris: redirectUris,
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_post",
    });
  });

  // ── Authorization endpoint ─────────────────────────────────────────────────
  // Claude.ai redirects the user here. Since Tukang is public/no-auth,
  // we skip the login UI and immediately redirect back with a code.
  app.get("/authorize", (req: Request, res: Response) => {
    const { client_id, redirect_uri, state, response_type } = req.query as Record<string, string>;

    if (response_type !== "code") {
      res.status(400).json({ error: "unsupported_response_type" });
      return;
    }

    const code = nanoid(32);
    authCodes.set(code, {
      clientId: client_id,
      redirectUri: redirect_uri,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 min
    });

    // Immediately redirect back — no login required for a public server
    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set("code", code);
    if (state) redirectUrl.searchParams.set("state", state);

    res.redirect(redirectUrl.toString());
  });

  // ── Token endpoint ─────────────────────────────────────────────────────────
  // Claude.ai exchanges the auth code for an access token here.
  app.post("/token", (req: Request, res: Response) => {
    const { grant_type, code, redirect_uri } = req.body ?? {};

    if (grant_type !== "authorization_code") {
      res.status(400).json({ error: "unsupported_grant_type" });
      return;
    }

    const stored = authCodes.get(code);
    if (!stored || stored.expiresAt < Date.now()) {
      authCodes.delete(code);
      res.status(400).json({ error: "invalid_grant" });
      return;
    }

    if (redirect_uri && stored.redirectUri !== redirect_uri) {
      res.status(400).json({ error: "invalid_grant" });
      return;
    }

    authCodes.delete(code);

    res.json({
      access_token: STATIC_TOKEN,
      token_type: "Bearer",
      expires_in: 86400 * 365, // 1 year — effectively permanent for a public server
      scope: "mcp",
    });
  });
}

/** Middleware: accept any Bearer token (or no token) on /mcp — server is public */
export function mcpAuthMiddleware(req: Request, res: Response, next: () => void) {
  // We don't actually validate the token — the server is public.
  // Just ensure Claude.ai gets a proper 401 + WWW-Authenticate if it hits /mcp
  // without going through the OAuth flow first (e.g., direct curl).
  const auth = req.headers.authorization;
  if (!auth) {
    // Return 401 with WWW-Authenticate so clients know to start OAuth flow
    res.setHeader(
      "WWW-Authenticate",
      `Bearer realm="${SERVER_URL}", resource_metadata="${SERVER_URL}/.well-known/oauth-protected-resource"`
    );
    // But still allow the request through — we're a public server
    // (Claude.ai will retry with a token after the OAuth flow)
  }
  next();
}
