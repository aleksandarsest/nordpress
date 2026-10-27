import type { Metadata } from "next";
import { requireViewer } from "@/lib/session";
import { PostsScreen } from "../_components/posts-screen";

export const metadata: Metadata = { title: "Posts" };

export default async function PostsPage({
  searchParams,
}: PageProps<"/admin/posts">) {
  const viewer = await requireViewer("edit_posts");
  return (
    <PostsScreen
      type="post"
      viewer={viewer}
      searchParams={await searchParams}
    />
  );
}
