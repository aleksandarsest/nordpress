import { timingSafeEqual } from "node:crypto";
import { processNewsletters } from "@/lib/newsletter";

// Sends due newsletters, including posts scheduled to go out by email, for
// an external scheduler (every few minutes):
//   curl -H "Authorization: Bearer $CRON_SECRET" https://example.com/api/cron/newsletter
// Without it, sending also starts after each save and admin visit.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (
    !secret ||
    !given ||
    given.length !== secret.length ||
    !timingSafeEqual(Buffer.from(given), Buffer.from(secret))
  )
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  return Response.json(await processNewsletters(50_000));
}
