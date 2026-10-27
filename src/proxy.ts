import {
  type NextFetchEvent,
  type NextRequest,
  NextResponse,
} from "next/server";
import { recordHit } from "@/lib/insights";
import { classifyRequest, countedPath } from "@/lib/insights/classify";

// Counts page views for Insights, including AI crawlers reading the site.
// Nothing about the visitor is stored: only daily counts per page and source.
export function proxy(request: NextRequest, event: NextFetchEvent) {
  const h = request.headers;
  const skip =
    request.method !== "GET" ||
    // Client-side navigation and prefetches aren't new page views (visible
    // here thanks to skipProxyUrlNormalize in next.config.ts)
    h.has("rsc") ||
    request.nextUrl.searchParams.has("_rsc") ||
    h.has("next-router-prefetch") ||
    h.get("purpose") === "prefetch" ||
    h.get("sec-purpose")?.includes("prefetch") ||
    // People signed in to the admin are the site's own team
    request.cookies.has("better-auth.session_token") ||
    request.cookies.has("__Secure-better-auth.session_token");
  if (!skip) {
    const hit = classifyRequest({
      userAgent: h.get("user-agent") ?? "",
      referer: h.get("referer"),
      utmSource: request.nextUrl.searchParams.get("utm_source"),
      siteHost: request.nextUrl.hostname,
    });
    event.waitUntil(
      recordHit({ ...hit, path: countedPath(request.nextUrl.pathname) }).catch(
        (error) => console.error("[insights] failed to count a visit", error),
      ),
    );
  }
  return NextResponse.next();
}

export const config = {
  // Pages, Markdown copies and llms.txt; not assets, the admin or APIs
  matcher: [
    "/((?!_next/|api/|admin|wp-json|mcp|oauth/|\\.well-known/|uploads/|favicon|robots\\.txt|sitemap\\.xml|feed|login|register|install|forgot-password|reset-password|preview/|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|css|js|map|woff2?|xml|json)$).*)",
  ],
};
