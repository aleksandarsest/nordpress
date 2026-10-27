import { exchangeCode, OAuthError, refreshTokens } from "@/lib/oauth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
};

export async function POST(request: Request) {
  const limit = await rateLimit(
    `oauth-token:${clientIp(request.headers)}`,
    60,
    60 * 1000,
  );
  if (!limit.ok)
    return Response.json(
      { error: "slow_down" },
      { status: 429, headers: HEADERS },
    );
  const form = new URLSearchParams(await request.text());
  try {
    const grant = form.get("grant_type");
    const tokens =
      grant === "authorization_code"
        ? await exchangeCode(form)
        : grant === "refresh_token"
          ? await refreshTokens(form)
          : null;
    if (!tokens)
      return Response.json(
        { error: "unsupported_grant_type" },
        { status: 400, headers: HEADERS },
      );
    return Response.json(tokens, { headers: HEADERS });
  } catch (error) {
    if (error instanceof OAuthError)
      return Response.json(
        { error: error.code, error_description: error.message },
        { status: error.status, headers: HEADERS },
      );
    throw error;
  }
}

export function OPTIONS() {
  return new Response(null, {
    headers: {
      ...HEADERS,
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
