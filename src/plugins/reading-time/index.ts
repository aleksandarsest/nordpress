import { escapeHtml } from "@/lib/plugins/shortcodes";
import { definePlugin } from "@/lib/plugins/types";

export function readingMinutes(text: string, wordsPerMinute: number) {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / Math.max(50, wordsPerMinute)));
}

export default definePlugin({
  slug: "reading-time",
  name: "Reading Time",
  version: "1.0.0",
  description:
    "Shows an estimated reading time at the top of posts, or wherever you write [reading_time]. A small example of a content filter, a shortcode, plugin settings and a REST route.",
  author: "Nordpress",
  settings: [
    {
      type: "number",
      key: "wordsPerMinute",
      label: "Reading speed (words per minute)",
      default: 225,
      min: 50,
      max: 1000,
    },
    {
      type: "checkbox",
      key: "pages",
      label: "Show on pages too",
      default: false,
    },
  ],
  rest: [
    {
      // GET /wp-json/reading-time/v1/estimate?text=...
      method: "GET",
      path: "/estimate",
      handler: async ({ query }) => {
        const text = query.get("text") ?? "";
        return { minutes: readingMinutes(text, 225) };
      },
    },
  ],
  register(api) {
    api.addFilter("post.contentHtml", async (html, { post }) => {
      const settings = await api.settings();
      if (post.type === "page" && !settings.pages) return html;
      if (post.type !== "post" && post.type !== "page") return html;
      const minutes = readingMinutes(
        post.contentText,
        Number(settings.wordsPerMinute),
      );
      return `<p class="reading-time"><em>${minutes} min read</em></p>${html}`;
    });

    // [reading_time] or [reading_time label="Reading time:"], anywhere in a post
    api.addShortcode("reading_time", async (attrs, _content, { post }) => {
      const settings = await api.settings();
      const minutes = readingMinutes(
        post.contentText,
        Number(settings.wordsPerMinute),
      );
      const label = attrs.label ? `${escapeHtml(attrs.label)} ` : "";
      return `<span class="reading-time">${label}${minutes} min</span>`;
    });
  },
});
