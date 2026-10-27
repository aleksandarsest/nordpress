import Link from "next/link";
import { UploadImage } from "@/components/upload-image";
import { CONTENT_SIZES } from "@/lib/images";
import type { ResolvedMenuItem } from "@/lib/menus";
import type { SiteSettings } from "@/lib/options";
import type { PostSummary } from "@/lib/posts";
import {
  authorPath,
  formatDate,
  postUrl,
  summaryOf,
  termPath,
} from "@/lib/themes/helpers";
import type {
  ThemeComponents,
  ThemeLayoutProps,
  ThemeSingleProps,
} from "@/lib/themes/types";

// Falls back to top-level pages when no menu is assigned, like WordPress.
function primaryItems({
  menus,
  pages,
  site,
}: Pick<ThemeLayoutProps, "menus" | "pages" | "site">): ResolvedMenuItem[] {
  if (menus.primary) return menus.primary;
  return pages
    .filter((p) => !p.parentId && p.id !== site.pageOnFront)
    .map((p) => ({
      id: p.id,
      label: p.title,
      url: `/${p.path}`,
      newTab: false,
      children: [],
    }));
}

function MenuLink({
  item,
  className,
}: {
  item: ResolvedMenuItem;
  className?: string;
}) {
  return (
    <a
      href={item.url}
      className={className}
      {...(item.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {item.label}
    </a>
  );
}

// Nested items open on hover and on keyboard focus.
function NavMenu({
  items,
  label,
}: {
  items: ResolvedMenuItem[];
  label: string;
}) {
  if (items.length === 0) return null;
  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {items.map((item) => (
          <li key={item.id} className="group relative">
            <MenuLink item={item} className="hover:underline" />
            {item.children.length > 0 && (
              <ul className="invisible absolute top-full right-0 z-20 grid min-w-44 gap-1 rounded-md border bg-background p-2 opacity-0 shadow-md transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                {item.children.map((child) => (
                  <li key={child.id}>
                    <MenuLink
                      item={child}
                      className="block rounded px-2 py-1 hover:bg-muted"
                    />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Layout({ site, menus, pages, options, children }: ThemeLayoutProps) {
  const footer = menus.footer ?? [];
  return (
    <>
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl flex-wrap items-end justify-between gap-4 px-4 py-6">
          <div>
            <Link href="/" className="font-semibold text-xl tracking-tight">
              {site.title}
            </Link>
            {site.tagline && options.showTagline !== false && (
              <p className="text-muted-foreground text-sm">{site.tagline}</p>
            )}
          </div>
          <NavMenu
            items={primaryItems({ menus, pages, site })}
            label="Primary"
          />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
        {children}
      </main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-3xl flex-wrap justify-between gap-4 px-4 py-6 text-muted-foreground text-sm">
          <span>{String(options.footerText || site.title)}</span>
          {footer.length > 0 ? (
            <NavMenu items={footer} label="Footer" />
          ) : (
            <span>
              <Link href="/feed" className="hover:underline">
                RSS
              </Link>
              {" · "}
              <Link href="/login" className="hover:underline">
                Log in
              </Link>
            </span>
          )}
        </div>
      </footer>
    </>
  );
}

function PostMeta({
  post,
  site,
}: {
  post: Pick<PostSummary, "publishedAt" | "authorId" | "authorName" | "terms">;
  site: SiteSettings;
}) {
  const cats = post.terms.filter((t) => t.taxonomy === "category");
  return (
    <p className="text-muted-foreground text-sm">
      <time dateTime={post.publishedAt?.toISOString()}>
        {formatDate(post.publishedAt, site)}
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

function PostList({
  posts,
  site,
}: {
  posts: PostSummary[];
  site: SiteSettings;
}) {
  return (
    <div className="grid gap-12">
      {posts.map((post) => {
        const href = postUrl(post, site);
        return (
          <article key={post.id} className="grid gap-3">
            {post.featuredPath && (
              <Link href={href}>
                <UploadImage
                  path={post.featuredPath}
                  alt={post.featuredAlt ?? ""}
                  width={post.featuredWidth}
                  height={post.featuredHeight}
                  sizes={CONTENT_SIZES}
                  className="aspect-video h-auto w-full rounded-lg object-cover"
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
            <PostMeta post={post} site={site} />
            <p className="text-foreground/80 leading-relaxed">
              {summaryOf(post)}
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

function Single({
  post,
  site,
  options,
  isFront,
  preview,
  body,
  comments,
}: ThemeSingleProps) {
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
        {post.type === "post" && <PostMeta post={post} site={site} />}
      </header>
      {post.featuredPath && (
        <UploadImage
          path={post.featuredPath}
          alt={post.featuredAlt ?? ""}
          width={post.featuredWidth}
          height={post.featuredHeight}
          sizes={CONTENT_SIZES}
          className="h-auto w-full rounded-lg"
          priority
        />
      )}
      {body}
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
      {post.type === "post" &&
        post.authorBio &&
        options.showAuthorBio !== false && (
          <aside className="rounded-lg bg-muted/50 p-5 text-sm">
            <p className="font-medium">About {post.authorName}</p>
            <p className="mt-1 text-muted-foreground">{post.authorBio}</p>
          </aside>
        )}
      {post.type === "post" && !preview && (
        <p className="text-muted-foreground text-xs">
          Published{" "}
          <time dateTime={post.publishedAt?.toISOString()}>
            {formatDate(post.publishedAt, site)}
          </time>{" "}
          ·{" "}
          <Link href={postUrl(post, site)} className="hover:underline">
            Permalink
          </Link>
        </p>
      )}
      {comments}
    </article>
  );
}

function ArchiveHeader({
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

function Paging({
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

function SearchForm({ query = "" }: { query?: string }) {
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

function Empty({ message }: { message: string }) {
  return <p className="text-muted-foreground">{message}</p>;
}

export const classicComponents: ThemeComponents = {
  Layout,
  Single,
  PostList,
  ArchiveHeader,
  Paging,
  SearchForm,
  Empty,
};
