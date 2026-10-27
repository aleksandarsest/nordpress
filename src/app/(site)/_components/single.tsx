import Link from "next/link";
import { mediaUrl } from "@/lib/media";
import type { SiteSettings } from "@/lib/options";
import { postPath, termPath } from "@/lib/permalinks";
import { applyFilters } from "@/lib/plugins";
import type { getPublished } from "@/lib/posts";
import { Comments } from "./comments";
import { formatDate, PostMeta } from "./theme";

export type SinglePost = NonNullable<Awaited<ReturnType<typeof getPublished>>>;

// A single post or page as the theme renders it. Previews pass `preview` to
// leave out what only makes sense for published content (comments, links).
export function SingleView({
  post,
  settings,
  isFront = false,
  preview = false,
}: {
  post: SinglePost;
  settings: SiteSettings;
  isFront?: boolean;
  preview?: boolean;
}) {
  const tags = post.terms.filter((t) => t.taxonomy === "post_tag");
  return (
    <article className="grid gap-6">
      <header className="grid gap-3">
        {isFront ? (
          <h1 className="sr-only">{post.title}</h1>
        ) : (
          <h1 className="font-semibold text-4xl tracking-tight">
            {post.title}
          </h1>
        )}
        {post.type === "post" && <PostMeta post={post} settings={settings} />}
      </header>
      {post.featuredPath && (
        // biome-ignore lint/performance/noImgElement: arbitrary user uploads
        <img
          src={mediaUrl(post.featuredPath)}
          alt={post.featuredAlt ?? ""}
          className="w-full rounded-lg"
        />
      )}
      <PostBody post={post} />
      {tags.length > 0 && (
        <footer className="flex flex-wrap gap-2 border-t pt-6 text-sm">
          {tags.map((t) => (
            <Link
              key={t.id}
              href={termPath(t.taxonomy, t.slug)}
              className="rounded-full bg-muted px-3 py-1 hover:bg-muted/70"
            >
              #{t.name}
            </Link>
          ))}
        </footer>
      )}
      {post.type === "post" && post.authorBio && (
        <aside className="rounded-lg bg-muted/50 p-5 text-sm">
          <p className="font-medium">About {post.authorName}</p>
          <p className="mt-1 text-muted-foreground">{post.authorBio}</p>
        </aside>
      )}
      {post.type === "post" && !preview && (
        <p className="text-muted-foreground text-xs">
          Published{" "}
          <time dateTime={post.publishedAt?.toISOString()}>
            {formatDate(post.publishedAt, settings)}
          </time>{" "}
          ·{" "}
          <Link
            href={postPath(post, settings.permalinkStructure)}
            className="hover:underline"
          >
            Permalink
          </Link>
        </p>
      )}
      {!preview && (post.type === "post" || post.commentStatus === "open") && (
        <Comments post={post} settings={settings} />
      )}
    </article>
  );
}

// The post body after plugins have had a chance to filter it.
async function PostBody({ post }: { post: SinglePost }) {
  const html = await applyFilters("post.contentHtml", post.contentHtml, {
    post,
  });
  return (
    <div
      className="prose prose-neutral dark:prose-invert max-w-none"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: core renders it from a schema-validated Tiptap document; plugins are trusted, compiled-in code
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
