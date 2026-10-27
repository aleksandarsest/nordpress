import Link from "next/link";
import { Suspense } from "react";
import { chatAvailable } from "@/lib/ai/chat";
import { getSettings } from "@/lib/options";
import { getPageTree } from "@/lib/posts";
import { getViewer } from "@/lib/session";
import { SiteChat } from "./_components/site-chat";

export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <Suspense>
        <AdminBar />
      </Suspense>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
        {children}
      </main>
      <SiteFooter />
      <ChatLauncher />
    </>
  );
}

async function SiteHeader() {
  const [settings, pages] = await Promise.all([getSettings(), getPageTree()]);
  const menu = pages.filter(
    (p) => !p.parentId && p.id !== settings.pageOnFront,
  );

  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-3xl flex-wrap items-end justify-between gap-4 px-4 py-6">
        <div>
          <Link href="/" className="font-semibold text-xl tracking-tight">
            {settings.title}
          </Link>
          {settings.tagline && (
            <p className="text-muted-foreground text-sm">{settings.tagline}</p>
          )}
        </div>
        {menu.length > 0 && (
          <nav aria-label="Primary">
            <ul className="flex flex-wrap gap-4 text-sm">
              {menu.map((p) => (
                <li key={p.id}>
                  <Link href={`/${p.path}`} className="hover:underline">
                    {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </header>
  );
}

async function SiteFooter() {
  const settings = await getSettings();
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-3xl justify-between px-4 py-6 text-muted-foreground text-sm">
        <span>{settings.title}</span>
        <span>
          <Link href="/feed" className="hover:underline">
            RSS
          </Link>
          {" · "}
          <Link href="/login" className="hover:underline">
            Log in
          </Link>
        </span>
      </div>
    </footer>
  );
}

async function AdminBar() {
  const viewer = await getViewer();
  if (!viewer) return null;
  return (
    <div className="flex h-8 items-center justify-between bg-neutral-900 px-4 text-neutral-100 text-xs">
      <div className="flex gap-4">
        <Link href="/admin" className="hover:underline">
          Dashboard
        </Link>
        <Link href="/admin/posts/new" className="hover:underline">
          + New
        </Link>
      </div>
      <Link href="/admin/profile" className="hover:underline">
        Howdy, {viewer.name}
      </Link>
    </div>
  );
}

async function ChatLauncher() {
  if (!(await chatAvailable())) return null;
  const settings = await getSettings();
  return <SiteChat siteTitle={settings.title} />;
}
