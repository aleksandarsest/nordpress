import { timingSafeEqual } from "node:crypto";
import { ALL_CACHE_TAGS, invalidate } from "@/lib/rest/core";

// Expires every cached page and query. Hosted sites share one build, made
// from an empty template site, so each one calls this when it starts to
// replace the template's cached content with its own.
//   curl -X POST -H "Authorization: Bearer $INTERNAL_TOKEN" http://localhost:3000/api/internal/refresh
export async function POST(request: Request) {
  const secret = process.env.INTERNAL_TOKEN;
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (
    !secret ||
    !given ||
    given.length !== secret.length ||
    !timingSafeEqual(Buffer.from(given), Buffer.from(secret))
  )
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  invalidate(...ALL_CACHE_TAGS);
  return Response.json({ refreshed: ALL_CACHE_TAGS });
}
