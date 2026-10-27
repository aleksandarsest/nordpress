import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSettings } from "@/lib/options";
import { loadPreview } from "@/lib/previews";
import { getViewer } from "@/lib/session";
import { SingleView } from "../../_components/single";

export const metadata: Metadata = {
  title: "Preview",
  robots: { index: false, follow: false },
};

// Previews belong to one logged-in person; nothing here is cached or shared.
export const instant = false;

export default async function PreviewPage({
  params,
}: PageProps<"/preview/[token]">) {
  const { token } = await params;
  const viewer = await getViewer();
  if (!viewer)
    redirect(`/login?redirect_to=${encodeURIComponent(`/preview/${token}`)}`);
  const [post, settings] = await Promise.all([
    loadPreview(token, viewer.id),
    getSettings(),
  ]);
  if (!post) notFound();

  return (
    <>
      <div
        role="status"
        className="mb-8 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 text-sm dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
      >
        <strong>Preview.</strong> This is how your unsaved changes will look.
        Nothing has been published; close this tab to keep editing.
      </div>
      <SingleView post={post} settings={settings} preview />
    </>
  );
}
