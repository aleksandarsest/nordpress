// Sorts a request into where it came from, for the Insights counts. Pure.

export type TrafficSource =
  | "ai_crawler"
  | "search_crawler"
  | "bot"
  | "ai_referral"
  | "search"
  | "social"
  | "referral"
  | "internal"
  | "direct";

// User-agent tokens of AI crawlers and assistants fetching pages
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Perplexity-User",
  "CCBot",
  "meta-externalagent",
  "meta-externalfetcher",
  "Bytespider",
  "Amazonbot",
  "DuckAssistBot",
  "MistralAI-User",
  "cohere-ai",
  "AI2Bot",
  "YouBot",
  "Diffbot",
];

const SEARCH_CRAWLERS = [
  "Googlebot",
  "bingbot",
  "DuckDuckBot",
  "YandexBot",
  "Baiduspider",
  "Applebot",
];

// Referrers: AI assistants that link to their sources
const AI_REFERRERS: [RegExp, string][] = [
  [/(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/, "ChatGPT"],
  [/(^|\.)claude\.ai$/, "Claude"],
  [/(^|\.)perplexity\.ai$/, "Perplexity"],
  [/^gemini\.google\.com$/, "Gemini"],
  [/^copilot\.microsoft\.com$/, "Copilot"],
  [/^chat\.mistral\.ai$/, "Le Chat"],
  [/(^|\.)you\.com$/, "You.com"],
  [/(^|\.)phind\.com$/, "Phind"],
  [/(^|\.)poe\.com$/, "Poe"],
];

const SEARCH_REFERRERS: [RegExp, string][] = [
  [/(^|\.)google\.[a-z.]+$/, "Google"],
  [/(^|\.)bing\.com$/, "Bing"],
  [/(^|\.)duckduckgo\.com$/, "DuckDuckGo"],
  [/^search\.brave\.com$/, "Brave"],
  [/(^|\.)ecosia\.org$/, "Ecosia"],
  [/(^|\.)yahoo\.com$/, "Yahoo"],
  [/(^|\.)yandex\.[a-z]+$/, "Yandex"],
  [/(^|\.)baidu\.com$/, "Baidu"],
  [/(^|\.)kagi\.com$/, "Kagi"],
];

const SOCIAL_REFERRERS: [RegExp, string][] = [
  [/(^|\.)facebook\.com$|^l\.facebook\.com$/, "Facebook"],
  [/^t\.co$|(^|\.)x\.com$|(^|\.)twitter\.com$/, "X"],
  [/(^|\.)linkedin\.com$|^lnkd\.in$/, "LinkedIn"],
  [/(^|\.)reddit\.com$/, "Reddit"],
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)youtube\.com$/, "YouTube"],
  [/(^|\.)threads\.(net|com)$/, "Threads"],
  [/^bsky\.app$/, "Bluesky"],
  [/(^|\.)news\.ycombinator\.com$/, "Hacker News"],
];

const GENERIC_BOT =
  /bot|crawl|spider|slurp|fetch|curl|wget|python|httpclient|headless|monitor/i;

const match = (host: string, list: [RegExp, string][]) =>
  list.find(([re]) => re.test(host))?.[1];

export function classifyRequest(input: {
  userAgent: string;
  referer: string | null;
  /** Value of utm_source, which some assistants add to links. */
  utmSource: string | null;
  siteHost: string;
}): { source: TrafficSource; agent: string } {
  const ua = input.userAgent;
  const lower = ua.toLowerCase();
  const crawler = AI_CRAWLERS.find((name) =>
    lower.includes(name.toLowerCase()),
  );
  if (crawler) return { source: "ai_crawler", agent: crawler };
  const search = SEARCH_CRAWLERS.find((name) =>
    lower.includes(name.toLowerCase()),
  );
  if (search) return { source: "search_crawler", agent: search };
  if (!ua || GENERIC_BOT.test(ua)) return { source: "bot", agent: "" };

  const utm = input.utmSource?.toLowerCase() ?? "";
  const viaUtm = utm && match(utm, AI_REFERRERS);
  if (viaUtm) return { source: "ai_referral", agent: viaUtm };

  let host = "";
  try {
    host = input.referer ? new URL(input.referer).hostname.toLowerCase() : "";
  } catch {
    host = "";
  }
  if (!host) return { source: "direct", agent: "" };
  if (host === input.siteHost.toLowerCase())
    return { source: "internal", agent: "" };
  const ai = match(host, AI_REFERRERS);
  if (ai) return { source: "ai_referral", agent: ai };
  const engine = match(host, SEARCH_REFERRERS);
  if (engine) return { source: "search", agent: engine };
  const social = match(host, SOCIAL_REFERRERS);
  if (social) return { source: "social", agent: social };
  return {
    source: "referral",
    agent: host.replace(/^www\./, "").slice(0, 100),
  };
}

/** Normalizes a path for counting: no query, no trailing slash, capped length. */
export function countedPath(pathname: string) {
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // Malformed escapes are counted as sent
  }
  const path = decoded.replace(/\/+$/, "") || "/";
  return path.slice(0, 300);
}
