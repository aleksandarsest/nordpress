import type { Metadata } from "next";
import { requireViewer } from "@/lib/session";
import { TermsScreen } from "../_components/terms-screen";

export const metadata: Metadata = { title: "Tags" };

export default async function TagsPage({
  searchParams,
}: PageProps<"/admin/tags">) {
  await requireViewer("manage_categories");
  return <TermsScreen taxonomy="post_tag" searchParams={await searchParams} />;
}
