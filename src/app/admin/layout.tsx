import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { logout } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { hasCap } from "@/lib/capabilities";
import { countPendingComments } from "@/lib/comments";
import { countOpenSuggestions } from "@/lib/inbox";
import { getSettings } from "@/lib/options";
import { toolPages } from "@/lib/plugins";
import { requireViewer } from "@/lib/session";
import { AdminNav } from "./_components/admin-nav";
import { navFor } from "./_components/nav-items";

export const metadata: Metadata = {
  title: { default: "Dashboard", template: "%s ‹ Admin" },
  robots: { index: false, follow: false },
};

// Every admin screen is per-user; there is no static shell worth prerendering.
export const instant = false;

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={<div className="flex-1 bg-muted/40" />}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}

async function AdminShell({ children }: { children: React.ReactNode }) {
  const [viewer, settings] = await Promise.all([
    requireViewer(),
    getSettings(),
  ]);
  const tools = await toolPages((cap) => hasCap(viewer, cap));
  const pending = hasCap(viewer, "moderate_comments")
    ? await countPendingComments()
    : 0;
  const suggestions = hasCap(viewer, "edit_others_posts")
    ? await countOpenSuggestions()
    : 0;

  return (
    <div className="flex min-h-svh flex-1 flex-col bg-muted/40">
      <header className="flex h-11 items-center justify-between border-b bg-sidebar px-4 text-sm">
        <Link
          href="/"
          className="flex items-center gap-1.5 font-medium hover:underline"
        >
          {settings.title} <ExternalLink className="size-3.5" />
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/admin/profile" className="hover:underline">
            Howdy, {viewer.name}
          </Link>
          <form action={logout}>
            <Button type="submit" variant="ghost" size="sm">
              Log Out
            </Button>
          </form>
        </div>
      </header>
      <div className="flex flex-1">
        <aside className="hidden w-56 shrink-0 border-r bg-sidebar p-3 md:block">
          <AdminNav items={navFor(viewer, pending, tools, suggestions)} />
        </aside>
        <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
