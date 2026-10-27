import type { Post, Role } from "@/db/schema";

// Primitive capabilities, modeled on WordPress's default role matrix.
export const CAPABILITIES = [
  "read",
  "edit_posts",
  "edit_others_posts",
  "edit_published_posts",
  "publish_posts",
  "delete_posts",
  "delete_others_posts",
  "delete_published_posts",
  "edit_pages",
  "edit_others_pages",
  "edit_published_pages",
  "publish_pages",
  "delete_pages",
  "delete_others_pages",
  "delete_published_pages",
  "manage_categories",
  "moderate_comments",
  "upload_files",
  "list_users",
  "create_users",
  "edit_users",
  "delete_users",
  "promote_users",
  "manage_options",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

const contributor: Capability[] = ["read", "edit_posts", "delete_posts"];

const author: Capability[] = [
  ...contributor,
  "edit_published_posts",
  "publish_posts",
  "delete_published_posts",
  "upload_files",
];

const editor: Capability[] = [
  ...author,
  "edit_others_posts",
  "delete_others_posts",
  "edit_pages",
  "edit_others_pages",
  "edit_published_pages",
  "publish_pages",
  "delete_pages",
  "delete_others_pages",
  "delete_published_pages",
  "manage_categories",
  "moderate_comments",
];

export const ROLE_CAPABILITIES: Record<Role, ReadonlySet<Capability>> = {
  administrator: new Set(CAPABILITIES),
  editor: new Set(editor),
  author: new Set(author),
  contributor: new Set(contributor),
  subscriber: new Set(["read"]),
};

export const ROLE_LABELS: Record<Role, string> = {
  administrator: "Administrator",
  editor: "Editor",
  author: "Author",
  contributor: "Contributor",
  subscriber: "Subscriber",
};

export type Actor = { id: string; role: Role };

export function hasCap(actor: Actor, cap: Capability): boolean {
  return ROLE_CAPABILITIES[actor.role].has(cap);
}

type PostRef = Pick<Post, "type" | "status" | "authorId">;
type PostAction = "edit" | "delete" | "publish";

// Maps a post-level action to the primitive capabilities it requires,
// the same way WordPress's map_meta_cap resolves edit_post/delete_post.
export function canOnPost(
  actor: Actor,
  action: PostAction,
  post: PostRef,
): boolean {
  const plural = post.type === "page" ? "pages" : "posts";
  const required: Capability[] = [];

  if (action === "publish") {
    required.push(`publish_${plural}`);
  } else {
    required.push(`${action}_${plural}`);
    if (post.authorId !== actor.id) required.push(`${action}_others_${plural}`);
    if (post.status === "publish" || post.status === "future") {
      required.push(`${action}_published_${plural}`);
    }
    if (post.status === "private" && post.authorId !== actor.id) {
      required.push(`${action}_others_${plural}`);
    }
  }

  return required.every((cap) => hasCap(actor, cap));
}
