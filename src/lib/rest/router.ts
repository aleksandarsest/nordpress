import "server-only";
import { getSettings } from "../options";
import { findRestRoute, restNamespaces } from "../plugins";
import { siteUrl } from "../site-url";
import {
  createContext,
  errorResponse,
  type RestContext,
  RestError,
  type RestResult,
  requireCap,
  toResponse,
} from "./core";
import {
  createPost,
  deletePostRoute,
  getPostRoute,
  listPosts,
  updatePost,
} from "./posts";
import {
  createCommentRoute,
  createMediaRoute,
  createTermRoute,
  deleteCommentRoute,
  deleteMediaRoute,
  deleteTermRoute,
  getCommentRoute,
  getMediaRoute,
  getSettingsRoute,
  getTermRoute,
  getUserRoute,
  listCommentsRoute,
  listMediaRoute,
  listTermsRoute,
  listUsersRoute,
  searchRoute,
  taxonomiesRoute,
  typesRoute,
  updateCommentRoute,
  updateMediaRoute,
  updateSettingsRoute,
  updateTermRoute,
} from "./resources";

type Handler = (ctx: RestContext) => Promise<RestResult> | RestResult;
type Methods = Partial<Record<"GET" | "POST" | "DELETE", Handler>>;
type Route = {
  pattern: string;
  regex: RegExp;
  keys: string[];
  methods: Methods;
};

const ID = "(?<id>\\d+)";

function route(pattern: string, methods: Methods): Route {
  const keys: string[] = [];
  const source = pattern.replace(/\(\?<(\w+)>[^)]+\)/g, (m, key) => {
    keys.push(key);
    return m;
  });
  return { pattern, regex: new RegExp(`^${source}/?$`), keys, methods };
}

const ROUTES: Route[] = [
  route("/wp/v2/posts", {
    GET: (c) => listPosts(c, "post"),
    POST: (c) => createPost(c, "post"),
  }),
  route(`/wp/v2/posts/${ID}`, {
    GET: (c) => getPostRoute(c, "post"),
    POST: (c) => updatePost(c, "post"),
    DELETE: (c) => deletePostRoute(c, "post"),
  }),
  route("/wp/v2/pages", {
    GET: (c) => listPosts(c, "page"),
    POST: (c) => createPost(c, "page"),
  }),
  route(`/wp/v2/pages/${ID}`, {
    GET: (c) => getPostRoute(c, "page"),
    POST: (c) => updatePost(c, "page"),
    DELETE: (c) => deletePostRoute(c, "page"),
  }),
  route("/wp/v2/categories", {
    GET: (c) => listTermsRoute(c, "category"),
    POST: (c) => createTermRoute(c, "category"),
  }),
  route(`/wp/v2/categories/${ID}`, {
    GET: (c) => getTermRoute(c, "category"),
    POST: (c) => updateTermRoute(c, "category"),
    DELETE: (c) => deleteTermRoute(c, "category"),
  }),
  route("/wp/v2/tags", {
    GET: (c) => listTermsRoute(c, "post_tag"),
    POST: (c) => createTermRoute(c, "post_tag"),
  }),
  route(`/wp/v2/tags/${ID}`, {
    GET: (c) => getTermRoute(c, "post_tag"),
    POST: (c) => updateTermRoute(c, "post_tag"),
    DELETE: (c) => deleteTermRoute(c, "post_tag"),
  }),
  route("/wp/v2/users", { GET: listUsersRoute }),
  route("/wp/v2/users/(?<id>[\\w-]+)", { GET: getUserRoute }),
  route("/wp/v2/media", { GET: listMediaRoute, POST: createMediaRoute }),
  route(`/wp/v2/media/${ID}`, {
    GET: getMediaRoute,
    POST: updateMediaRoute,
    DELETE: deleteMediaRoute,
  }),
  route("/wp/v2/comments", {
    GET: listCommentsRoute,
    POST: createCommentRoute,
  }),
  route(`/wp/v2/comments/${ID}`, {
    GET: getCommentRoute,
    POST: updateCommentRoute,
    DELETE: deleteCommentRoute,
  }),
  route("/wp/v2/search", { GET: searchRoute }),
  route("/wp/v2/settings", {
    GET: getSettingsRoute,
    POST: updateSettingsRoute,
  }),
  route("/wp/v2/types", { GET: typesRoute }),
  route("/wp/v2/taxonomies", { GET: taxonomiesRoute }),
];

function describeRoutes(prefix = "") {
  return Object.fromEntries(
    ROUTES.filter((r) => r.pattern.startsWith(prefix)).map((r) => [
      r.pattern.replace(/\(\?<(\w+)>[^)]+\)/g, "(?P<$1>[\\d]+)"),
      {
        namespace: "wp/v2",
        methods: Object.keys(r.methods).flatMap((m) =>
          m === "POST" && r.keys.length ? ["POST", "PUT", "PATCH"] : [m],
        ),
      },
    ]),
  );
}

async function index(path: string): Promise<RestResult> {
  if (path === "/wp/v2")
    return { data: { namespace: "wp/v2", routes: describeRoutes("/wp/v2") } };
  const settings = await getSettings();
  return {
    data: {
      name: settings.title,
      description: settings.tagline,
      url: siteUrl("/").replace(/\/$/, ""),
      home: siteUrl("/").replace(/\/$/, ""),
      timezone_string: settings.timezone,
      namespaces: ["wp/v2", ...(await restNamespaces())],
      authentication: {
        "application-passwords": {
          endpoints: { authorization: siteUrl("/admin/profile") },
        },
      },
      routes: describeRoutes(),
    },
  };
}

export async function dispatch(
  request: Request,
  segments: string[],
): Promise<Response> {
  const path = `/${segments.join("/")}`.replace(/\/+$/, "") || "/";
  // Browsers and some clients tunnel PUT/PATCH/DELETE through POST
  const override = request.headers.get("x-http-method-override")?.toUpperCase();
  let method = (override ?? request.method).toUpperCase();
  if (method === "PUT" || method === "PATCH") method = "POST";
  if (method === "HEAD") method = "GET";

  try {
    if (path === "/" || path === "/wp/v2") {
      if (method !== "GET")
        throw new RestError(
          "rest_no_route",
          "No route was found matching the URL and request method.",
          404,
        );
      return toResponse(await index(path), request);
    }
    for (const r of ROUTES) {
      const match = r.regex.exec(path);
      if (!match) continue;
      const handler = r.methods[method as keyof Methods];
      if (!handler)
        throw new RestError(
          "rest_no_route",
          "No route was found matching the URL and request method.",
          404,
        );
      const ctx = createContext(request, { ...(match.groups ?? {}) });
      return toResponse(await handler(ctx), request);
    }

    // Plugin routes live under /wp-json/<plugin-slug>/v1/...
    const [, namespace, version, ...rest] = path.split("/");
    if (namespace && version === "v1") {
      const found = await findRestRoute(
        namespace,
        method,
        `/${rest.join("/")}`,
      );
      if (found) {
        const ctx = createContext(request, found.params);
        const data = await found.route.handler({
          request,
          params: found.params,
          query: ctx.query,
          viewer: ctx.viewer,
          requireCap: (cap) => requireCap(ctx, cap),
          body: ctx.body,
        });
        return toResponse({ data }, request);
      }
    }

    throw new RestError(
      "rest_no_route",
      "No route was found matching the URL and request method.",
      404,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
