import type { Metadata } from "next";
import { aiConfigured } from "@/lib/ai/client";
import { getSettings } from "@/lib/options";
import { requireViewer } from "@/lib/session";
import { hasOnlySampleContent } from "@/lib/setup/apply";
import { SetupWizard } from "./setup-wizard";

export const metadata: Metadata = { title: "Set Up Your Site" };

export default async function SetupPage() {
  await requireViewer("manage_options");
  const [settings, fresh] = await Promise.all([
    getSettings(),
    hasOnlySampleContent(),
  ]);
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-2 font-semibold text-2xl tracking-tight">
        Set up your site
      </h1>
      <p className="mb-8 text-muted-foreground text-sm">
        Get a complete starter site in a minute: pages with real copy, a menu, a
        contact form, a theme and a voice for the AI features. You review
        everything before it's created, and you can change all of it later.
      </p>
      <SetupWizard
        siteTitle={settings.title}
        ai={settings.aiEnabled && aiConfigured()}
        fresh={fresh}
        setUpBefore={settings.setupCompleted}
      />
    </div>
  );
}
