import { findForMarkdown, postMarkdown } from "@/lib/ai-readable";
import { getSettings } from "@/lib/options";
import { siteUrl } from "@/lib/site-url";

// Serves <permalink>.md (rewritten here in next.config.ts): the post or page
// as Markdown, for AI agents and other text-first readers.
export async function GET(
  _: Request,
  { params }: RouteContext<"/markdown/[...path]">,
) {
  const settings = await getSettings();
  const found = await findForMarkdown((await params).path, settings);
  if (!found)
    return new Response("Not found\n", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  if (found.kind === "redirect")
    return new Response(null, {
      status: 308,
      headers: { Location: siteUrl(found.to) },
    });
  return new Response(await postMarkdown(found.post, settings, found.path), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      // Search engines index the HTML page, not this copy
      Link: `<${siteUrl(found.path)}>; rel="canonical"`,
    },
  });
}
