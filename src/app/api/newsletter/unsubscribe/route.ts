import { unsubscribe } from "@/lib/newsletter";
import { siteUrl } from "@/lib/site-url";

// One-click unsubscribe from the mail app's own button (RFC 8058): it POSTs
// here. Opened in a browser instead, it asks first.
export async function POST(request: Request) {
  const url = new URL(request.url);
  const ok = await unsubscribe(
    Number(url.searchParams.get("s")) || 0,
    url.searchParams.get("t") ?? "",
  );
  return ok
    ? new Response("Unsubscribed.", { status: 200 })
    : new Response("This link is not valid.", { status: 400 });
}

export function GET(request: Request) {
  const url = new URL(request.url);
  return Response.redirect(
    siteUrl(`/newsletter/unsubscribe${url.search}`),
    303,
  );
}
