import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import {
  getSettings,
  PERMALINK_STRUCTURES,
  type PermalinkStructure,
} from "@/lib/options";
import { postPath } from "@/lib/permalinks";
import { requireViewer } from "@/lib/session";
import { savePermalinksAction } from "../actions";

export const metadata: Metadata = { title: "Permalink Settings" };

const LABELS: Record<PermalinkStructure, string> = {
  plain: "Plain",
  postname: "Post name",
  dated: "Month and name",
  archive: "Numeric",
};

export default async function PermalinkSettingsPage() {
  await requireViewer("manage_options");
  const s = await getSettings();
  const sample = {
    id: 123,
    type: "post",
    slug: "sample-post",
    publishedAt: new Date(),
  };

  return (
    <>
      <h1 className="mb-2 font-semibold text-2xl tracking-tight">
        Permalink Settings
      </h1>
      <p className="mb-6 max-w-xl text-muted-foreground text-sm">
        Choose how the URLs of your posts look. Pretty permalinks improve the
        usability and longevity of your links.
      </p>
      <ActionForm
        action={savePermalinksAction}
        className="grid max-w-xl gap-3 text-sm"
      >
        {(Object.keys(PERMALINK_STRUCTURES) as PermalinkStructure[]).map(
          (key) => (
            <label
              key={key}
              className="grid grid-cols-[auto_8rem_1fr] items-center gap-3"
            >
              <input
                type="radio"
                name="permalink_structure"
                value={key}
                defaultChecked={s.permalinkStructure === key}
              />
              <span className="font-medium">{LABELS[key]}</span>
              <code className="text-muted-foreground">
                {postPath(sample, key)}
              </code>
            </label>
          ),
        )}
        <div className="mt-3">
          <SubmitButton>Save Changes</SubmitButton>
        </div>
      </ActionForm>
    </>
  );
}
