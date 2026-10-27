import { createHmac } from "node:crypto";
import { definePlugin } from "@/lib/plugins/types";

export function signPayload(body: string, secret: string) {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

export default definePlugin({
  slug: "webhooks",
  name: "Webhooks",
  version: "1.0.0",
  description:
    "Notifies another service (Zapier, Slack, a build hook, ...) when a post is published or a comment arrives.",
  author: "Nordpress",
  settings: [
    {
      type: "url",
      key: "url",
      label: "Webhook URL",
      help: "Must use https://",
      default: "",
    },
    {
      type: "text",
      key: "secret",
      label: "Signing secret",
      help: "Optional. Requests then carry an X-Nordpress-Signature header (HMAC-SHA256 of the body).",
      default: "",
    },
    {
      type: "checkbox",
      key: "onPublish",
      label: "When a post or page is published",
      default: true,
    },
    {
      type: "checkbox",
      key: "onComment",
      label: "When a comment is submitted",
      default: false,
    },
  ],
  register(api) {
    async function send(event: string, data: unknown) {
      const settings = await api.settings();
      const url = String(settings.url ?? "");
      if (!url.startsWith("https://")) return;
      const body = JSON.stringify({
        event,
        data,
        sentAt: new Date().toISOString(),
      });
      // After the response, so a slow endpoint never delays publishing
      api.defer(async () => {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "Nordpress-Webhooks/1.0",
            ...(settings.secret
              ? {
                  "X-Nordpress-Signature": signPayload(
                    body,
                    String(settings.secret),
                  ),
                }
              : {}),
          },
          body,
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) api.log(`${event} webhook returned ${res.status}`);
      });
    }

    api.addAction(
      "post.saved",
      async ({ post, previousStatus, url, source }) => {
        if (!(await api.settings()).onPublish) return;
        // Only the moment content goes live, not every later edit
        if (post.status !== "publish" || previousStatus === "publish") return;
        // Imported content was published long ago; don't announce it again
        if (source === "import") return;
        await send("post.published", {
          id: post.id,
          type: post.type,
          title: post.title,
          url,
        });
      },
    );

    api.addAction("comment.created", async (comment) => {
      if (!(await api.settings()).onComment) return;
      await send("comment.created", {
        id: comment.id,
        postId: comment.postId,
        author: comment.authorName,
        status: comment.status,
        content: comment.content,
      });
    });
  },
});
