import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateAppPassword } from "@/lib/app-passwords";
import { createMcpServer } from "@/lib/mcp/server";
import { verifyAccessToken } from "@/lib/oauth";
import { getSettings } from "@/lib/options";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { siteUrl } from "@/lib/site-url";

// The MCP endpoint: AI agents (Claude Code, Claude Desktop, ...) connect here
// with an application password. Stateless: each request gets a fresh server.

const error = (status: number, message: string, headers?: HeadersInit) =>
  Response.json(
    { jsonrpc: "2.0", error: { code: -32001, message }, id: null },
    { status, headers },
  );

async function handle(request: Request) {
  const settings = await getSettings();
  if (!settings.mcpEnabled)
    return error(403, "Agent access is turned off for this site.");

  const ip = clientIp(request.headers);
  const known = ip === "unknown" ? null : ip;
  // Bounds load and password guessing from one address
  const perIp = await rateLimit(`mcp-ip:${ip}`, 600, 60_000);
  if (!perIp.ok) return error(429, "Too many requests.");

  const header = request.headers.get("authorization");
  const auth = header?.startsWith("Bearer ")
    ? await verifyAccessToken(header.slice(7))
    : await authenticateAppPassword(header, known);
  if (!auth)
    return error(
      401,
      "Connect with OAuth, or use HTTP Basic auth with your email and an application password.",
      {
        // Tells MCP clients where to start the OAuth flow
        "WWW-Authenticate": `Bearer resource_metadata="${siteUrl("/.well-known/oauth-protected-resource/mcp")}"`,
      },
    );

  const perUser = await rateLimit(`mcp-user:${auth.viewer.id}`, 120, 60_000);
  if (!perUser.ok)
    return error(429, "Too many agent requests. Slow down and try again.", {
      "Retry-After": String(Math.ceil(perUser.retryAfterMs / 1000)),
    });

  const server = createMcpServer({
    viewer: auth.viewer,
    credential: auth.credential,
    client: request.headers.get("user-agent"),
    ip: known,
    settings,
  });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

export { handle as DELETE, handle as GET, handle as POST };
