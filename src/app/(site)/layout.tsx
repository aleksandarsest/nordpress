import Link from "next/link";
import { Suspense } from "react";
import { chatAvailable } from "@/lib/ai/chat";
import { siteImage } from "@/lib/media";
import { getMenuAt } from "@/lib/menus";
import { getSettings } from "@/lib/options";
import { getPageTree } from "@/lib/posts";
import { getViewer } from "@/lib/session";
import { activeTheme, getThemeOptions } from "@/lib/themes";
import { SiteChat } from "./_components/site-chat";
import { CartButton } from "./shop/cart-button";

export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <Suspense>
        <AdminBar />
      </Suspense>
      <ThemeLayout>{children}</ThemeLayout>
      <ChatLauncher />
      <Suspense>
        <CartButton />
      </Suspense>
    </>
  );
}

// The active theme's chrome, with every menu location it declares resolved.
async function ThemeLayout({ children }: { children: React.ReactNode }) {
  const [theme, site, pages] = await Promise.all([
    activeTheme(),
    getSettings(),
    getPageTree(),
  ]);
  const [options, ...resolved] = await Promise.all([
    getThemeOptions(theme.slug),
    ...Object.keys(theme.menuLocations).map((location) => getMenuAt(location)),
  ]);
  const menus = Object.fromEntries(
    Object.keys(theme.menuLocations).map((location, i) => [
      location,
      resolved[i],
    ]),
  );
  const { Layout } = theme.components;
  return (
    <Layout
      site={site}
      menus={menus}
      // Fallback menus list the site's own pages, not their translations
      pages={pages.filter((p) => !p.lang)}
      options={options}
      logo={await siteImage(site.siteLogo)}
    >
      {children}
    </Layout>
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
