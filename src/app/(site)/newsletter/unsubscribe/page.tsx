import type { Metadata } from "next";
import { activeTheme, getThemeOptions } from "@/lib/themes";
import { unsubscribeAction } from "../actions";

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false },
};

// Asks before unsubscribing: link checkers in mail systems open links too
// Shows the outcome of a link from an email, so it renders per request
export const instant = false;

export default async function UnsubscribePage({
  searchParams,
}: PageProps<"/newsletter/unsubscribe">) {
  const [theme, query] = await Promise.all([activeTheme(), searchParams]);
  const options = await getThemeOptions(theme.slug);
  const { ArchiveHeader } = theme.components;
  const s = typeof query.s === "string" ? query.s : "";
  const t = typeof query.t === "string" ? query.t : "";
  return (
    <>
      <ArchiveHeader
        title="Unsubscribe"
        description="Stop getting new posts by email."
        options={options}
      />
      <form action={unsubscribeAction} className="not-prose">
        <input type="hidden" name="s" value={s} />
        <input type="hidden" name="t" value={t} />
        <button
          type="submit"
          className="h-10 rounded-lg bg-foreground px-4 font-medium text-background text-sm"
        >
          Unsubscribe me
        </button>
      </form>
    </>
  );
}
