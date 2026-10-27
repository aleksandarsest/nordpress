import { ALLOWED_TYPES } from "@/lib/media";
import { safeKey, storage } from "@/lib/storage";

const TYPE_BY_EXT = Object.fromEntries(
  Object.entries(ALLOWED_TYPES).map(([mime, ext]) => [ext, mime]),
);

// Serves uploaded files from whichever storage driver is configured, so media
// URLs stay the same whether files live on disk or in a bucket.
export async function GET(_: Request, ctx: RouteContext<"/uploads/[...path]">) {
  const { path: segments } = await ctx.params;
  const key = safeKey(segments);
  const type =
    TYPE_BY_EXT[segments.at(-1)?.split(".").pop()?.toLowerCase() ?? ""];
  if (!key || !type) return new Response("Not found", { status: 404 });

  const file = await storage().get(key);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(file.body, {
    headers: {
      "Content-Type": type,
      ...(file.size ? { "Content-Length": String(file.size) } : {}),
      // File names carry a random suffix, so they never change in place
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
