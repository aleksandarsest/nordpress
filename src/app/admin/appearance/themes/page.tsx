import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireViewer } from "@/lib/session";
import { activeTheme, listThemes } from "@/lib/themes";
import { ScreenHeader } from "../../_components/screen";
import { activateThemeAction } from "../actions";

export const metadata: Metadata = { title: "Themes" };

export default async function ThemesPage() {
  await requireViewer("manage_options");
  const active = await activeTheme();
  const themes = listThemes();

  return (
    <>
      <ScreenHeader title="Themes" />
      <p className="mb-6 max-w-2xl text-muted-foreground text-sm">
        A theme controls how your site looks. Switching themes keeps all your
        content, menus and settings. Themes live in <code>src/themes</code>.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {themes.map((theme) => {
          const isActive = theme.slug === active.slug;
          return (
            <Card
              key={theme.slug}
              className={isActive ? "ring-2 ring-primary" : undefined}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {theme.name}
                  {isActive && <Badge>Active</Badge>}
                </CardTitle>
                <CardDescription>{theme.description}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm">
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-muted-foreground text-xs">
                  <dt>Version</dt>
                  <dd>{theme.version}</dd>
                  {theme.author && (
                    <>
                      <dt>Author</dt>
                      <dd>{theme.author}</dd>
                    </>
                  )}
                  <dt>Menus</dt>
                  <dd>
                    {Object.values(theme.menuLocations).join(", ") || "None"}
                  </dd>
                </dl>
                {isActive ? (
                  <div className="flex gap-3">
                    <Link
                      href="/admin/appearance/customize"
                      className="text-primary hover:underline"
                    >
                      Customize
                    </Link>
                    <Link
                      href="/admin/appearance/menus"
                      className="text-primary hover:underline"
                    >
                      Menus
                    </Link>
                  </div>
                ) : (
                  <form action={activateThemeAction}>
                    <input type="hidden" name="slug" value={theme.slug} />
                    <Button type="submit" size="sm">
                      Activate
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
