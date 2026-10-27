import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { ALLOWED_TYPES, resolveUploadPath } from "@/lib/media";

const TYPE_BY_EXT = Object.fromEntries(
  Object.entries(ALLOWED_TYPES).map(([mime, ext]) => [ext, mime]),
);

export async function GET(_: Request, ctx: RouteContext<"/uploads/[...path]">) {
  const { path: segments } = await ctx.params;
  const file = resolveUploadPath(segments);
  const type =
    TYPE_BY_EXT[segments.at(-1)?.split(".").pop()?.toLowerCase() ?? ""];
  if (!file || !type) return new Response("Not found", { status: 404 });

  try {
    const info = await stat(file);
    if (!info.isFile()) return new Response("Not found", { status: 404 });
    const body = Readable.toWeb(createReadStream(file)) as ReadableStream;
    return new Response(body, {
      headers: {
        "Content-Type": type,
        "Content-Length": String(info.size),
        // File names carry a random suffix, so they never change in place
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
