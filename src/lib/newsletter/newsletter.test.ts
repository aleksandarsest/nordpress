import { describe, expect, it } from "vitest";
import {
  emailBodyHtml,
  normalizeEmail,
  parseSubscriberList,
  renderNewsletter,
} from "./email";
import { checkSubscriberToken, subscriberToken } from "./tokens";

const absolute = (path: string) => `https://example.com${path}`;
const postUrl = "https://example.com/hello";

describe("emailBodyHtml", () => {
  it("makes links and images absolute", () => {
    const html = emailBodyHtml(
      '<p><a href="/about">About</a> <img src="/uploads/a.png" alt=""></p>',
      { postUrl, absolute },
    );
    expect(html).toContain('href="https://example.com/about"');
    expect(html).toContain('src="https://example.com/uploads/a.png"');
    expect(html).toContain("max-width:100%");
  });

  it("replaces forms and videos with links", () => {
    const html = emailBodyHtml(
      '<div data-form="3"></div><figure class="video-embed" data-video="youtube" data-id="dQw4w9WgXcQ"><iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"></iframe></figure>',
      { postUrl, absolute },
    );
    expect(html).not.toMatch(/iframe|data-form/);
    expect(html).toContain(`href="${postUrl}"`);
    expect(html).toContain("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(html).toContain("i.ytimg.com/vi/dQw4w9WgXcQ");
  });

  it("drops videos with ids it doesn't trust", () => {
    const html = emailBodyHtml(
      '<figure data-video="youtube" data-id="&quot;><script>"></figure>',
      { postUrl, absolute },
    );
    expect(html).toBe("");
  });
});

describe("renderNewsletter", () => {
  const parts = {
    siteTitle: 'Tom & "Jerry"',
    siteUrl: "https://example.com/",
    title: "Hello <world>",
    postUrl,
    bodyHtml: "<p>Body</p>",
    bodyText: "Body",
    preheader: "Preview",
    footer: "Example Ltd\n1 Main St",
    unsubscribeUrl: "https://example.com/newsletter/unsubscribe?s=1&t=x",
  };

  it("escapes text and includes the unsubscribe link", () => {
    const { html, text } = renderNewsletter(parts);
    expect(html).toContain("Hello &lt;world&gt;");
    expect(html).toContain("Tom &amp; &quot;Jerry&quot;");
    expect(html).toContain("Example Ltd<br>1 Main St");
    expect(html).toContain("s=1&amp;t=x");
    expect(text).toContain(
      "Unsubscribe: https://example.com/newsletter/unsubscribe?s=1&t=x",
    );
    expect(text).toContain("Read it on the site");
  });

  it("invites non-members to read the rest", () => {
    const { html, text } = renderNewsletter({ ...parts, teaser: true });
    expect(html).toContain("Read the rest as a member");
    expect(text).toContain("Read the rest as a member");
  });
});

describe("subscriber lists", () => {
  it("normalizes addresses", () => {
    expect(normalizeEmail("  Ana@Example.COM ")).toBe("ana@example.com");
    expect(normalizeEmail("not an email")).toBeNull();
    expect(normalizeEmail("a@b")).toBeNull();
  });

  it("parses CSV exports with headers, names and duplicates", () => {
    const { valid, invalid } = parseSubscriberList(
      'email,name\n"ana@example.com","Ana"\nbo@example.com\nANA@example.com\nbroken@\n',
    );
    expect(valid).toEqual([
      { email: "ana@example.com", name: "Ana" },
      { email: "bo@example.com", name: "" },
    ]);
    expect(invalid).toEqual(["broken@"]);
  });
});

describe("subscriber tokens", () => {
  it("are tied to the subscriber and the purpose", () => {
    const t = subscriberToken("secret", 7, "unsubscribe");
    expect(checkSubscriberToken("secret", 7, "unsubscribe", t)).toBe(true);
    expect(checkSubscriberToken("secret", 8, "unsubscribe", t)).toBe(false);
    expect(checkSubscriberToken("secret", 7, "confirm", t)).toBe(false);
    expect(checkSubscriberToken("other", 7, "unsubscribe", t)).toBe(false);
    expect(checkSubscriberToken("secret", 7, "unsubscribe", "short")).toBe(
      false,
    );
  });
});
