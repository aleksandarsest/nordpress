import "server-only";
import { and, count, eq, notInArray } from "drizzle-orm";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { mailConfigured } from "./mail";
import type { SiteSettings } from "./options";
import { securityOf } from "./security";
import { siteUrl } from "./site-url";

// The dashboard's "Getting started" list: the few things that turn a fresh
// install into a site that's ready for visitors, checked against what's done.

export type OnboardingStep = {
  key: string;
  title: string;
  detail: string;
  href: string;
  done: boolean;
};

const SAMPLE_SLUGS = ["hello-world", "sample-page"];

function isLocal(url: string) {
  const host = new URL(url).hostname;
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".test")
  );
}

export async function onboardingSteps(
  settings: SiteSettings,
  userId: string,
): Promise<OnboardingStep[]> {
  const [[{ written }], security] = await Promise.all([
    db
      .select({ written: count() })
      .from(posts)
      .where(
        and(
          eq(posts.type, "post"),
          eq(posts.status, "publish"),
          notInArray(posts.slug, SAMPLE_SLUGS),
        ),
      ),
    securityOf(userId),
  ]);
  return [
    {
      key: "setup",
      title: "Set up your site",
      detail: "Pages, a menu and a contact form from a few answers.",
      href: "/admin/setup",
      done: settings.setupCompleted,
    },
    {
      key: "logo",
      title: "Add your logo",
      detail: "It replaces the title in your site's header.",
      href: "/admin/settings",
      done: settings.siteLogo !== null,
    },
    {
      key: "post",
      title: "Publish your first post",
      detail: "News, a story or an offer: something to come back for.",
      href: "/admin/posts/new",
      done: written > 0,
    },
    {
      key: "security",
      title: "Protect your account",
      detail:
        "Add two-step login or a passkey, so a stolen password isn't enough.",
      href: "/admin/profile",
      done: security.twoFactorEnabled || security.passkeys.length > 0,
    },
    {
      key: "email",
      title: "Turn on email",
      detail:
        "Form notifications, password resets and the newsletter need SMTP_URL.",
      href: "https://github.com/aleksandarsest/nordpress/blob/main/docs/production-checklist.md",
      done: mailConfigured(),
    },
    {
      key: "backups",
      title: "Schedule backups",
      detail: "A daily copy of everything, kept for when you need it.",
      href: "/admin/backups",
      done: settings.backupSchedule !== "off",
    },
    {
      key: "domain",
      title: "Use your own domain",
      detail: "Point your domain here and set SITE_URL to it.",
      href: "https://github.com/aleksandarsest/nordpress/blob/main/docs/production-checklist.md",
      done: !isLocal(siteUrl("/")),
    },
  ];
}
