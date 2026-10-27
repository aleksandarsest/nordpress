import { definePlugin } from "@/lib/plugins/types";

export function findBlockedTerm(haystack: string, list: string) {
  const text = haystack.toLowerCase();
  return list
    .split("\n")
    .map((t) => t.trim().toLowerCase())
    .find((term) => term && text.includes(term));
}

export default definePlugin({
  slug: "comment-blocklist",
  name: "Comment Blocklist",
  version: "1.0.0",
  description:
    "Holds or rejects comments containing words, emails, links or IP addresses you list, like WordPress's disallowed comment keys.",
  author: "Nordpress",
  settings: [
    {
      type: "textarea",
      key: "moderate",
      label: "Hold for moderation",
      help: "One word, email, URL or IP per line. Matching comments wait for approval.",
      rows: 5,
      default: "",
    },
    {
      type: "textarea",
      key: "block",
      label: "Mark as spam",
      help: "One per line. Matching comments go straight to spam.",
      rows: 5,
      default: "",
    },
  ],
  register(api) {
    api.addFilter("comment.status", async (status, comment) => {
      const settings = await api.settings();
      const haystack = [
        comment.content,
        comment.authorName,
        comment.authorEmail,
        comment.authorUrl,
        comment.ip ?? "",
      ].join("\n");
      if (findBlockedTerm(haystack, String(settings.block ?? "")))
        return "spam";
      if (
        status === "approved" &&
        findBlockedTerm(haystack, String(settings.moderate ?? ""))
      )
        return "pending";
      return status;
    });
  },
});
