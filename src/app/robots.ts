import type { MetadataRoute } from "next";
import { getSettings } from "@/lib/options";
import { siteUrl } from "@/lib/site-url";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const settings = await getSettings();
  if (!settings.blogPublic) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/"] },
    sitemap: siteUrl("/sitemap.xml"),
  };
}
