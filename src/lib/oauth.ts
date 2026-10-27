import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db";
import {
  oauthClients,
  oauthCodes,
  oauthTokens,
  type Role,
  user,
} from "@/db/schema";
import { allowedRedirectUri, verifyPkce } from "./oauth-pkce";
import type { Viewer } from "./session";
import { siteUrl } from "./site-url";

// A small OAuth 2.1 authorization server for MCP clients, following the
// MCP authorization spec: dynamic client registration, authorization code
// with PKCE, refresh tokens, and tokens bound to the /mcp resource.

export const MCP_RESOURCE = () => siteUrl("/mcp");
export const SCOPE = "mcp";
const CODE_TTL = 10 * 60 * 1000;
const ACCESS_TTL = 60 * 60 * 1000;
const REFRESH_TTL = 30 * 24 * 60 * 60 * 1000;

const hash = (secret: string) =>
  createHash("sha256").update(secret).digest("hex");
const secret = () => randomBytes(32).toString("base64url");

export class OAuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function authorizationServerMetadata() {
  return {
    issuer: siteUrl("/").replace(/\/$/, ""),
    authorization_endpoint: siteUrl("/oauth/authorize"),
    token_endpoint: siteUrl("/oauth/token"),
    registration_endpoint: siteUrl("/oauth/register"),
    revocation_endpoint: siteUrl("/oauth/revoke"),
    scopes_supported: [SCOPE],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
  };
}

export function protectedResourceMetadata() {
  return {
    resource: MCP_RESOURCE(),
    authorization_servers: [siteUrl("/").replace(/\/$/, "")],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "Nordpress",
  };
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export async function registerClient(input: {
  client_name?: unknown;
  redirect_uris?: unknown;
}) {
  const uris = Array.isArray(input.redirect_uris)
    ? input.redirect_uris.map(String).slice(0, 10)
    : [];
  if (uris.length === 0 || !uris.every(allowedRedirectUri))
    throw new OAuthError(
      "invalid_redirect_uri",
      "Redirect URIs must use https, or http on localhost.",
    );
  const name =
    String(input.client_name ?? "")
      .trim()
      .slice(0, 100) || "MCP client";
  const [client] = await db
    .insert(oauthClients)
    .values({ id: randomUUID(), name, redirectUris: uris })
    .returning();
  return client;
}

export async function getClient(id: string) {
  const [client] = await db
    .select()
    .from(oauthClients)
    .where(eq(oauthClients.id, id));
  return client ?? null;
}

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

export type AuthorizeRequest = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
  scope: string;
  resource: string;
};

/** Checks an authorization request; errors here must not redirect. */
export async function validateAuthorizeRequest(params: URLSearchParams) {
  const client = await getClient(params.get("client_id") ?? "");
  if (!client)
    throw new OAuthError("invalid_client", "This app isn't registered.");
  const redirectUri = params.get("redirect_uri") ?? "";
  if (!client.redirectUris.includes(redirectUri))
    throw new OAuthError(
      "invalid_request",
      "The redirect address doesn't match.",
    );
  if (params.get("response_type") !== "code")
    throw new OAuthError(
      "unsupported_response_type",
      "Only the code flow is supported.",
    );
  const codeChallenge = params.get("code_challenge") ?? "";
  if (params.get("code_challenge_method") !== "S256" || !codeChallenge)
    throw new OAuthError("invalid_request", "PKCE with S256 is required.");
  const resource = params.get("resource") ?? MCP_RESOURCE();
  if (resource.replace(/\/$/, "") !== MCP_RESOURCE())
    throw new OAuthError(
      "invalid_target",
      "Tokens are only issued for this site's MCP server.",
    );
  return {
    client,
    request: {
      clientId: client.id,
      redirectUri,
      codeChallenge,
      state: params.get("state") ?? "",
      scope: SCOPE,
      resource: MCP_RESOURCE(),
    } satisfies AuthorizeRequest,
  };
}

export async function issueCode(viewer: Viewer, request: AuthorizeRequest) {
  const code = secret();
  await db.insert(oauthCodes).values({
    codeHash: hash(code),
    clientId: request.clientId,
    userId: viewer.id,
    redirectUri: request.redirectUri,
    codeChallenge: request.codeChallenge,
    scope: request.scope,
    resource: request.resource,
    expiresAt: new Date(Date.now() + CODE_TTL),
  });
  const url = new URL(request.redirectUri);
  url.searchParams.set("code", code);
  if (request.state) url.searchParams.set("state", request.state);
  return url.toString();
}

export function deniedRedirect(request: AuthorizeRequest) {
  const url = new URL(request.redirectUri);
  url.searchParams.set("error", "access_denied");
  if (request.state) url.searchParams.set("state", request.state);
  return url.toString();
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

async function newTokens(row: {
  clientId: string;
  userId: string;
  scope: string;
  resource: string;
}) {
  const access = secret();
  const refresh = secret();
  await db.insert(oauthTokens).values({
    ...row,
    accessHash: hash(access),
    refreshHash: hash(refresh),
    accessExpiresAt: new Date(Date.now() + ACCESS_TTL),
    refreshExpiresAt: new Date(Date.now() + REFRESH_TTL),
  });
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: ACCESS_TTL / 1000,
    refresh_token: refresh,
    scope: row.scope,
  };
}

export async function exchangeCode(form: URLSearchParams) {
  const code = form.get("code") ?? "";
  // Single use: the code is deleted as it's read
  const [row] = await db
    .delete(oauthCodes)
    .where(eq(oauthCodes.codeHash, hash(code)))
    .returning();
  if (!row || row.expiresAt < new Date())
    throw new OAuthError(
      "invalid_grant",
      "The authorization code is invalid or expired.",
    );
  if (
    form.get("client_id") !== row.clientId ||
    form.get("redirect_uri") !== row.redirectUri
  )
    throw new OAuthError(
      "invalid_grant",
      "The code was issued to another app or address.",
    );
  if (!verifyPkce(form.get("code_verifier") ?? "", row.codeChallenge))
    throw new OAuthError("invalid_grant", "The PKCE verifier doesn't match.");
  return newTokens(row);
}

export async function refreshTokens(form: URLSearchParams) {
  // Rotation: the old pair is deleted as it's used
  const [row] = await db
    .delete(oauthTokens)
    .where(eq(oauthTokens.refreshHash, hash(form.get("refresh_token") ?? "")))
    .returning();
  if (!row || row.refreshExpiresAt < new Date())
    throw new OAuthError(
      "invalid_grant",
      "The refresh token is invalid or expired.",
    );
  if (form.get("client_id") && form.get("client_id") !== row.clientId)
    throw new OAuthError("invalid_grant", "The token belongs to another app.");
  return newTokens(row);
}

export async function revokeToken(token: string) {
  const h = hash(token);
  await db.delete(oauthTokens).where(eq(oauthTokens.accessHash, h));
  await db.delete(oauthTokens).where(eq(oauthTokens.refreshHash, h));
}

/** The user an MCP request acts for, from its Bearer token. */
export async function verifyAccessToken(
  token: string,
): Promise<{ viewer: Viewer; credential: string } | null> {
  const [row] = await db
    .select({
      id: oauthTokens.id,
      resource: oauthTokens.resource,
      clientName: oauthClients.name,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        image: user.image,
      },
    })
    .from(oauthTokens)
    .innerJoin(user, eq(user.id, oauthTokens.userId))
    .innerJoin(oauthClients, eq(oauthClients.id, oauthTokens.clientId))
    .where(
      and(
        eq(oauthTokens.accessHash, hash(token)),
        gt(oauthTokens.accessExpiresAt, new Date()),
      ),
    );
  if (!row || row.resource !== MCP_RESOURCE()) return null;
  await db
    .update(oauthTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(oauthTokens.id, row.id));
  return {
    viewer: { ...row.user, role: row.user.role as Role },
    credential: row.clientName,
  };
}

// ---------------------------------------------------------------------------
// Connected apps (per user)
// ---------------------------------------------------------------------------

export async function listConnectedApps(userId: string) {
  // Expired grants are cleaned up as people look at the list
  await db
    .delete(oauthTokens)
    .where(lt(oauthTokens.refreshExpiresAt, new Date()));
  return db
    .select({
      clientId: oauthClients.id,
      name: oauthClients.name,
      createdAt: oauthTokens.createdAt,
      lastUsedAt: oauthTokens.lastUsedAt,
    })
    .from(oauthTokens)
    .innerJoin(oauthClients, eq(oauthClients.id, oauthTokens.clientId))
    .where(eq(oauthTokens.userId, userId))
    .orderBy(desc(oauthTokens.createdAt));
}

export async function disconnectApp(userId: string, clientId: string) {
  await db
    .delete(oauthTokens)
    .where(
      and(eq(oauthTokens.userId, userId), eq(oauthTokens.clientId, clientId)),
    );
}
