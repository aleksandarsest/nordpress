import type { Metadata } from "next";
import { aiConfigured } from "@/lib/ai/client";
import { readDesign } from "@/lib/design";
import { siteImage } from "@/lib/media";
import { getSettings } from "@/lib/options";
import { postPath } from "@/lib/permalinks";
import { getPageTree, listPublished } from "@/lib/posts";
import { requireViewer } from "@/lib/session";
import { activeTheme } from "@/lib/themes";
import { fontVariables } from "@/themes/studio/fonts";
import { DesignEditor } from "./design-editor";

export const metadata: Metadata = { title: "Design" };

export default async function DesignPage() {
  await requireViewer("manage_options");
  const [settings, theme, pages, latest] = await Promise.all([
    getSettings(),
    activeTheme(),
    getPageTree(),
    listPublished({ perPage: 1 }),
  ]);
  const logo = await siteImage(settings.siteLogo);
  const post = latest.items[0];
  // A few pages to preview the design on
  const previews = [
    { label: "Home", path: "/" },
    ...pages
      .filter((p) => !p.parentId && p.id !== settings.pageOnFront && !p.lang)
      .slice(0, 4)
      .map((p) => ({ label: p.title, path: `/${p.path}` })),
    ...(post
      ? [
          {
            label: `Post: ${post.title}`,
            path: postPath(post, settings.permalinkStructure),
          },
        ]
      : []),
  ];

  return (
    <div className={fontVariables}>
      <DesignEditor
        saved={readDesign(settings.design)}
        usingStudio={theme.slug === "studio"}
        themeName={theme.name}
        logoUrl={logo?.url ?? null}
        ai={settings.aiEnabled && aiConfigured()}
        previews={previews}
      />
    </div>
  );
}
