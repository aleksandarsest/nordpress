import { robotsTxt } from "@/lib/ai-readable";
import { getSettings } from "@/lib/options";

// A route rather than robots.ts, which can't express Content-Signal lines.
export async function GET() {
  return new Response(robotsTxt(await getSettings()), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
