import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { requireViewer } from "@/lib/session";
import { getTerm, isTaxonomy, listTerms, TAXONOMIES } from "@/lib/terms";
import { TermFields } from "../../_components/terms-screen";
import { updateTermAction } from "../actions";

export const metadata: Metadata = { title: "Edit Term" };

export default async function EditTermPage({
  params,
}: PageProps<"/admin/terms/[id]">) {
  await requireViewer("manage_categories");
  const term = await getTerm(Number((await params).id) || 0);
  if (!term || !isTaxonomy(term.taxonomy)) notFound();
  const taxonomy = term.taxonomy;
  const items = await listTerms(taxonomy);
  const back = taxonomy === "post_tag" ? "/admin/tags" : "/admin/categories";

  return (
    <div className="max-w-xl">
      <h1 className="mb-6 font-semibold text-2xl tracking-tight">
        Edit {TAXONOMIES[taxonomy].singular}
      </h1>
      <ActionForm action={updateTermAction} className="grid gap-4">
        <input type="hidden" name="id" value={term.id} />
        <TermFields taxonomy={taxonomy} items={items} term={term} />
        <div className="flex items-center gap-4">
          <SubmitButton>Update</SubmitButton>
          <Link href={back} className="text-primary text-sm hover:underline">
            ← Back to {TAXONOMIES[taxonomy].label}
          </Link>
        </div>
      </ActionForm>
    </div>
  );
}
