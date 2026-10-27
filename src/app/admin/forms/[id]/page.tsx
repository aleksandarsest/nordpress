import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { aiConfigured } from "@/lib/ai/client";
import { getForm, listSubmissions } from "@/lib/forms";
import { getSettings } from "@/lib/options";
import { requireViewer } from "@/lib/session";
import { deleteFormAction } from "../actions";
import { FormBuilder } from "./form-builder";
import { FormTabs } from "./form-tabs";

export const metadata: Metadata = { title: "Edit Form" };

export default async function EditFormPage({
  params,
}: PageProps<"/admin/forms/[id]">) {
  await requireViewer("edit_others_pages");
  const id = Number((await params).id);
  const form = Number.isInteger(id) ? await getForm(id) : null;
  if (!form) notFound();
  const [settings, responses] = await Promise.all([
    getSettings(),
    listSubmissions(form.id, { perPage: 1 }),
  ]);

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
        current="build"
        unread={responses.counts.new}
      />
      <FormBuilder
        // Remount with fresh data when another tab saved the form
        key={form.updatedAt.toISOString()}
        formId={form.id}
        initial={{
          title: form.title,
          fields: form.fields,
          settings: form.settings,
        }}
        ai={settings.aiEnabled && aiConfigured()}
      />
      <section className="mt-10 grid max-w-3xl gap-2 border-t pt-6 text-muted-foreground text-sm">
        <h2 className="font-medium text-foreground">Using this form</h2>
        <p>
          In the post or page editor, choose <strong>Form</strong> in the
          toolbar and pick “{form.title}”.
        </p>
        <p>
          Agents and other apps can read its schema at{" "}
          <code>/wp-json/nordpress/v1/forms/{form.id}</code> and submit it by
          POSTing JSON to{" "}
          <code>/wp-json/nordpress/v1/forms/{form.id}/submissions</code>.
        </p>
        <form action={deleteFormAction} className="mt-4">
          <input type="hidden" name="form_id" value={form.id} />
          <Button type="submit" variant="destructive" size="sm">
            Delete form and its responses
          </Button>
        </form>
      </section>
    </>
  );
}
