import { CORS_HEADERS } from "@/lib/rest/core";
import { dispatch } from "@/lib/rest/router";

type Ctx = RouteContext<"/wp-json/[[...route]]">;

async function handle(request: Request, ctx: Ctx) {
  const { route = [] } = await ctx.params;
  return dispatch(request, route);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
