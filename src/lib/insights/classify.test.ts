import { describe, expect, it } from "vitest";
import { classifyRequest, countedPath } from "./classify";

const BROWSER =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const base = { referer: null, utmSource: null, siteHost: "example.com" };

describe("classifyRequest", () => {
  it("recognizes AI crawlers and search crawlers", () => {
    expect(
      classifyRequest({
        ...base,
        userAgent:
          "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
      }),
    ).toEqual({ source: "ai_crawler", agent: "ClaudeBot" });
    expect(
      classifyRequest({
        ...base,
        userAgent:
          "Mozilla/5.0 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)",
      }),
    ).toEqual({ source: "ai_crawler", agent: "ChatGPT-User" });
    expect(
      classifyRequest({
        ...base,
        userAgent:
          "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      }),
    ).toEqual({ source: "search_crawler", agent: "Googlebot" });
    expect(classifyRequest({ ...base, userAgent: "curl/8.7.1" }).source).toBe(
      "bot",
    );
  });

  it("credits visits from AI answers, by referrer or utm_source", () => {
    expect(
      classifyRequest({
        ...base,
        userAgent: BROWSER,
        referer: "https://chatgpt.com/",
      }),
    ).toEqual({ source: "ai_referral", agent: "ChatGPT" });
    expect(
      classifyRequest({
        ...base,
        userAgent: BROWSER,
        utmSource: "chatgpt.com",
      }),
    ).toEqual({ source: "ai_referral", agent: "ChatGPT" });
    expect(
      classifyRequest({
        ...base,
        userAgent: BROWSER,
        referer: "https://www.perplexity.ai/search/x",
      }),
    ).toEqual({ source: "ai_referral", agent: "Perplexity" });
  });

  it("sorts other visitors by where they came from", () => {
    const from = (referer: string) =>
      classifyRequest({ ...base, userAgent: BROWSER, referer });
    expect(from("https://www.google.de/")).toEqual({
      source: "search",
      agent: "Google",
    });
    expect(from("https://t.co/abc")).toEqual({ source: "social", agent: "X" });
    expect(from("https://example.com/about")).toEqual({
      source: "internal",
      agent: "",
    });
    expect(from("https://www.someblog.net/post")).toEqual({
      source: "referral",
      agent: "someblog.net",
    });
    expect(classifyRequest({ ...base, userAgent: BROWSER })).toEqual({
      source: "direct",
      agent: "",
    });
  });

  it("normalizes paths", () => {
    expect(countedPath("/about/")).toBe("/about");
    expect(countedPath("/")).toBe("/");
    expect(countedPath("/caf%C3%A9")).toBe("/café");
    expect(countedPath("/bad%E0")).toBe("/bad%E0");
  });
});
