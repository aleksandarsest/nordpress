import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { getSettings } from "@/lib/options";
import { termPath } from "@/lib/permalinks";
import {
  listTerms,
  TAXONOMIES,
  type Taxonomy,
  type TermWithCount,
} from "@/lib/terms";
import { createTermAction, deleteTermAction } from "../terms/actions";
import { first, ScreenHeader } from "./screen";

export async function TermsScreen({
  taxonomy,
  searchParams,
}: {
  taxonomy: Taxonomy;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const [items, settings] = await Promise.all([
    listTerms(taxonomy),
    getSettings(),
  ]);
  const tax = TAXONOMIES[taxonomy];
  const search = (first(searchParams.s) ?? "").toLowerCase();
  const visible = search
    ? items.filter((t) => t.name.toLowerCase().includes(search))
    : items;

  return (
    <>
      <ScreenHeader title={tax.label} />
      {first(searchParams.deleted) && (
        <Alert className="mb-4">
          <AlertDescription>Item deleted.</AlertDescription>
        </Alert>
      )}
      {first(searchParams.error) === "default" && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>
            The default category cannot be deleted.
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
        <section>
          <h2 className="mb-3 font-semibold">Add New {tax.singular}</h2>
          <ActionForm action={createTermAction} className="grid gap-4">
            <input type="hidden" name="taxonomy" value={taxonomy} />
            <TermFields taxonomy={taxonomy} items={items} />
            <div>
              <SubmitButton>Add New {tax.singular}</SubmitButton>
            </div>
          </ActionForm>
        </section>
        <section>
          <form className="mb-3 flex justify-end">
            <Input
              name="s"
              defaultValue={search}
              placeholder={`Search ${tax.label.toLowerCase()}`}
              className="h-8 w-56"
            />
          </form>
          <div className="rounded-lg border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-8 text-center text-muted-foreground"
                    >
                      No {tax.label.toLowerCase()} found.
                    </TableCell>
                  </TableRow>
                )}
                {ordered(visible, tax.hierarchical).map(({ term, depth }) => (
                  <TableRow key={term.id} className="group">
                    <TableCell>
                      <Link
                        href={`/admin/terms/${term.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {"— ".repeat(depth)}
                        {term.name}
                      </Link>
                      <div className="mt-1 flex gap-2 text-xs md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
                        <Link
                          href={`/admin/terms/${term.id}`}
                          className="text-primary hover:underline"
                        >
                          Edit
                        </Link>
                        {term.id !== settings.defaultCategory && (
                          <form action={deleteTermAction}>
                            <input type="hidden" name="id" value={term.id} />
                            <button
                              type="submit"
                              className="text-destructive hover:underline"
                            >
                              Delete
                            </button>
                          </form>
                        )}
                        <Link
                          href={termPath(taxonomy, term.slug)}
                          className="text-primary hover:underline"
                        >
                          View
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {term.description || "—"}
                    </TableCell>
                    <TableCell>{term.slug}</TableCell>
                    <TableCell className="text-right">{term.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>
    </>
  );
}

export function TermFields({
  taxonomy,
  items,
  term,
}: {
  taxonomy: Taxonomy;
  items: TermWithCount[];
  term?: {
    id: number;
    name: string;
    slug: string;
    description: string;
    parentId: number | null;
  };
}) {
  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={term?.name} required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="slug">Slug</Label>
        <Input id="slug" name="slug" defaultValue={term?.slug} />
        <span className="text-muted-foreground text-xs">
          The URL-friendly version of the name.
        </span>
      </div>
      {TAXONOMIES[taxonomy].hierarchical && (
        <div className="grid gap-2">
          <Label htmlFor="parent">Parent {TAXONOMIES[taxonomy].singular}</Label>
          <select
            id="parent"
            name="parent_id"
            defaultValue={term?.parentId ?? ""}
            className="h-8 rounded-lg border bg-transparent px-2 text-sm"
          >
            <option value="">None</option>
            {ordered(
              items.filter((t) => t.id !== term?.id),
              true,
            ).map(({ term: t, depth }) => (
              <option key={t.id} value={t.id}>
                {"  ".repeat(depth)}
                {t.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="grid gap-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={term?.description}
          rows={4}
        />
      </div>
    </>
  );
}

function ordered(items: TermWithCount[], hierarchical: boolean) {
  if (!hierarchical) return items.map((term) => ({ term, depth: 0 }));
  const ids = new Set(items.map((t) => t.id));
  const out: { term: TermWithCount; depth: number }[] = [];
  const walk = (parentId: number | null, depth: number) => {
    for (const term of items) {
      const parent =
        term.parentId && ids.has(term.parentId) ? term.parentId : null;
      if (parent === parentId) {
        out.push({ term, depth });
        walk(term.id, depth + 1);
      }
    }
  };
  walk(null, 0);
  return out;
}
