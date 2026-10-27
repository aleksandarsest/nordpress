import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { requireViewer } from "@/lib/session";
import { activeTheme, getThemeOptions } from "@/lib/themes";
import { SettingFieldInput } from "../../_components/setting-field";
import { saveThemeOptionsAction } from "../actions";

export const metadata: Metadata = { title: "Customize" };

export default async function CustomizePage() {
  await requireViewer("manage_options");
  const theme = await activeTheme();
  const values = await getThemeOptions(theme.slug);

  return (
    <div className="max-w-xl">
      <h1 className="mb-1 font-semibold text-2xl tracking-tight">Customize</h1>
      <p className="mb-6 text-muted-foreground text-sm">
        Options for the <strong>{theme.name}</strong> theme. Site title and
        tagline are under{" "}
        <Link href="/admin/settings" className="text-primary hover:underline">
          Settings → General
        </Link>
        .
      </p>
      {theme.settings?.length ? (
        <ActionForm
          action={saveThemeOptionsAction}
          className="grid gap-5 text-sm"
        >
          {theme.settings.map((field) => (
            <SettingFieldInput
              key={field.key}
              field={field}
              value={values[field.key]}
            />
          ))}
          <div className="flex items-center gap-4">
            <SubmitButton pendingLabel="Publishing…">Publish</SubmitButton>
            <Link
              href="/"
              target="_blank"
              className="text-primary hover:underline"
            >
              View site
            </Link>
          </div>
        </ActionForm>
      ) : (
        <p className="text-muted-foreground text-sm">
          This theme has no options.
        </p>
      )}
    </div>
  );
}
