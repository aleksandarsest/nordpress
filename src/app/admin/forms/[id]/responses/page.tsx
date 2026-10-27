import { Download, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import type { FormSubmission } from "@/db/schema";
import { formatInZone } from "@/lib/dates";
import { getForm, listSubmissions } from "@/lib/forms";
import type { FormField } from "@/lib/forms/fields";
import { getSettings, type SiteSettings } from "@/lib/options";
import { requireViewer } from "@/lib/session";
import { cn } from "@/lib/utils";
import { first } from "../../../_components/screen";
import { deleteSubmissionsAction, markSubmissionsAction } from "../../actions";
import { FormTabs } from "../form-tabs";

export const metadata: Metadata = { title: "Form Responses" };

const VIEWS = [
  { key: "inbox", label: "Inbox" },
  { key: "new", label: "Unread" },
  { key: "spam", label: "Spam" },
] as const;

export default async function ResponsesPage({
  params,
  searchParams,
}: PageProps<"/admin/forms/[id]/responses">) {
  await requireViewer("edit_others_pages");
  const id = Number((await params).id);
  const form = Number.isInteger(id) ? await getForm(id) : null;
  if (!form) notFound();
  const query = await searchParams;
  const view = VIEWS.find((v) => v.key === first(query.view))?.key ?? "inbox";
  const page = Math.max(1, Number(first(query.page)) || 1);
  const [site, result] = await Promise.all([
    getSettings(),
    listSubmissions(form.id, { status: view, page }),
  ]);
  const base = `/admin/forms/${form.id}/responses`;
  const href = (v: string, p = 1) =>
    `${base}?view=${v}${p > 1 ? `&page=${p}` : ""}`;

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h1 className="font-semibold text-2xl tracking-tight">{form.title}</h1>
        <Link
          href="/admin/forms"
          className="text-primary text-sm hover:underline"
        >
          All forms
        </Link>
      </div>
      <FormTabs
        formId={form.id}
        current="responses"
        unread={result.counts.new}
      />

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={href(v.key)}
            className={
              v.key === view ? "font-semibold" : "text-primary hover:underline"
            }
          >
            {v.label} ({result.counts[v.key]})
          </Link>
        ))}
        <a
          href={`/admin/forms/${form.id}/export`}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "ml-auto",
          )}
        >
          <Download /> Export CSV
        </a>
      </div>

      {result.items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
          {view === "spam" ? "No spam." : "No responses yet."}
        </p>
      ) : (
        <ol className="grid gap-3">
          {result.items.map((s) => (
            <Response
              key={s.id}
              submission={s}
              fields={form.fields}
              site={site}
            />
          ))}
        </ol>
      )}

      {result.pages > 1 && (
        <nav
          aria-label="Pages"
          className="mt-6 flex items-center gap-4 text-sm"
        >
          {page > 1 && (
            <Link
              href={href(view, page - 1)}
              className="text-primary hover:underline"
            >
              ← Newer
            </Link>
          )}
          <span className="text-muted-foreground">
            Page {page} of {result.pages}
          </span>
          {page < result.pages && (
            <Link
              href={href(view, page + 1)}
              className="text-primary hover:underline"
            >
              Older →
            </Link>
          )}
        </nav>
      )}
    </>
  );
}

function Response({
  submission: s,
  fields,
  site,
}: {
  submission: FormSubmission;
  fields: FormField[];
  site: SiteSettings;
}) {
  // Fields deleted from the form still show, under their saved key
  const known = new Set(fields.map((f) => f.key));
  const rows = [
    ...fields.map((f) => [f.label, s.data[f.key]] as const),
    ...Object.entries(s.data).filter(([k]) => !known.has(k)),
  ].filter(([, v]) => v !== undefined && v !== "");

  const action = (status: "new" | "read" | "spam", label: string) => (
    <form action={markSubmissionsAction}>
      <input type="hidden" name="ids" value={s.id} />
      <input type="hidden" name="status" value={status} />
      <Button type="submit" variant="ghost" size="xs">
        {label}
      </Button>
    </form>
  );

  return (
    <li
      className={cn(
        "rounded-lg border bg-background p-4 text-sm",
        s.status === "new" && "border-l-4 border-l-primary",
      )}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <time
          dateTime={s.createdAt.toISOString()}
          className="text-muted-foreground text-xs"
        >
          {formatInZone(
            s.createdAt,
            site.timezone,
            `${site.dateFormat}, HH:mm`,
          )}
        </time>
        {s.status === "new" && <Badge>New</Badge>}
        {s.status === "spam" && (
          <Badge variant="destructive">
            Spam{s.aiSpamReason && `: ${s.aiSpamReason}`}
          </Badge>
        )}
        {s.source === "api" && <Badge variant="outline">API</Badge>}
        <div className="ml-auto flex flex-wrap gap-0.5">
          {s.status === "new" && action("read", "Mark read")}
          {s.status === "read" && action("new", "Mark unread")}
          {s.status === "spam"
            ? action("read", "Not spam")
            : action("spam", "Spam")}
          <form action={deleteSubmissionsAction}>
            <input type="hidden" name="ids" value={s.id} />
            <Button
              type="submit"
              variant="ghost"
              size="xs"
              className="text-destructive"
            >
              Delete
            </Button>
          </form>
        </div>
      </div>
      {s.aiSummary && (
        <p className="mb-3 flex gap-2 rounded-md bg-muted px-3 py-2 text-muted-foreground">
          <Sparkles className="mt-0.5 size-3.5 shrink-0" />
          {s.aiSummary}
        </p>
      )}
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[minmax(8rem,auto)_1fr]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="font-medium">{label}</dt>
            <dd className="whitespace-pre-wrap break-words">
              {Array.isArray(value) ? value.join(", ") : value}
            </dd>
          </div>
        ))}
      </dl>
    </li>
  );
}
