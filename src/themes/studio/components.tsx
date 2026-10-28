import { Menu } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { UploadImage } from "@/components/upload-image";
import { designAttributes, designVars, readDesign } from "@/lib/design";
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
import { DesignPreview } from "./design-preview";
import { fontVariables } from "./fonts";

// Studio: a theme drawn entirely from the site's design (Appearance →
// Design). Colors, fonts, shapes and layouts are CSS variables and data
// attributes, styled in studio.css; components only lay out content.

function MenuLink({ item }: { item: ResolvedMenuItem }) {
  return (
    <a
      href={item.url}
      {...(item.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {item.label}
    </a>
  );
}

function MenuItems({ items }: { items: ResolvedMenuItem[] }) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id}>
          <MenuLink item={item} />
          {item.children.length > 0 && (
            <ul className="studio-submenu">
              {item.children.map((child) => (
                <li key={child.id}>
                  <MenuLink item={child} />
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

function Layout({ site, menus, pages, logo, children }: ThemeLayoutProps) {
  const design = readDesign(site.design);
  const primary =
    menus.primary ??
    pages
      .filter((p) => !p.parentId && p.id !== site.pageOnFront)
      .map((p) => ({
        id: p.id,
        label: p.title,
        url: `/${p.path}`,
        newTab: false,
        children: [],
      }));
  const footer = menus.footer ?? [];
  return (
    <div
      className={`studio ${fontVariables} flex flex-1 flex-col`}
      style={designVars(design) as CSSProperties}
      {...designAttributes(design)}
    >
      <DesignPreview />
      <header className="studio-header">
        <div className="studio-container studio-header-inner">
          <Link href="/" className="studio-brand">
            {logo ? (
              // biome-ignore lint/performance/noImgElement: the owner's own upload, any format
              <img
                src={logo.url}
                alt={site.title}
                width={logo.width ?? undefined}
                height={logo.height ?? undefined}
              />
            ) : (
              <span>{site.title}</span>
            )}
            {site.tagline && design.headerLayout !== "split" && (
              <span className="studio-tagline">{site.tagline}</span>
            )}
          </Link>
          {primary.length > 0 && (
            <>
              <nav
                aria-label="Primary"
                className="studio-nav studio-nav-desktop"
              >
                <MenuItems items={primary} />
              </nav>
              <details className="studio-menu-toggle">
                <summary>
                  <Menu className="size-4" aria-hidden /> Menu
                </summary>
                <nav aria-label="Primary" className="studio-nav">
                  <MenuItems items={primary} />
                </nav>
              </details>
            </>
          )}
        </div>
      </header>
      <main className="studio-main">
        <div className="studio-container">{children}</div>
      </main>
      <footer className="studio-footer">
        <div className="studio-container flex flex-wrap items-start justify-between gap-6 py-10">
          <div className="grid gap-1">
            <span className="font-semibold text-[var(--d-text)]">
              {site.title}
            </span>
            {site.tagline && <span>{site.tagline}</span>}
          </div>
          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-5 gap-y-2">
              {footer.map((item) => (
                <li key={item.id}>
                  <MenuLink item={item} />
                </li>
              ))}
              <li>
                <Link href="/feed">RSS</Link>
              </li>
              <li>
                <Link href="/login">Log in</Link>
              </li>
            </ul>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function Meta({
  post,
  site,
}: {
  post: Pick<PostSummary, "publishedAt" | "authorId" | "authorName" | "terms">;
  site: SiteSettings;
}) {
  const category = post.terms.find((t) => t.taxonomy === "category");
  return (
    <p className="studio-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8em]">
      {category && (
        <Link
          href={termPath(category.taxonomy, category.slug)}
          className="studio-link font-semibold uppercase tracking-wider"
        >
          {category.name}
        </Link>
      )}
      <time dateTime={post.publishedAt?.toISOString()}>
        {formatDate(post.publishedAt, site)}
      </time>
      {post.authorId && post.authorName && (
        <Link href={authorPath(post.authorId)} className="hover:underline">
          {post.authorName}
        </Link>
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
    <div className="studio-posts">
      {posts.map((post, i) => {
        const href = postUrl(post, site);
        return (
          <article key={post.id} className="studio-card studio-post">
            {post.featuredPath && (
              <Link
                href={href}
                tabIndex={-1}
                aria-hidden
                className="studio-post-image"
              >
                <UploadImage
                  path={post.featuredPath}
                  alt=""
                  width={post.featuredWidth}
                  height={post.featuredHeight}
                  sizes={
                    i === 0
                      ? "(min-width: 768px) 60vw, 100vw"
                      : "(min-width: 640px) 33vw, 100vw"
                  }
                  priority={i === 0}
                />
              </Link>
            )}
            <div className="studio-post-body">
              <Meta post={post} site={site} />
              <h2 className="font-bold text-[1.35em]">
                <Link href={href} className="hover:text-[var(--d-link)]">
                  {post.title || "(no title)"}
                </Link>
              </h2>
              <p className="studio-muted flex-1 text-[0.95em]">
                {summaryOf(post, 30)}
              </p>
              <Link href={href} className="studio-link text-[0.9em]">
                Read more<span className="sr-only"> about {post.title}</span> →
              </Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function Single({
  post,
  site,
  isFront,
  preview,
  body,
  comments,
}: ThemeSingleProps) {
  const tags = post.terms.filter((t) => t.taxonomy === "post_tag");
  const reading = post.type === "post";
  return (
    <article className={`mx-auto grid gap-8 ${reading ? "max-w-3xl" : ""}`}>
      <header className={`grid gap-4 ${reading ? "text-center" : ""}`}>
        {reading && (
          <div className="flex justify-center">
            <Meta post={post} site={site} />
          </div>
        )}
        <h1
          className={
            isFront ? "sr-only" : "font-bold text-[clamp(2rem,5vw,3.25rem)]"
          }
        >
          {post.title}
        </h1>
      </header>
      {post.featuredPath && (
        <UploadImage
          path={post.featuredPath}
          alt={post.featuredAlt ?? ""}
          width={post.featuredWidth}
          height={post.featuredHeight}
          sizes="(min-width: 1024px) 960px, 100vw"
          className="h-auto w-full rounded-[var(--d-radius)]"
          priority
        />
      )}
      <div className={reading ? "" : "studio-page-body"}>{body}</div>
      {tags.length > 0 && (
        <ul className="flex flex-wrap justify-center gap-2 text-[0.85em]">
          {tags.map((t) => (
            <li key={t.id}>
              <Link
                href={termPath(t.taxonomy, t.slug)}
                className="block rounded-[var(--d-button-radius)] border border-[var(--d-border)] px-3 py-1 hover:border-[var(--d-link)] hover:text-[var(--d-link)]"
              >
                {t.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {reading && post.authorBio && !preview && (
        <aside className="studio-card flex gap-4 p-6 text-[0.95em]">
          <span
            aria-hidden
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--d-accent)] font-semibold text-[var(--d-on-accent)]"
          >
            {post.authorName?.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <p className="font-semibold">{post.authorName}</p>
            <p className="studio-muted mt-1">{post.authorBio}</p>
          </div>
        </aside>
      )}
      {comments && <div className="studio-card p-6">{comments}</div>}
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
    <header className="mb-10 grid gap-3">
      <h1 className="font-bold text-[clamp(1.9rem,4vw,2.75rem)]">{title}</h1>
      {description && (
        <p className="studio-muted max-w-2xl text-[1.05em]">{description}</p>
      )}
      <span
        aria-hidden
        className="h-1 w-14 rounded-full bg-[var(--d-accent)]"
      />
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
      className="mt-12 flex items-center justify-between gap-4"
    >
      {page > 1 ? (
        <Link href={href(page - 1)} className="studio-button">
          ← Newer
        </Link>
      ) : (
        <span />
      )}
      <span className="studio-muted text-[0.9em]">
        Page {page} of {pages}
      </span>
      {page < pages ? (
        <Link href={href(page + 1)} className="studio-button">
          Older →
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
        placeholder="Search the site…"
        className="h-11 w-full rounded-[var(--d-radius)] border border-[var(--d-border)] bg-[var(--d-surface)] px-4 focus:outline-none focus:ring-2 focus:ring-[var(--d-link)]"
      />
      <button type="submit" className="studio-button">
        Search
      </button>
    </form>
  );
}

function Empty({ message }: { message: string }) {
  return <p className="studio-card studio-muted p-8 text-center">{message}</p>;
}

export const studioComponents: ThemeComponents = {
  Layout,
  Single,
  PostList,
  ArchiveHeader,
  Paging,
  SearchForm,
  Empty,
};
