import { responsiveContent } from "@/lib/images";
import { getSettings } from "@/lib/options";
import { applyFilters } from "@/lib/plugins";
import { activeTheme, getThemeOptions } from "@/lib/themes";
import type { SinglePost } from "@/lib/themes/types";
import { Comments } from "./comments";

export type { SinglePost };

// Core side of a single post or page: prepares the body (plugin filters,
// responsive images) and comments, then hands everything to the theme.
export async function SingleView({
  post,
  isFront = false,
  preview = false,
}: {
  post: SinglePost;
  isFront?: boolean;
  preview?: boolean;
}) {
  const [theme, site] = await Promise.all([activeTheme(), getSettings()]);
  const options = await getThemeOptions(theme.slug);
  const { Single } = theme.components;
  const showComments =
    !preview && (post.type === "post" || post.commentStatus === "open");
  return (
    <Single
      post={post}
      site={site}
      options={options}
      isFront={isFront}
      preview={preview}
      body={<PostBody post={post} />}
      comments={showComments ? <Comments post={post} settings={site} /> : null}
    />
  );
}

async function PostBody({ post }: { post: SinglePost }) {
  const html = await applyFilters(
    "post.contentHtml",
    await responsiveContent(post.contentHtml),
    { post },
  );
  return (
    <div
      className="prose prose-neutral dark:prose-invert max-w-none"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: core renders it from a schema-validated Tiptap document; plugins are trusted, compiled-in code
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
