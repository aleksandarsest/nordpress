import { timingSafeEqual } from "node:crypto";
import { runScheduledBackupIfDue } from "@/lib/backup";

// Makes the scheduled backup when it's due, for an external scheduler:
//   curl -H "Authorization: Bearer $CRON_SECRET" https://example.com/api/cron/backup
// Without it, the backup runs when an administrator opens the dashboard.
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
  const name = await runScheduledBackupIfDue();
  return Response.json(name ? { backup: name } : { skipped: "Not due." });
}
