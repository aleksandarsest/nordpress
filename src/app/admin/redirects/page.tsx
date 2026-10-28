import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatInZone } from "@/lib/dates";
import { getSettings } from "@/lib/options";
import { listNotFound, listRedirects, suggestTargets } from "@/lib/redirects";
import { requireViewer } from "@/lib/session";
import {
  deleteRedirectAction,
  dismissNotFoundAction,
  importRedirectsAction,
  saveRedirectAction,
} from "./actions";

export const metadata: Metadata = { title: "Redirects" };

const ORIGIN: Record<string, string> = {
  auto: "Address changed",
  import: "Imported",
  manual: "",
};

function StatusSelect({ defaultValue = 301 }: { defaultValue?: number }) {
  return (
    <select
      name="status"
      defaultValue={defaultValue}
      aria-label="Kind"
      className="h-8 rounded-lg border bg-transparent px-2"
    >
      <option value={301}>Moved for good (301)</option>
      <option value={302}>Temporarily (302)</option>
    </select>
  );
}

export default async function RedirectsPage({
  searchParams,
}: PageProps<"/admin/redirects">) {
  await requireViewer("manage_options");
  const query = await searchParams;
  const search = typeof query.s === "string" ? query.s.trim() : "";
  const page = Number(query.page) || 1;
  const [settings, list, missing] = await Promise.all([
    getSettings(),
    listRedirects({ search, page }),
    listNotFound(30),
  ]);
  const suggestions = await suggestTargets(missing.map((m) => m.path));
  const date = (d: Date) =>
    formatInZone(d, settings.timezone, settings.dateFormat);
  const pageLink = (n: number) =>
    `/admin/redirects?${new URLSearchParams({ ...(search && { s: search }), page: String(n) })}`;

  return (
    <div className="grid max-w-5xl gap-8">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Redirects</h1>
        <p className="max-w-2xl text-muted-foreground text-sm">
          Send visitors and search engines from an old address to the right
          page. When a published post or page changes its address, Nordpress
          adds a redirect by itself. End an address with <code>*</code> to
          redirect everything below it: <code>/old-blog/*</code> to{" "}
          <code>/blog/*</code> keeps the rest of the address.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add a redirect</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm
            action={saveRedirectAction}
            className="flex flex-wrap items-end gap-2 text-sm"
          >
            <div className="grid gap-1.5">
              <Label htmlFor="r-source">Old address</Label>
              <Input
                id="r-source"
                name="source"
                placeholder="/old-post"
                required
                className="h-8 w-64"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="r-target">New address</Label>
              <Input
                id="r-target"
                name="target"
                placeholder="/new-post or https://…"
                required
                className="h-8 w-64"
              />
            </div>
            <StatusSelect />
            <SubmitButton size="sm">Add</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>

      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-lg">
            Redirects{" "}
            <span className="font-normal text-muted-foreground text-sm">
              ({list.total})
            </span>
          </h2>
          <div className="flex items-center gap-3 text-sm">
            <form className="flex gap-2">
              <Input
                name="s"
                defaultValue={search}
                placeholder="Search addresses"
                aria-label="Search redirects"
                className="h-8 w-56"
              />
              <Button type="submit" size="sm" variant="outline">
                Search
              </Button>
            </form>
            <a
              href="/admin/redirects/export"
              className="underline-offset-4 hover:underline"
            >
              Export CSV
            </a>
          </div>
        </div>
        {list.items.length === 0 ? (
          <p className="text-muted-foreground text-sm">No redirects yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Old address</TableHead>
                <TableHead>New address</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Used</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.items.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">
                    {r.source}
                  </TableCell>
                  <TableCell className="max-w-xs break-all font-mono text-xs">
                    {r.target}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.status}
                    {ORIGIN[r.origin] && (
                      <span className="text-muted-foreground">
                        {" "}
                        · {ORIGIN[r.origin]}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground text-xs">
                    {r.hits}
                    {r.lastHitAt && ` · last ${date(r.lastHitAt)}`}
                  </TableCell>
                  <TableCell>
                    <form action={deleteRedirectAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <Button type="submit" size="sm" variant="ghost">
                        Delete
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {list.pages > 1 && (
          <nav className="flex items-center gap-3 text-sm">
            {page > 1 && <Link href={pageLink(page - 1)}>← Newer</Link>}
            <span className="text-muted-foreground">
              Page {page} of {list.pages}
            </span>
            {page < list.pages && (
              <Link href={pageLink(page + 1)}>Older →</Link>
            )}
          </nav>
        )}
      </section>

      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold text-lg">Not found</h2>
            <p className="text-muted-foreground text-sm">
              Addresses visitors asked for that don't exist, most requested
              first. Redirect the ones that should lead somewhere.
            </p>
          </div>
          {missing.length > 0 && (
            <form action={dismissNotFoundAction}>
              <Button type="submit" size="sm" variant="ghost">
                Clear the list
              </Button>
            </form>
          )}
        </div>
        {missing.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No missing pages reported.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Address</TableHead>
                <TableHead>Requests</TableHead>
                <TableHead>Redirect to</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {missing.map((m) => {
                const suggestion = suggestions.get(m.path);
                return (
                  <TableRow key={m.path}>
                    <TableCell className="max-w-56 break-all font-mono text-xs">
                      {m.path}
                      {m.referrer && (
                        <div className="text-muted-foreground">
                          from {m.referrer}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {m.hits} · last {date(m.lastSeenAt)}
                    </TableCell>
                    <TableCell>
                      <ActionForm
                        action={saveRedirectAction}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <input type="hidden" name="source" value={m.path} />
                        <input type="hidden" name="status" value="301" />
                        <Input
                          name="target"
                          defaultValue={suggestion?.path ?? ""}
                          placeholder="/new-address"
                          aria-label={`New address for ${m.path}`}
                          required
                          className="h-8 w-56 font-mono text-xs"
                        />
                        <SubmitButton size="sm" variant="outline">
                          Redirect
                        </SubmitButton>
                      </ActionForm>
                      {suggestion && (
                        <div className="mt-1 text-muted-foreground text-xs">
                          Suggested: {suggestion.title}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <form action={dismissNotFoundAction}>
                        <input type="hidden" name="path" value={m.path} />
                        <Button type="submit" size="sm" variant="ghost">
                          Ignore
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Import redirects</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm
            action={importRedirectsAction}
            className="grid gap-3 text-sm"
          >
            <p className="text-muted-foreground">
              A CSV export from WordPress's Redirection plugin, or one redirect
              per line: <code>old address, new address</code> (optionally{" "}
              <code>, 302</code>).
            </p>
            <Textarea
              name="list"
              rows={4}
              placeholder={"/old-post, /new-post\n/old-blog/*, /blog/*"}
              aria-label="Redirects"
            />
            <Input
              name="file"
              type="file"
              accept=".csv,.txt,text/csv"
              aria-label="CSV file"
            />
            <SubmitButton
              size="sm"
              className="justify-self-start"
              pendingLabel="Importing…"
            >
              Import
            </SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
