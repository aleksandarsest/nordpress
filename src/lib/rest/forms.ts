import "server-only";
import {
  getForm,
  getPublicForm,
  listForms,
  listSubmissions,
  submitForm,
} from "../forms";
import { formJsonSchema } from "../forms/fields";
import { siteUrl } from "../site-url";
import {
  intParam,
  notFound,
  pagination,
  type RestContext,
  RestError,
  type RestResult,
  requireCap,
} from "./core";

// Forms for agents and other apps: anyone may read an open form's schema
// and submit it; responses need the same capability as the admin screens.
const CAP = "edit_others_pages";

function describe(
  form: NonNullable<Awaited<ReturnType<typeof getPublicForm>>>,
) {
  return {
    id: form.id,
    title: form.title,
    open: form.settings.open,
    fields: form.fields,
    schema: formJsonSchema(form.fields),
    submit: {
      method: "POST",
      url: siteUrl(`/wp-json/nordpress/v1/forms/${form.id}/submissions`),
      content_type: "application/json",
    },
  };
}

export async function listFormsRoute(ctx: RestContext): Promise<RestResult> {
  await requireCap(ctx, CAP);
  const forms = await listForms();
  return {
    data: forms.map((f) => ({
      id: f.id,
      title: f.title,
      open: f.settings.open,
      responses: f.total,
      unread: f.unread,
    })),
  };
}

export async function getFormRoute(ctx: RestContext): Promise<RestResult> {
  const form = await getPublicForm(intParam(ctx.params.id, "id") ?? 0);
  if (!form) throw notFound("rest_form_invalid_id", "Invalid form ID.");
  return { data: describe(form) };
}

export async function submitFormRoute(ctx: RestContext): Promise<RestResult> {
  const id = intParam(ctx.params.id, "id") ?? 0;
  const body = await ctx.body();
  const result = await submitForm(
    id,
    (key) => {
      const v = body[key];
      if (v === undefined || v === null) return [];
      return (Array.isArray(v) ? v : [v]).map(String);
    },
    {
      ip: ctx.ip,
      userAgent: ctx.request.headers.get("user-agent"),
      source: "api",
    },
  );
  if (!result.ok) {
    const status = result.fieldErrors
      ? 400
      : result.error.startsWith("Too many")
        ? 429
        : 403;
    throw new RestError(
      result.fieldErrors ? "rest_invalid_param" : "rest_form_rejected",
      result.error,
      status,
      result.fieldErrors ? { params: result.fieldErrors } : undefined,
    );
  }
  return { data: { submitted: true, message: result.message }, status: 201 };
}

export async function listSubmissionsRoute(
  ctx: RestContext,
): Promise<RestResult> {
  await requireCap(ctx, CAP);
  const form = await getForm(intParam(ctx.params.id, "id") ?? 0);
  if (!form) throw notFound("rest_form_invalid_id", "Invalid form ID.");
  const { page, perPage } = pagination(ctx.query);
  const status = ctx.query.get("status");
  const result = await listSubmissions(form.id, {
    status:
      status === "new" || status === "read" || status === "spam"
        ? status
        : "inbox",
    page,
    perPage,
  });
  return {
    data: result.items.map((s) => ({
      id: s.id,
      date_gmt: s.createdAt.toISOString(),
      status: s.status,
      source: s.source,
      data: s.data,
      ai_summary: s.aiSummary,
      ai_spam_reason: s.aiSpamReason,
    })),
    total: result.total,
    pages: result.pages,
  };
}
