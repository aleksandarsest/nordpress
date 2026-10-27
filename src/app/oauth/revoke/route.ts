import { revokeToken } from "@/lib/oauth";

// RFC 7009: always 200, whether or not the token existed.
export async function POST(request: Request) {
  const form = new URLSearchParams(await request.text());
  const token = form.get("token");
  if (token) await revokeToken(token);
  return new Response(null, {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
