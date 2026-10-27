import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { getPlugin, getPluginSettings } from "@/lib/plugins";
import { requireViewer } from "@/lib/session";
import { SettingFieldInput } from "../../_components/setting-field";
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
          <SettingFieldInput
            key={field.key}
            field={field}
            value={values[field.key]}
          />
        ))}
        <div>
          <SubmitButton>Save Changes</SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}
