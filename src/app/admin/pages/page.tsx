import type { Metadata } from "next";
import { requireViewer } from "@/lib/session";
import { PostsScreen } from "../_components/posts-screen";

export const metadata: Metadata = { title: "Pages" };

export default async function PagesPage({
  searchParams,
}: PageProps<"/admin/pages">) {
  const viewer = await requireViewer("edit_pages");
  return (
    <PostsScreen
      type="page"
      viewer={viewer}
      searchParams={await searchParams}
    />
  );
}
