import { type IncomingMessage, request, type ServerResponse } from "node:http";
import { resourceNames } from "./names.ts";

// Forwards a request for name.<domain> to that site's container, streaming
// both ways (uploads, downloads, the AI assistant's streamed answers).

// Hop-by-hop headers belong to one connection, not to the request
const HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

export function proxyToSite(
  sub: string,
  req: IncomingMessage,
  res: ServerResponse,
) {
  const headers: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(req.headers))
    if (value !== undefined && !HOP.has(key)) headers[key] = value;
  // nginx in front sets the client address and https; pass them on
  headers["x-forwarded-host"] = req.headers.host ?? "";
  headers["x-forwarded-proto"] =
    (req.headers["x-forwarded-proto"] as string) ?? "https";

  const upstream = request(
    {
      host: resourceNames(sub).container,
      port: 3000,
      method: req.method,
      path: req.url,
      headers,
      timeout: 300_000,
    },
    (answer) => {
      const out: Record<string, string | string[]> = {};
      for (const [key, value] of Object.entries(answer.headers))
        if (value !== undefined && !HOP.has(key)) out[key] = value;
      res.writeHead(answer.statusCode ?? 502, out);
      answer.pipe(res);
    },
  );
  upstream.on("timeout", () => upstream.destroy(new Error("timeout")));
  upstream.on("error", () => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.writeHead(502, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      '<!doctype html><title>Starting</title><p style="font:16px system-ui;margin:4rem auto;max-width:30rem">This site is starting up or restarting. Try again in a minute.</p>',
    );
  });
  req.pipe(upstream);
}
