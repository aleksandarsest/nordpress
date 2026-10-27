import type { Metadata } from "next";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { JsonLd } from "@/components/json-ld";
import { hybridSearch } from "@/lib/ai/search";
import { markdownPath } from "@/lib/ai-readable";
import { makeExcerpt } from "@/lib/content";
import { getSettings, type SiteSettings } from "@/lib/options";
import { postPath, type Route, resolveRoute, termPath } from "@/lib/permalinks";
import {
  getAuthor,
  getPageTree,
  getPublished,
  type ListQuery,
  listPublished,
} from "@/lib/posts";
import { websiteJsonLd } from "@/lib/structured-data";
import { getTermBySlug } from "@/lib/terms";
import { activeTheme, getThemeOptions } from "@/lib/themes";
import { type SinglePost, SingleView } from "../_components/single";

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

// Resolved before anything streams, so missing content gets a real 404
// status and canonical redirects are real HTTP redirects.
export const instant = false;

export default async function SitePage(props: Props) {
  const [{ route, requested }, settings] = await Promise.all([
    routeFor(props),
    getSettings(),
  ]);
  if (!settings.installed) redirect("/install");
  const view = await resolveView(route, settings, requested);
  if (!view) notFound();
  if (view.kind === "redirect") permanentRedirect(view.to);
  return view.node;
}

type View =
  | { kind: "redirect"; to: string }
  | {
      kind: "render";
      node: React.ReactNode;
      title?: string;
      description?: string;
      /** Address of the Markdown version, for <link rel="alternate">. */
      markdown?: string;
    };

async function resolveView(
  route: Route,
  settings: SiteSettings,
  requested: string,
): Promise<View | null> {
  const list = (query: Omit<ListQuery, "perPage">) =>
    listPublished({ ...query, perPage: settings.postsPerPage });
  // Archive views render through the active theme's components
  const theme = await activeTheme();
  const options = await getThemeOptions(theme.slug);
  const { ArchiveHeader, Empty, Paging, PostList, SearchForm } =
    theme.components;

  switch (route.kind) {
    case "home": {
      if (
        settings.showOnFront === "page" &&
        settings.pageOnFront &&
        route.page === 1
      ) {
        const front = await getPublished({ id: settings.pageOnFront });
        if (front)
          return {
            kind: "render",
            node: <SingleView post={front} isFront />,
          };
      }
      const result = await list({ page: route.page });
      if (route.page > result.pages) return null;
      return {
        kind: "render",
        node: (
          <>
            {route.page === 1 && <JsonLd data={websiteJsonLd(settings)} />}
            {result.items.length === 0 ? (
              <Empty message="Nothing has been published yet." />
            ) : (
              <PostList
                posts={result.items}
                site={settings}
                options={options}
              />
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
                <ArchiveHeader options={options} title={page.title} />
                <PostList
                  posts={result.items}
                  site={settings}
                  options={options}
                />
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
              options={options}
              title={`${label}: ${term.name}`}
              description={term.description}
            />
            {result.items.length === 0 ? (
              <Empty message={`No posts in this ${label.toLowerCase()} yet.`} />
            ) : (
              <PostList
                posts={result.items}
                site={settings}
                options={options}
              />
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
              options={options}
              title={`Author: ${author.name}`}
              description={author.bio ?? undefined}
            />
            <PostList posts={result.items} site={settings} options={options} />
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
              options={options}
              title={
                route.query ? `Search results for: ${route.query}` : "Search"
              }
            />
            <div className="mb-10">
              <SearchForm query={route.query} />
            </div>
            {result && result.items.length === 0 && (
              <Empty message="Sorry, but nothing matched your search terms. Please try again with some different keywords." />
            )}
            {result && (
              <PostList
                posts={result.items}
                site={settings}
                options={options}
              />
            )}
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
            <ArchiveHeader options={options} title={`Archives: ${title}`} />
            <PostList posts={result.items} site={settings} options={options} />
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

type Single = SinglePost;

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
    markdown: markdownPath(expected),
    title: post.title,
    description: post.excerpt || makeExcerpt(post.contentText, 30),
    node: <SingleView post={post} />,
  };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const [{ route, requested }, settings] = await Promise.all([
    routeFor(props),
    getSettings(),
  ]);
  if (!settings.installed) return {};
  const view = await resolveView(route, settings, requested);
  if (view?.kind !== "render") return {};
  return {
    title: view.title,
    description: view.description,
    ...(view.markdown && {
      alternates: { types: { "text/markdown": view.markdown } },
    }),
  };
}
