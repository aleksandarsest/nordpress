import type { Metadata } from "next";
import { requireViewer } from "@/lib/session";
import { TermsScreen } from "../_components/terms-screen";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage({
  searchParams,
}: PageProps<"/admin/categories">) {
  await requireViewer("manage_categories");
  return <TermsScreen taxonomy="category" searchParams={await searchParams} />;
}
