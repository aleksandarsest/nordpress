import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { hybridSearch } from "@/lib/ai/search";
import { makeExcerpt } from "@/lib/content";
import { mediaUrl } from "@/lib/media";
import { getSettings, type SiteSettings } from "@/lib/options";
import { postPath, type Route, resolveRoute, termPath } from "@/lib/permalinks";
import { applyFilters } from "@/lib/plugins";
import {
  getAuthor,
  getPageTree,
  getPublished,
  type ListQuery,
  listPublished,
} from "@/lib/posts";
import { getTermBySlug } from "@/lib/terms";
import { Comments } from "../_components/comments";
import {
  ArchiveHeader,
  formatDate,
  Paging,
  PostList,
  PostMeta,
  SearchForm,
} from "../_components/theme";

type Props = PageProps<"/[[...path]]">;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function routeFor({
  params,
  searchParams,
}: Props): Promise<{ route: Route; requested: string }> {
  const [{ path = [] }, query] = await Promise.all([params, searchParams]);
  const p = first(query.p);
  const pageId = first(query.page_id);
  const pathname = path.length ? `/${path.join("/")}` : "/";
  return {
    route: resolveRoute(path, { p, page_id: pageId, s: first(query.s) }),
    // The part of the URL that identifies content, compared against canonical permalinks
    requested: p
      ? `${pathname}?p=${p}`
      : pageId
        ? `${pathname}?page_id=${pageId}`
        : pathname,
  };
}

export default function SitePage(props: Props) {
  return (
    <Suspense fallback={<ContentSkeleton />}>
      <Resolved {...props} />
    </Suspense>
  );
}

async function Resolved(props: Props) {
  const [{ route, requested }, settings] = await Promise.all([
    routeFor(props),
    getSettings(),
  ]);
  if (!settings.installed) redirect("/install");
  const view = await resolveView(route, settings, requested);
  if (!view) notFound();
  if (view.kind === "redirect") redirect(view.to);
  return view.node;
}

type View =
  | { kind: "redirect"; to: string }
  | {
      kind: "render";
      node: React.ReactNode;
      title?: string;
      description?: string;
    };

async function resolveView(
  route: Route,
  settings: SiteSettings,
  requested: string,
): Promise<View | null> {
  const list = (query: Omit<ListQuery, "perPage">) =>
    listPublished({ ...query, perPage: settings.postsPerPage });

  switch (route.kind) {
    case "home": {
      if (
        settings.showOnFront === "page" &&
        settings.pageOnFront &&
        route.page === 1
      ) {
        const front = await getPublished({ id: settings.pageOnFront });
        if (front)
          return { kind: "render", node: renderSingle(front, settings, true) };
      }
      const result = await list({ page: route.page });
      if (route.page > result.pages) return null;
      return {
        kind: "render",
        node: (
          <>
            {result.items.length === 0 ? (
              <p className="text-muted-foreground">
                Nothing has been published yet.
              </p>
            ) : (
              <PostList posts={result.items} settings={settings} />
            )}
            <Paging page={result.page} pages={result.pages} base="/" />
          </>
        ),
      };
    }
    case "single":
    case "page-by-id":
      return singleById(route.id, settings, requested);
    case "dated": {
      const post = await getPublished({ type: "post", slug: route.slug });
      return post ? canonical(post, settings, requested) : null;
    }
    case "slug": {
      const tree = await getPageTree();
      const path = route.slugs.join("/");
      const page = tree.find((p) => p.path === path);
      if (page) {
        if (
          page.id === settings.pageForPosts &&
          settings.showOnFront === "page"
        ) {
          const result = await list({});
          return {
            kind: "render",
            title: page.title,
            node: (
              <>
                <ArchiveHeader title={page.title} />
                <PostList posts={result.items} settings={settings} />
                <Paging page={1} pages={result.pages} base={`/${path}`} />
              </>
            ),
          };
        }
        return singleById(page.id, settings, requested);
      }
      if (route.slugs.length === 1) {
        const post = await getPublished({ type: "post", slug: route.slugs[0] });
        if (post) return canonical(post, settings, requested);
      }
      return null;
    }
    case "term": {
      const term = await getTermBySlug(route.taxonomy, route.slug);
      if (!term) return null;
      const result = await list({ termId: term.id, page: route.page });
      const label = route.taxonomy === "category" ? "Category" : "Tag";
      return {
        kind: "render",
        title: term.name,
        description: term.description,
        node: (
          <>
            <ArchiveHeader
              title={`${label}: ${term.name}`}
              description={term.description}
            />
            {result.items.length === 0 ? (
              <p className="text-muted-foreground">
                No posts in this {label.toLowerCase()} yet.
              </p>
            ) : (
              <PostList posts={result.items} settings={settings} />
            )}
            <Paging
              page={result.page}
              pages={result.pages}
              base={termPath(route.taxonomy, term.slug)}
            />
          </>
        ),
      };
    }
    case "author": {
      const author = await getAuthor(route.id);
      if (!author) return null;
      const result = await list({ authorId: author.id, page: route.page });
      return {
        kind: "render",
        title: author.name,
        node: (
          <>
            <ArchiveHeader
              title={`Author: ${author.name}`}
              description={author.bio ?? undefined}
            />
            <PostList posts={result.items} settings={settings} />
            <Paging
              page={result.page}
              pages={result.pages}
              base={`/author/${author.id}`}
            />
          </>
        ),
      };
    }
    case "search": {
      // Ranks by meaning and keywords when embeddings are configured
      const result = route.query
        ? await hybridSearch(route.query, route.page, settings.postsPerPage)
        : null;
      return {
        kind: "render",
        title: `Search results for “${route.query}”`,
        node: (
          <>
            <ArchiveHeader
              title={
                route.query ? `Search results for: ${route.query}` : "Search"
              }
            />
            <div className="mb-10">
              <SearchForm query={route.query} />
            </div>
            {result && result.items.length === 0 && (
              <p className="text-muted-foreground">
                Sorry, but nothing matched your search terms. Please try again
                with some different keywords.
              </p>
            )}
            {result && <PostList posts={result.items} settings={settings} />}
            {result && (
              <Paging
                page={result.page}
                pages={result.pages}
                base={`/?s=${encodeURIComponent(route.query)}`}
              />
            )}
          </>
        ),
      };
    }
    case "date-archive": {
      const result = await list({
        year: route.year,
        month: route.month,
        page: route.page,
      });
      const title = route.month
        ? new Date(Date.UTC(route.year, route.month - 1, 1)).toLocaleDateString(
            "en",
            { month: "long", year: "numeric", timeZone: "UTC" },
          )
        : String(route.year);
      return {
        kind: "render",
        title,
        node: (
          <>
            <ArchiveHeader title={`Archives: ${title}`} />
            <PostList posts={result.items} settings={settings} />
            <Paging
              page={result.page}
              pages={result.pages}
              base={`/${route.year}${route.month ? `/${String(route.month).padStart(2, "0")}` : ""}`}
            />
          </>
        ),
      };
    }
    default:
      return null;
  }
}

type Single = NonNullable<Awaited<ReturnType<typeof getPublished>>>;

async function singleById(
  id: number,
  settings: SiteSettings,
  requested: string,
): Promise<View | null> {
  const post = await getPublished({ id });
  return post ? canonical(post, settings, requested) : null;
}

// Like WordPress's redirect_canonical: old or alternate URLs forward to the
// post's current permalink.
async function canonical(
  post: Single,
  settings: SiteSettings,
  requested: string,
): Promise<View> {
  if (
    post.type === "page" &&
    post.id === settings.pageOnFront &&
    settings.showOnFront === "page"
  ) {
    return { kind: "redirect", to: "/" };
  }
  const pagePath =
    post.type === "page"
      ? (await getPageTree()).find((p) => p.id === post.id)?.path
      : undefined;
  const expected = postPath(post, settings.permalinkStructure, pagePath);
  if (expected !== requested) return { kind: "redirect", to: expected };
  return {
    kind: "render",
    title: post.title,
    description: post.excerpt || makeExcerpt(post.contentText, 30),
    node: renderSingle(post, settings),
  };
}

function renderSingle(post: Single, settings: SiteSettings, isFront = false) {
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
      {post.type === "post" && (
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
      {(post.type === "post" || post.commentStatus === "open") && (
        <Comments post={post} settings={settings} />
      )}
    </article>
  );
}

function ContentSkeleton() {
  return (
    <div className="grid animate-pulse gap-4" aria-hidden>
      <div className="h-9 w-2/3 rounded bg-muted" />
      <div className="h-4 w-1/3 rounded bg-muted" />
      <div className="h-40 rounded bg-muted" />
    </div>
  );
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const [{ route, requested }, settings] = await Promise.all([
    routeFor(props),
    getSettings(),
  ]);
  if (!settings.installed) return {};
  const view = await resolveView(route, settings, requested);
  if (view?.kind !== "render") return {};
  return { title: view.title, description: view.description };
}

// The post body after plugins have had a chance to filter it.
async function PostBody({ post }: { post: Single }) {
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
