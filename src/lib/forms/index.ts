import "server-only";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { after } from "next/server";
import { db } from "@/db";
import {
  type Form,
  type FormSubmission,
  formSubmissions,
  forms,
  type SubmissionStatus,
} from "@/db/schema";
import { triageSubmission } from "../ai/forms";
import { sendMail } from "../mail";
import { getSettings } from "../options";
import { doAction } from "../plugins";
import { rateLimit } from "../rate-limit";
import {
  DEFAULT_FORM_SETTINGS,
  type FormField,
  type FormSettings,
  normalizeFields,
  normalizeSettings,
  type SubmissionData,
  validateSubmission,
} from "./fields";

export const FORMS_TAG = "forms";

export class FormError extends Error {}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function listForms() {
  const rows = await db
    .select({
      id: forms.id,
      title: forms.title,
      fields: forms.fields,
      settings: forms.settings,
      updatedAt: forms.updatedAt,
      total: count(formSubmissions.id),
      unread: count(
        sql`case when ${formSubmissions.status} = 'new' then 1 end`,
      ),
    })
    .from(forms)
    .leftJoin(formSubmissions, eq(formSubmissions.formId, forms.id))
    .groupBy(forms.id)
    .orderBy(desc(forms.updatedAt));
  return rows;
}

export async function getForm(id: number): Promise<Form | null> {
  const [form] = await db.select().from(forms).where(eq(forms.id, id));
  return form ?? null;
}

export async function createForm(input: {
  title: string;
  fields?: unknown;
  settings?: unknown;
}) {
  const title = input.title.trim().slice(0, 200);
  if (!title) throw new FormError("Give the form a name.");
  const [form] = await db
    .insert(forms)
    .values({
      title,
      fields: input.fields === undefined ? [] : normalizeFields(input.fields),
      settings: normalizeSettings(input.settings ?? DEFAULT_FORM_SETTINGS),
    })
    .returning();
  return form;
}

export async function updateForm(
  id: number,
  input: { title: string; fields: unknown; settings: unknown },
) {
  const title = input.title.trim().slice(0, 200);
  if (!title) throw new FormError("Give the form a name.");
  const [form] = await db
    .update(forms)
    .set({
      title,
      fields: normalizeFields(input.fields),
      settings: normalizeSettings(input.settings),
      updatedAt: new Date(),
    })
    .where(eq(forms.id, id))
    .returning();
  if (!form) throw new FormError("That form no longer exists.");
  return form;
}

export async function deleteForm(id: number) {
  await db.delete(forms).where(eq(forms.id, id));
}

export async function listSubmissions(
  formId: number,
  opts: {
    status?: SubmissionStatus | "inbox";
    page?: number;
    perPage?: number;
  },
) {
  const perPage = opts.perPage ?? 20;
  const page = Math.max(1, opts.page ?? 1);
  const where = and(
    eq(formSubmissions.formId, formId),
    opts.status === "inbox"
      ? inArray(formSubmissions.status, ["new", "read"])
      : opts.status
        ? eq(formSubmissions.status, opts.status)
        : undefined,
  );
  const [items, [{ total }], counts] = await Promise.all([
    db
      .select()
      .from(formSubmissions)
      .where(where)
      .orderBy(desc(formSubmissions.createdAt), desc(formSubmissions.id))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db.select({ total: count() }).from(formSubmissions).where(where),
    db
      .select({ status: formSubmissions.status, n: count() })
      .from(formSubmissions)
      .where(eq(formSubmissions.formId, formId))
      .groupBy(formSubmissions.status),
  ]);
  const by = Object.fromEntries(counts.map((c) => [c.status, c.n]));
  return {
    items,
    total,
    pages: Math.max(1, Math.ceil(total / perPage)),
    counts: {
      inbox: (by.new ?? 0) + (by.read ?? 0),
      new: by.new ?? 0,
      spam: by.spam ?? 0,
    },
  };
}

export async function allSubmissions(formId: number) {
  return db
    .select()
    .from(formSubmissions)
    .where(eq(formSubmissions.formId, formId))
    .orderBy(desc(formSubmissions.createdAt));
}

export async function setSubmissionStatus(
  ids: number[],
  status: SubmissionStatus,
) {
  if (ids.length === 0) return;
  await db
    .update(formSubmissions)
    .set({ status })
    .where(inArray(formSubmissions.id, ids));
}

export async function deleteSubmissions(ids: number[]) {
  if (ids.length === 0) return;
  await db.delete(formSubmissions).where(inArray(formSubmissions.id, ids));
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

export type PublicForm = {
  id: number;
  title: string;
  fields: FormField[];
  settings: Pick<FormSettings, "submitLabel" | "open">;
};

// What the site and agents may see: never the notification address.
export async function getPublicForm(id: number): Promise<PublicForm | null> {
  "use cache";
  cacheTag(FORMS_TAG);
  cacheLife("max");

  const form = await getForm(id);
  if (!form) return null;
  return {
    id: form.id,
    title: form.title,
    fields: form.fields,
    settings: {
      submitLabel: form.settings.submitLabel,
      open: form.settings.open,
    },
  };
}

export type SubmitResult =
  | { ok: true; message: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const PER_IP_LIMIT = 10;
const PER_FORM_LIMIT = 200;
const WINDOW_MS = 10 * 60 * 1000;

export async function submitForm(
  formId: number,
  get: (key: string) => string[],
  meta: {
    ip: string | null;
    userAgent: string | null;
    source: "web" | "api";
    postId?: number | null;
  },
): Promise<SubmitResult> {
  const form = await getForm(formId);
  if (!form?.settings.open)
    return { ok: false, error: "This form isn't accepting responses." };

  const result = validateSubmission(form.fields, get);
  if (!result.ok)
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: result.errors,
    };
  if (Object.keys(result.data).length === 0)
    return { ok: false, error: "The form is empty." };

  // Per visitor, and a ceiling per form so a botnet can't flood the inbox
  // (or run up AI triage costs)
  const [perIp, perForm] = await Promise.all([
    rateLimit(
      `form:${formId}:${meta.ip ?? "unknown"}`,
      PER_IP_LIMIT,
      WINDOW_MS,
    ),
    rateLimit(`form:${formId}`, PER_FORM_LIMIT, WINDOW_MS),
  ]);
  if (!perIp.ok || !perForm.ok)
    return {
      ok: false,
      error: "Too many submissions. Please try again in a few minutes.",
    };

  const [submission] = await db
    .insert(formSubmissions)
    .values({
      formId,
      data: result.data,
      source: meta.source,
      sourcePostId: meta.postId ?? null,
      ipAddress: meta.ip,
      userAgent: meta.userAgent?.slice(0, 500) ?? null,
    })
    .returning();

  after(() => processSubmission(form, submission));
  return { ok: true, message: form.settings.successMessage };
}

// Runs after the visitor has their answer: AI triage first, so spam never
// reaches the inbox email or webhooks.
async function processSubmission(form: Form, submission: FormSubmission) {
  const settings = await getSettings();
  let current = submission;
  if (form.settings.aiTriage && settings.aiEnabled) {
    const triage = await triageSubmission(form, submission);
    if (triage) {
      [current] = await db
        .update(formSubmissions)
        .set({
          aiSummary: triage.summary || null,
          aiSpamReason: triage.spam ? triage.spamReason || "Spam" : null,
          status: triage.spam ? "spam" : submission.status,
        })
        .where(eq(formSubmissions.id, submission.id))
        .returning();
    }
  }
  if (current.status === "spam") return;

  try {
    await sendMail({
      to: form.settings.notifyEmail || settings.adminEmail,
      subject: `[${settings.title}] New response to “${form.title}”`,
      text: submissionText(form.fields, current.data, current.aiSummary),
    });
  } catch (error) {
    console.error("[forms] notification email failed:", error);
  }
  await doAction("form.submitted", {
    form: { id: form.id, title: form.title, fields: form.fields },
    submission: current,
  });
}

export function submissionText(
  fields: FormField[],
  data: SubmissionData,
  summary?: string | null,
) {
  const lines = fields.flatMap((f) => {
    const value = data[f.key];
    if (value === undefined) return [];
    return [
      `${f.label}:\n${Array.isArray(value) ? value.join(", ") : value}\n`,
    ];
  });
  return [summary ? `Summary: ${summary}\n` : "", ...lines]
    .filter(Boolean)
    .join("\n");
}
