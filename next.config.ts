import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Crawlers in this list get fully rendered pages, so missing content gets a
  // real 404 and old URLs a real 308 instead of a streamed fallback. This is
  // Next.js's default list (shared/lib/router/utils/html-bots) plus Googlebot.
  htmlLimitedBots:
    /Googlebot|[\w-]+-Google|Google-[\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight/i,
  partialPrefetching: true,
  reactCompiler: true,
  images: {
    // Only uploaded media may be resized, and never with a query string
    localPatterns: [{ pathname: "/uploads/**", search: "" }],
    formats: ["image/avif", "image/webp"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
