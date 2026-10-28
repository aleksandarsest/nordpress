import { confirmSubscription } from "@/lib/newsletter";
import { siteUrl } from "@/lib/site-url";

// The link in the confirmation email
export async function GET(request: Request) {
  const url = new URL(request.url);
  const ok = await confirmSubscription(
    Number(url.searchParams.get("s")) || 0,
    url.searchParams.get("t") ?? "",
  );
  return Response.redirect(
    siteUrl(ok ? "/newsletter?confirmed=1" : "/newsletter?invalid=1"),
    303,
  );
}
