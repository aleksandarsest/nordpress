import { OAuthError, registerClient } from "@/lib/oauth";
import { getSettings } from "@/lib/options";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const CORS = { "Access-Control-Allow-Origin": "*" };

// RFC 7591 dynamic client registration: MCP clients register themselves.
// Registering grants nothing; a person still has to approve each connection.
export async function POST(request: Request) {
  if (!(await getSettings()).mcpEnabled)
    return Response.json(
      { error: "access_denied" },
      { status: 403, headers: CORS },
    );
  const limit = await rateLimit(
    `oauth-register:${clientIp(request.headers)}`,
    20,
    60 * 60 * 1000,
  );
  if (!limit.ok)
    return Response.json(
      { error: "slow_down" },
      { status: 429, headers: CORS },
    );
  try {
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const client = await registerClient(body);
    return Response.json(
      {
        client_id: client.id,
        client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
        client_name: client.name,
        redirect_uris: client.redirectUris,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      },
      { status: 201, headers: CORS },
    );
  } catch (error) {
    if (error instanceof OAuthError)
      return Response.json(
        { error: error.code, error_description: error.message },
        { status: 400, headers: CORS },
      );
    throw error;
  }
}

export function OPTIONS() {
  return new Response(null, {
    headers: {
      ...CORS,
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
