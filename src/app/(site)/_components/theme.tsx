import Link from "next/link";
import { makeExcerpt } from "@/lib/content";
import { formatInZone } from "@/lib/dates";
import { mediaUrl } from "@/lib/media";
import type { SiteSettings } from "@/lib/options";
import { authorPath, postPath, termPath } from "@/lib/permalinks";
import type { PostSummary } from "@/lib/posts";

export function formatDate(date: Date | null, settings: SiteSettings) {
  if (!date) return "";
  return formatInZone(date, settings.timezone, settings.dateFormat);
}

export function PostMeta({
  post,
  settings,
}: {
  post: Pick<PostSummary, "publishedAt" | "authorId" | "authorName" | "terms">;
  settings: SiteSettings;
}) {
  const cats = post.terms.filter((t) => t.taxonomy === "category");
  return (
    <p className="text-muted-foreground text-sm">
      <time dateTime={post.publishedAt?.toISOString()}>
        {formatDate(post.publishedAt, settings)}
      </time>
      {post.authorId && post.authorName && (
        <>
          {" · "}
          <Link href={authorPath(post.authorId)} className="hover:underline">
            {post.authorName}
          </Link>
        </>
      )}
      {cats.length > 0 && (
        <>
          {" · "}
          {cats.map((c, i) => (
            <span key={c.id}>
              {i > 0 && ", "}
              <Link
                href={termPath(c.taxonomy, c.slug)}
                className="hover:underline"
              >
                {c.name}
              </Link>
            </span>
          ))}
        </>
      )}
    </p>
  );
}

export function PostList({
  posts,
  settings,
}: {
  posts: PostSummary[];
  settings: SiteSettings;
}) {
  return (
    <div className="grid gap-12">
      {posts.map((post) => {
        const href = postPath(post, settings.permalinkStructure);
        return (
          <article key={post.id} className="grid gap-3">
            {post.featuredPath && (
              <Link href={href}>
                {/* biome-ignore lint/performance/noImgElement: arbitrary user uploads */}
                <img
                  src={mediaUrl(post.featuredPath)}
                  alt={post.featuredAlt ?? ""}
                  className="aspect-video w-full rounded-lg object-cover"
                />
              </Link>
            )}
            <h2 className="font-semibold text-2xl tracking-tight">
              <Link href={href} className="hover:underline">
                {post.title || "(no title)"}
              </Link>
              {post.sticky && (
                <span className="ml-2 align-middle font-normal text-muted-foreground text-xs uppercase">
                  Featured
                </span>
              )}
            </h2>
            <PostMeta post={post} settings={settings} />
            <p className="text-foreground/80 leading-relaxed">
              {post.excerpt || makeExcerpt(post.contentText)}
            </p>
            <Link href={href} className="text-primary text-sm hover:underline">
              Continue reading<span className="sr-only"> {post.title}</span> →
            </Link>
          </article>
        );
      })}
    </div>
  );
}

export function ArchiveHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <header className="mb-10 border-b pb-6">
      <h1 className="font-semibold text-3xl tracking-tight">{title}</h1>
      {description && (
        <p className="mt-2 text-muted-foreground">{description}</p>
      )}
    </header>
  );
}

export function Paging({
  page,
  pages,
  base,
}: {
  page: number;
  pages: number;
  base: string;
}) {
  if (pages <= 1) return null;
  const [rawPath, query] = base.split("?");
  const path = rawPath.replace(/\/+$/, "");
  const href = (p: number) => {
    const target = p === 1 ? path || "/" : `${path}/page/${p}`;
    return query ? `${target}?${query}` : target;
  };
  return (
    <nav
      aria-label="Posts"
      className="mt-12 flex justify-between border-t pt-6 text-sm"
    >
      {page < pages ? (
        <Link href={href(page + 1)} className="hover:underline">
          ← Older posts
        </Link>
      ) : (
        <span />
      )}
      {page > 1 ? (
        <Link href={href(page - 1)} className="hover:underline">
          Newer posts →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

export function SearchForm({ query = "" }: { query?: string }) {
  return (
    <form action="/" aria-label="Search" className="flex gap-2">
      <label htmlFor="site-search" className="sr-only">
        Search for:
      </label>
      <input
        id="site-search"
        name="s"
        type="search"
        defaultValue={query}
        placeholder="Search…"
        className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
      />
      <button
        type="submit"
        className="h-9 rounded-lg bg-primary px-4 text-primary-foreground text-sm"
      >
        Search
      </button>
    </form>
  );
}
