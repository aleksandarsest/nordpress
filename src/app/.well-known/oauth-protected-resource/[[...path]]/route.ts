import { protectedResourceMetadata } from "@/lib/oauth";

// RFC 9728: where MCP clients learn how to get a token for /mcp. Served at
// both /.well-known/oauth-protected-resource and .../mcp.
export async function GET() {
  return Response.json(protectedResourceMetadata(), {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
