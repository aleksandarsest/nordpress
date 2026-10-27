import { timingSafeEqual } from "node:crypto";
import { runSiteChecks } from "@/lib/inbox";
import { getSettings } from "@/lib/options";

// For an external scheduler (system cron, Vercel Cron, GitHub Actions):
//   curl -H "Authorization: Bearer $CRON_SECRET" https://example.com/api/cron/site-checks
// Without it, checks still run daily when an administrator opens the dashboard.
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
  if (!(await getSettings()).inboxEnabled)
    return Response.json({ skipped: "Inbox checks are turned off." });
  return Response.json(await runSiteChecks());
}
