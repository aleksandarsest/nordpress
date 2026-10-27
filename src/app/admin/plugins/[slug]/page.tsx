import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getPlugin, getPluginSettings } from "@/lib/plugins";
import type { SettingField } from "@/lib/plugins/types";
import { requireViewer } from "@/lib/session";
import { savePluginSettingsAction } from "../actions";

export const metadata: Metadata = { title: "Plugin Settings" };

export default async function PluginSettingsPage({
  params,
}: PageProps<"/admin/plugins/[slug]">) {
  await requireViewer("manage_options");
  const plugin = getPlugin((await params).slug);
  if (!plugin?.settings?.length) notFound();
  const values = await getPluginSettings(plugin.slug);

  return (
    <div className="max-w-xl">
      <div className="mb-6 flex items-center gap-4">
        <h1 className="font-semibold text-2xl tracking-tight">{plugin.name}</h1>
        <Link
          href="/admin/plugins"
          className="text-primary text-sm hover:underline"
        >
          ← Plugins
        </Link>
      </div>
      <ActionForm
        action={savePluginSettingsAction}
        className="grid gap-5 text-sm"
      >
        <input type="hidden" name="slug" value={plugin.slug} />
        {plugin.settings.map((field) => (
          <Field key={field.key} field={field} value={values[field.key]} />
        ))}
        <div>
          <SubmitButton>Save Changes</SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}

function Field({
  field,
  value,
}: {
  field: SettingField;
  value: string | number | boolean | undefined;
}) {
  const id = `field-${field.key}`;
  const help = field.help && (
    <span className="text-muted-foreground text-xs">{field.help}</span>
  );

  if (field.type === "checkbox") {
    return (
      <div className="grid gap-1">
        <Label className="font-normal">
          <Checkbox name={field.key} defaultChecked={Boolean(value)} />{" "}
          {field.label}
        </Label>
        {help}
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{field.label}</Label>
      {field.type === "textarea" ? (
        <Textarea
          id={id}
          name={field.key}
          defaultValue={String(value ?? "")}
          rows={field.rows ?? 4}
        />
      ) : field.type === "select" ? (
        <select
          id={id}
          name={field.key}
          defaultValue={String(value ?? "")}
          className="h-8 rounded-lg border bg-transparent px-2"
        >
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <Input
          id={id}
          name={field.key}
          type={field.type}
          defaultValue={String(value ?? "")}
          {...(field.type === "number"
            ? { min: field.min, max: field.max }
            : {})}
        />
      )}
      {help}
    </div>
  );
}
