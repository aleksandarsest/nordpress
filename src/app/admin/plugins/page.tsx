import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listPlugins } from "@/lib/plugins";
import { requireViewer } from "@/lib/session";
import { ScreenHeader } from "../_components/screen";
import { activatePluginAction, deactivatePluginAction } from "./actions";

export const metadata: Metadata = { title: "Plugins" };

export default async function PluginsPage() {
  await requireViewer("manage_options");
  const plugins = await listPlugins();

  return (
    <>
      <ScreenHeader title="Plugins" />
      <p className="mb-6 max-w-2xl text-muted-foreground text-sm">
        Plugins add features through hooks, settings and REST routes. They are
        part of the site's code: to install one, add its folder under{" "}
        <code>src/plugins</code>, list it in <code>src/plugins/index.ts</code>{" "}
        and deploy. Activating and deactivating takes effect immediately.
      </p>
      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Plugin</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-40" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {plugins.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="py-8 text-center text-muted-foreground"
                >
                  No plugins installed.
                </TableCell>
              </TableRow>
            )}
            {plugins.map(({ plugin, active }) => (
              <TableRow
                key={plugin.slug}
                className={active ? "bg-primary/[0.03]" : undefined}
              >
                <TableCell className="align-top">
                  <div className="font-medium">{plugin.name}</div>
                  <div className="mt-1 flex items-center gap-2 text-muted-foreground text-xs">
                    Version {plugin.version}
                    {active && <Badge variant="secondary">Active</Badge>}
                  </div>
                </TableCell>
                <TableCell className="max-w-xl whitespace-normal align-top text-sm">
                  {plugin.description}
                  {plugin.author && (
                    <div className="mt-1 text-muted-foreground text-xs">
                      By {plugin.author}
                    </div>
                  )}
                  {plugin.rest?.length ? (
                    <div className="mt-1 text-muted-foreground text-xs">
                      REST: <code>/wp-json/{plugin.slug}/v1</code>
                    </div>
                  ) : null}
                </TableCell>
                <TableCell className="align-top">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {active && plugin.settings?.length ? (
                      <Link
                        href={`/admin/plugins/${plugin.slug}`}
                        className="text-primary text-sm hover:underline"
                      >
                        Settings
                      </Link>
                    ) : null}
                    <form
                      action={
                        active ? deactivatePluginAction : activatePluginAction
                      }
                    >
                      <input type="hidden" name="slug" value={plugin.slug} />
                      <Button
                        type="submit"
                        size="sm"
                        variant={active ? "outline" : "default"}
                      >
                        {active ? "Deactivate" : "Activate"}
                      </Button>
                    </form>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
