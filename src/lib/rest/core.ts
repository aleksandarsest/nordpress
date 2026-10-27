import "server-only";
import { revalidateTag } from "next/cache";
import { authenticateBasic } from "../app-passwords";
import { type Capability, hasCap } from "../capabilities";
import { formatInZone } from "../dates";
import { getViewer, type Viewer } from "../session";

// WordPress-shaped error: { code, message, data: { status } }
export class RestError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export const forbidden = (message = "Sorry, you are not allowed to do that.") =>
  new RestError("rest_forbidden", message, 403);

export const notFound = (code = "rest_not_found", message = "Not found.") =>
  new RestError(code, message, 404);

export type RestContext = {
  request: Request;
  method: string;
  params: Record<string, string>;
  query: URLSearchParams;
  ip: string | null;
  /** Resolved lazily: application password first, then a same-origin session. */
  viewer: () => Promise<Viewer | null>;
  body: () => Promise<Record<string, unknown>>;
};

export function createContext(
  request: Request,
  params: Record<string, string>,
): RestContext {
  const url = new URL(request.url);
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  let viewerPromise: Promise<Viewer | null> | undefined;
  let bodyPromise: Promise<Record<string, unknown>> | undefined;

  return {
    request,
    method: request.method.toUpperCase(),
    params,
    query: url.searchParams,
    ip,
    viewer: () => {
      viewerPromise ??= resolveViewer(request, ip);
      return viewerPromise;
    },
    body: () => {
      bodyPromise ??= readBody(request, url.searchParams);
      return bodyPromise;
    },
  };
}

async function resolveViewer(request: Request, ip: string | null) {
  const header = request.headers.get("authorization");
  if (header) {
    const viewer = await authenticateBasic(header, ip);
    if (!viewer) {
      throw new RestError(
        "incorrect_password",
        "The provided password is an invalid application password.",
        401,
      );
    }
    return viewer;
  }
  // Cookie sessions count only for safe methods or same-origin requests,
  // which keeps other sites from making writes with a visitor's cookies.
  const safe = request.method === "GET" || request.method === "HEAD";
  const site = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");
  const sameOrigin =
    site === "same-origin" ||
    (origin !== null && origin === new URL(request.url).origin);
  if (!safe && !sameOrigin) return null;
  return getViewer();
}

async function readBody(request: Request, query: URLSearchParams) {
  const type = request.headers.get("content-type") ?? "";
  const fromQuery = Object.fromEntries(query);
  if (request.method === "GET" || request.method === "HEAD") return fromQuery;
  if (type.includes("application/json")) {
    try {
      const parsed = await request.json();
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        return { ...fromQuery, ...parsed };
    } catch {
      throw new RestError(
        "rest_invalid_json",
        "Invalid JSON body passed.",
        400,
      );
    }
    throw new RestError(
      "rest_invalid_json",
      "The JSON body must be an object.",
      400,
    );
  }
  if (type.includes("form")) {
    const form = await request.formData();
    const out: Record<string, unknown> = { ...fromQuery };
    for (const key of new Set(form.keys())) {
      const values = form.getAll(key);
      const name = key.endsWith("[]") ? key.slice(0, -2) : key;
      out[name] = key.endsWith("[]") || values.length > 1 ? values : values[0];
    }
    return out;
  }
  return fromQuery;
}

export async function requireCap(ctx: RestContext, cap: Capability) {
  const viewer = await ctx.viewer();
  if (!viewer)
    throw new RestError(
      "rest_not_logged_in",
      "You are not currently logged in.",
      401,
    );
  if (!hasCap(viewer, cap)) throw forbidden();
  return viewer;
}

// ---------------------------------------------------------------------------
// Parameter parsing
// ---------------------------------------------------------------------------

export function intParam(
  value: unknown,
  name: string,
  fallback?: number,
): number | undefined {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n))
    throw new RestError(
      "rest_invalid_param",
      `Invalid parameter(s): ${name}`,
      400,
    );
  return n;
}

export function idList(value: unknown, name: string): number[] | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parts = Array.isArray(value) ? value : String(value).split(",");
  return parts.map((p) => {
    const n = Number(String(p).trim());
    if (!Number.isInteger(n) || n < 0)
      throw new RestError(
        "rest_invalid_param",
        `Invalid parameter(s): ${name}`,
        400,
      );
    return n;
  });
}

export function stringList(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parts = Array.isArray(value) ? value : String(value).split(",");
  return parts.map((p) => String(p).trim()).filter(Boolean);
}

export function pagination(query: URLSearchParams, defaultPerPage = 10) {
  const page = intParam(query.get("page"), "page", 1) ?? 1;
  const perPage =
    intParam(query.get("per_page"), "per_page", defaultPerPage) ??
    defaultPerPage;
  if (page < 1)
    throw new RestError(
      "rest_invalid_param",
      "Invalid parameter(s): page",
      400,
    );
  if (perPage < 1 || perPage > 100) {
    throw new RestError(
      "rest_invalid_param",
      "Invalid parameter(s): per_page (must be between 1 and 100)",
      400,
    );
  }
  return { page, perPage, offset: (page - 1) * perPage };
}

// Accepts either "text" or WordPress's { raw: "text" } shape.
export function rawText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "object" && "raw" in (value as object))
    return String((value as { raw: unknown }).raw ?? "");
  return String(value);
}

export function boolParam(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export type RestResult = {
  data: unknown;
  status?: number;
  total?: number;
  pages?: number;
};

export function wpDates(date: Date | null, timeZone: string) {
  if (!date) return { local: null, gmt: null };
  return {
    local: formatInZone(date, timeZone, "yyyy-MM-dd'T'HH:mm:ss"),
    gmt: date.toISOString().slice(0, 19),
  };
}

// Keeps only the requested top-level keys (WordPress's `_fields`).
export function pickFields(data: unknown, fields: string | null): unknown {
  if (!fields) return data;
  const keys = new Set(
    fields
      .split(",")
      .map((f) => f.trim().split(".")[0])
      .filter(Boolean),
  );
  const pick = (item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).filter(([k]) => keys.has(k)))
      : item;
  return Array.isArray(data) ? data.map(pick) : pick(data);
}

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, Content-Disposition, X-WP-Nonce",
  "Access-Control-Expose-Headers": "X-WP-Total, X-WP-TotalPages, Link",
};

export function toResponse(result: RestResult, request: Request): Response {
  const url = new URL(request.url);
  const headers = new Headers({
    ...CORS_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
  });
  if (result.total !== undefined)
    headers.set("X-WP-Total", String(result.total));
  if (result.pages !== undefined) {
    headers.set("X-WP-TotalPages", String(result.pages));
    const page = Number(url.searchParams.get("page") ?? 1);
    const links: string[] = [];
    const at = (p: number) => {
      const next = new URL(url);
      next.searchParams.set("page", String(p));
      return next.toString();
    };
    if (page > 1) links.push(`<${at(page - 1)}>; rel="prev"`);
    if (page < result.pages) links.push(`<${at(page + 1)}>; rel="next"`);
    if (links.length) headers.set("Link", links.join(", "));
  }
  const body = pickFields(result.data, url.searchParams.get("_fields"));
  return new Response(JSON.stringify(body), {
    status: result.status ?? 200,
    headers,
  });
}

export function errorResponse(error: unknown): Response {
  const err =
    error instanceof RestError
      ? error
      : error instanceof Error && error.name === "ZodError"
        ? new RestError("rest_invalid_param", error.message, 400)
        : null;
  if (!err) console.error("[rest]", error);
  const status = err?.status ?? 500;
  const body = {
    code: err?.code ?? "internal_server_error",
    message: err?.message ?? "There has been a critical error on this website.",
    data: { status },
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

// Route handlers can't use updateTag (Server Actions only); expiring the tag
// immediately gives API clients the same read-your-own-writes behavior.
export function invalidate(...tags: string[]) {
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
}
