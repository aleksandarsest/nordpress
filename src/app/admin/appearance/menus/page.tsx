import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getMenuForEdit, listMenus } from "@/lib/menus";
import { getSettings } from "@/lib/options";
import { adminListPosts, listParentCandidates } from "@/lib/posts";
import { requireViewer } from "@/lib/session";
import { listTerms } from "@/lib/terms";
import { activeTheme } from "@/lib/themes";
import { first } from "../../_components/screen";
import {
  addMenuItemsAction,
  createMenuAction,
  deleteMenuAction,
  deleteMenuItemAction,
  moveMenuItemAction,
  saveMenuSettingsAction,
  updateMenuItemAction,
} from "../actions";

export const metadata: Metadata = { title: "Menus" };

export default async function MenusPage({
  searchParams,
}: PageProps<"/admin/appearance/menus">) {
  await requireViewer("manage_options");
  const params = await searchParams;
  const [menus, theme, settings] = await Promise.all([
    listMenus(),
    activeTheme(),
    getSettings(),
  ]);
  const selectedId = Number(first(params.menu)) || menus[0]?.id;
  const data = selectedId ? await getMenuForEdit(selectedId) : null;

  return (
    <>
      <h1 className="mb-4 font-semibold text-2xl tracking-tight">Menus</h1>

      <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {menus.length > 0 && (
          <span className="flex flex-wrap items-center gap-2">
            Edit:
            {menus.map((m) => (
              <Link
                key={m.id}
                href={`/admin/appearance/menus?menu=${m.id}`}
                className={
                  m.id === data?.menu.id
                    ? "font-semibold"
                    : "text-primary hover:underline"
                }
              >
                {m.name}
              </Link>
            ))}
          </span>
        )}
        <ActionForm
          action={createMenuAction}
          className="flex items-center gap-2"
        >
          <Input
            name="name"
            placeholder="New menu name"
            aria-label="New menu name"
            className="h-8 w-48"
            required
          />
          <SubmitButton size="sm" variant="outline" pendingLabel="Creating…">
            Create Menu
          </SubmitButton>
        </ActionForm>
      </div>

      {!data ? (
        <p className="text-muted-foreground text-sm">
          Create your first menu to get started.
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <AddItems menuId={data.menu.id} itemCount={data.items.length} />
          <div className="grid content-start gap-6">
            <Structure items={data.items} />
            <MenuSettings
              menu={data.menu}
              locations={theme.menuLocations}
              assigned={settings.menuLocations}
              allMenus={menus}
            />
          </div>
        </div>
      )}
    </>
  );
}

// Forms are keyed by the item count so they reset (unticking boxes) after
// each successful add.
async function AddItems({
  menuId,
  itemCount,
}: {
  menuId: number;
  itemCount: number;
}) {
  const [pages, posts, categories] = await Promise.all([
    listParentCandidates("page"),
    adminListPosts({ type: "post", status: "publish", perPage: 30 }),
    listTerms("category"),
  ]);
  const groups = [
    {
      title: "Pages",
      kind: "post",
      items: pages.map((p) => ({ id: p.id, label: p.title || "(no title)" })),
    },
    {
      title: "Posts",
      kind: "post",
      items: posts.items.map((p) => ({
        id: p.id,
        label: p.title || "(no title)",
      })),
    },
    {
      title: "Categories",
      kind: "term",
      items: categories.map((c) => ({ id: c.id, label: c.name })),
    },
  ];

  return (
    <div className="grid content-start gap-4">
      <h2 className="font-semibold text-sm">Add menu items</h2>
      {groups.map((group) => (
        <Card key={group.title} size="sm">
          <CardHeader>
            <CardTitle className="text-sm">{group.title}</CardTitle>
          </CardHeader>
          <CardContent>
            {group.items.length === 0 ? (
              <p className="text-muted-foreground text-xs">Nothing here yet.</p>
            ) : (
              <ActionForm
                key={itemCount}
                action={addMenuItemsAction}
                className="grid gap-3"
              >
                <input type="hidden" name="menu_id" value={menuId} />
                <input type="hidden" name="kind" value={group.kind} />
                <div className="grid max-h-48 gap-1.5 overflow-y-auto text-sm">
                  {group.items.map((item) => (
                    <Label key={item.id} className="font-normal">
                      <Checkbox name="ids" value={String(item.id)} />{" "}
                      {item.label}
                    </Label>
                  ))}
                </div>
                <div>
                  <SubmitButton
                    size="sm"
                    variant="outline"
                    pendingLabel="Adding…"
                  >
                    Add to Menu
                  </SubmitButton>
                </div>
              </ActionForm>
            )}
          </CardContent>
        </Card>
      ))}
      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-sm">Custom Link</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm
            key={itemCount}
            action={addMenuItemsAction}
            className="grid gap-3 text-sm"
          >
            <input type="hidden" name="menu_id" value={menuId} />
            <input type="hidden" name="kind" value="custom" />
            <div className="grid gap-1.5">
              <Label htmlFor="custom-url">URL</Label>
              <Input
                id="custom-url"
                name="url"
                placeholder="https://"
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="custom-label">Link Text</Label>
              <Input id="custom-label" name="label" required />
            </div>
            <div>
              <SubmitButton size="sm" variant="outline" pendingLabel="Adding…">
                Add to Menu
              </SubmitButton>
            </div>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}

type EditItem = NonNullable<
  Awaited<ReturnType<typeof getMenuForEdit>>
>["items"][number];

function Structure({ items }: { items: EditItem[] }) {
  const depthOf = new Map<number, number>();
  for (const item of items) {
    depthOf.set(
      item.id,
      item.parentId ? (depthOf.get(item.parentId) ?? 0) + 1 : 0,
    );
  }
  const moves = [
    { move: "up", label: "Move up", Icon: ArrowUp },
    { move: "down", label: "Move down", Icon: ArrowDown },
    { move: "out", label: "Move out from under the parent", Icon: ArrowLeft },
    { move: "in", label: "Move under the item above", Icon: ArrowRight },
  ] as const;

  return (
    <section className="grid gap-3">
      <h2 className="font-semibold text-sm">Menu structure</h2>
      {items.length === 0 && (
        <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
          Add pages, posts, categories or links from the column on the left.
        </p>
      )}
      <ol className="grid gap-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="rounded-lg border bg-background p-3 text-sm"
            style={{ marginLeft: `${(depthOf.get(item.id) ?? 0) * 1.5}rem` }}
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="font-medium">
                {item.label || item.original || item.url || "(untitled)"}
              </span>
              <Badge variant="secondary">{item.kind}</Badge>
              {item.broken && <Badge variant="destructive">Missing</Badge>}
              {item.unpublished && (
                <Badge variant="outline">
                  Not published; hidden on the site
                </Badge>
              )}
              <div className="ml-auto flex gap-0.5">
                {moves.map(({ move, label, Icon }) => (
                  <form key={move} action={moveMenuItemAction}>
                    <input type="hidden" name="item_id" value={item.id} />
                    <input type="hidden" name="move" value={move} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={label}
                      title={label}
                    >
                      <Icon />
                    </Button>
                  </form>
                ))}
                <form action={deleteMenuItemAction}>
                  <input type="hidden" name="item_id" value={item.id} />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Remove"
                    title="Remove"
                    className="text-destructive"
                  >
                    <X />
                  </Button>
                </form>
              </div>
            </div>
            <ActionForm
              action={updateMenuItemAction}
              className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end"
            >
              <input type="hidden" name="item_id" value={item.id} />
              <div className="grid gap-1">
                <label
                  htmlFor={`label-${item.id}`}
                  className="text-muted-foreground text-xs"
                >
                  Navigation label
                </label>
                <Input
                  id={`label-${item.id}`}
                  name="label"
                  defaultValue={item.label}
                  placeholder={item.original ?? ""}
                  className="h-8"
                />
              </div>
              {item.type === "custom" ? (
                <div className="grid gap-1">
                  <label
                    htmlFor={`url-${item.id}`}
                    className="text-muted-foreground text-xs"
                  >
                    URL
                  </label>
                  <Input
                    id={`url-${item.id}`}
                    name="url"
                    defaultValue={item.url}
                    className="h-8"
                  />
                </div>
              ) : (
                <span className="text-muted-foreground text-xs sm:pb-2">
                  {item.original
                    ? `Links to “${item.original}”`
                    : "The linked content was deleted."}
                </span>
              )}
              <Label className="font-normal text-xs sm:pb-2">
                <Checkbox name="new_tab" defaultChecked={item.openInNewTab} />{" "}
                New tab
              </Label>
              <SubmitButton size="sm" variant="outline">
                Save
              </SubmitButton>
            </ActionForm>
          </li>
        ))}
      </ol>
    </section>
  );
}

function MenuSettings({
  menu,
  locations,
  assigned,
  allMenus,
}: {
  menu: { id: number; name: string };
  locations: Record<string, string>;
  assigned: Record<string, number>;
  allMenus: { id: number; name: string }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Menu settings</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5 text-sm">
        <ActionForm action={saveMenuSettingsAction} className="grid gap-4">
          <input type="hidden" name="menu_id" value={menu.id} />
          <div className="grid max-w-sm gap-1.5">
            <Label htmlFor="menu-name">Menu name</Label>
            <Input
              id="menu-name"
              name="name"
              defaultValue={menu.name}
              required
            />
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-1 font-medium">Display location</legend>
            {Object.entries(locations).map(([key, label]) => {
              const other =
                assigned[key] && assigned[key] !== menu.id
                  ? allMenus.find((m) => m.id === assigned[key])
                  : null;
              return (
                <Label key={key} className="font-normal">
                  <Checkbox
                    name="location"
                    value={key}
                    defaultChecked={assigned[key] === menu.id}
                  />{" "}
                  {label}
                  {other && (
                    <span className="text-muted-foreground text-xs">
                      (currently: {other.name})
                    </span>
                  )}
                </Label>
              );
            })}
            {Object.keys(locations).length === 0 && (
              <span className="text-muted-foreground">
                The active theme has no menu locations.
              </span>
            )}
          </fieldset>
          <div>
            <SubmitButton>Save Menu</SubmitButton>
          </div>
        </ActionForm>
        <form action={deleteMenuAction} className="border-t pt-4">
          <input type="hidden" name="menu_id" value={menu.id} />
          <Button type="submit" variant="destructive" size="sm">
            Delete Menu
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
