import { authorizationServerMetadata } from "@/lib/oauth";

// RFC 8414 authorization server metadata, for MCP clients.
export async function GET() {
  return Response.json(authorizationServerMetadata(), {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
