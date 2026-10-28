import type { Metadata } from "next";
import { getSettings } from "@/lib/options";
import { activeTheme, getThemeOptions } from "@/lib/themes";
import { NewsletterSignup } from "./signup-form";

export const metadata: Metadata = { title: "Newsletter" };

const MESSAGES: Record<string, string> = {
  confirmed: "You're subscribed. New posts will arrive in your inbox.",
  unsubscribed: "You've been unsubscribed and won't get any more emails.",
  invalid: "That link doesn't work anymore. Subscribe again below if you like.",
};

// Shows the outcome of a link from an email, so it renders per request
export const instant = false;

export default async function NewsletterPage({
  searchParams,
}: PageProps<"/newsletter">) {
  const [settings, theme, query] = await Promise.all([
    getSettings(),
    activeTheme(),
    searchParams,
  ]);
  const options = await getThemeOptions(theme.slug);
  const { ArchiveHeader, Empty } = theme.components;
  const message = Object.keys(MESSAGES).find((key) => key in query);

  return (
    <>
      <ArchiveHeader
        title="Newsletter"
        description={`Get new posts from ${settings.title} by email.`}
        options={options}
      />
      {message && (
        <p
          role="status"
          className="mb-6 rounded-md bg-muted/60 px-3 py-2 text-sm"
        >
          {MESSAGES[message]}
        </p>
      )}
      {settings.newsletterEnabled ? (
        <NewsletterSignup />
      ) : (
        <Empty message="This site doesn't have a newsletter." />
      )}
    </>
  );
}
