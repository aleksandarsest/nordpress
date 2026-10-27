import Link from "next/link";
import type { CSSProperties } from "react";
import { UploadImage } from "@/components/upload-image";
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
  ThemeOptions,
  ThemeSingleProps,
} from "@/lib/themes/types";

// Nord palette (https://www.nordtheme.com), MIT licensed
export const ACCENTS: Record<string, string> = {
  frost: "#5E81AC",
  green: "#A3BE8C",
  purple: "#B48EAD",
  orange: "#D08770",
  red: "#BF616A",
};

function accentOf(options: ThemeOptions) {
  return ACCENTS[String(options.accent)] ?? ACCENTS.frost;
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

function PrimaryMenu({ items }: { items: ResolvedMenuItem[] }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Primary">
      <ul className="flex flex-wrap gap-1 text-sm">
        {items.map((item) => (
          <li key={item.id} className="group relative">
            <MenuLink
              item={item}
              className="block rounded-md px-3 py-2 text-[#D8DEE9] transition hover:bg-[#3B4252] hover:text-white"
            />
            {item.children.length > 0 && (
              <ul className="invisible absolute top-full left-0 z-20 grid min-w-52 gap-0.5 rounded-lg bg-[#3B4252] p-1.5 opacity-0 shadow-xl transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                {item.children.map((child) => (
                  <li key={child.id}>
                    <MenuLink
                      item={child}
                      className="block rounded-md px-3 py-2 text-[#E5E9F0] hover:bg-[#434C5E]"
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
      className="flex flex-1 flex-col bg-[#ECEFF4] text-[#2E3440]"
      style={{ "--nord-accent": accentOf(options) } as CSSProperties}
    >
      <header className="bg-[#2E3440]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-4">
          <Link href="/" className="flex items-center gap-3">
            <span
              aria-hidden
              className="size-3 rotate-45 rounded-[3px] bg-[var(--nord-accent)]"
            />
            <span className="font-semibold text-[#ECEFF4] text-lg tracking-tight">
              {site.title}
            </span>
          </Link>
          <PrimaryMenu items={primary} />
        </div>
        {site.tagline && (
          <div className="border-[#3B4252] border-t">
            <p className="mx-auto max-w-5xl px-5 py-2 text-[#81A1C1] text-xs uppercase tracking-[0.2em]">
              {site.tagline}
            </p>
          </div>
        )}
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-12">
        {children}
      </main>
      <footer className="bg-[#2E3440] text-[#D8DEE9] text-sm">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-8">
          <span>{String(options.footerText || `© ${site.title}`)}</span>
          {footer.length > 0 ? (
            <nav aria-label="Footer">
              <ul className="flex flex-wrap gap-4">
                {footer.map((item) => (
                  <li key={item.id}>
                    <MenuLink item={item} className="hover:text-white" />
                  </li>
                ))}
              </ul>
            </nav>
          ) : (
            <span className="text-[#81A1C1]">
              <Link href="/feed" className="hover:text-white">
                RSS
              </Link>{" "}
              ·{" "}
              <Link href="/login" className="hover:text-white">
                Log in
              </Link>
            </span>
          )}
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
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[#4C566A] text-xs uppercase tracking-wider">
      {category && (
        <Link
          href={termPath(category.taxonomy, category.slug)}
          className="font-semibold text-[var(--nord-accent)] hover:underline"
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
  options,
}: {
  posts: PostSummary[];
  site: SiteSettings;
  options: ThemeOptions;
}) {
  const grid = options.listLayout !== "list";
  return (
    <div className={grid ? "grid gap-6 sm:grid-cols-2" : "grid gap-6"}>
      {posts.map((post) => {
        const href = postUrl(post, site);
        return (
          <article
            key={post.id}
            className="flex flex-col overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-[#D8DEE9] transition hover:shadow-md"
          >
            {post.featuredPath ? (
              <Link href={href} tabIndex={-1} aria-hidden>
                <UploadImage
                  path={post.featuredPath}
                  alt=""
                  width={post.featuredWidth}
                  height={post.featuredHeight}
                  sizes={
                    grid
                      ? "(min-width: 640px) 480px, 100vw"
                      : "(min-width: 1024px) 960px, 100vw"
                  }
                  className="aspect-[16/9] h-auto w-full object-cover"
                />
              </Link>
            ) : (
              <div aria-hidden className="h-1.5 bg-[var(--nord-accent)]" />
            )}
            <div className="flex flex-1 flex-col gap-3 p-6">
              <Meta post={post} site={site} />
              <h2 className="font-semibold text-xl leading-snug tracking-tight">
                <Link href={href} className="hover:text-[var(--nord-accent)]">
                  {post.title || "(no title)"}
                </Link>
              </h2>
              <p className="flex-1 text-[#4C566A] text-sm leading-relaxed">
                {summaryOf(post, 30)}
              </p>
              <Link
                href={href}
                className="font-medium text-[var(--nord-accent)] text-sm hover:underline"
              >
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
  options,
  isFront,
  preview,
  body,
  comments,
}: ThemeSingleProps) {
  const tags = post.terms.filter((t) => t.taxonomy === "post_tag");
  return (
    <article className="mx-auto grid max-w-3xl gap-8">
      <header className="grid gap-4 text-center">
        {post.type === "post" && (
          <div className="flex justify-center">
            <Meta post={post} site={site} />
          </div>
        )}
        <h1
          className={
            isFront
              ? "sr-only"
              : "font-semibold text-4xl leading-tight tracking-tight sm:text-5xl"
          }
        >
          {post.title}
        </h1>
      </header>
      {post.featuredPath && options.featuredOnSingle !== false && (
        <UploadImage
          path={post.featuredPath}
          alt={post.featuredAlt ?? ""}
          width={post.featuredWidth}
          height={post.featuredHeight}
          sizes="(min-width: 800px) 768px, 100vw"
          className="h-auto w-full rounded-xl shadow-sm"
          priority
        />
      )}
      <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-[#D8DEE9] sm:p-10">
        {body}
      </div>
      {tags.length > 0 && (
        <ul className="flex flex-wrap justify-center gap-2 text-sm">
          {tags.map((t) => (
            <li key={t.id}>
              <Link
                href={termPath(t.taxonomy, t.slug)}
                className="rounded-full bg-[#E5E9F0] px-3 py-1 text-[#434C5E] hover:bg-[var(--nord-accent)] hover:text-white"
              >
                {t.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {post.type === "post" && post.authorBio && !preview && (
        <aside className="flex gap-4 rounded-xl bg-[#2E3440] p-6 text-[#D8DEE9] text-sm">
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--nord-accent)] font-semibold text-white"
          >
            {post.authorName?.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <p className="font-semibold text-[#ECEFF4]">{post.authorName}</p>
            <p className="mt-1">{post.authorBio}</p>
          </div>
        </aside>
      )}
      {comments && (
        <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-[#D8DEE9]">
          {comments}
        </div>
      )}
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
    <header className="mb-10 grid gap-2">
      <h1 className="font-semibold text-3xl tracking-tight">{title}</h1>
      {description && <p className="max-w-2xl text-[#4C566A]">{description}</p>}
      <div
        aria-hidden
        className="mt-2 h-1 w-16 rounded-full bg-[var(--nord-accent)]"
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
  const button =
    "rounded-lg bg-white px-4 py-2 text-sm shadow-sm ring-1 ring-[#D8DEE9] hover:text-[var(--nord-accent)]";
  return (
    <nav aria-label="Posts" className="mt-12 flex items-center justify-between">
      {page > 1 ? (
        <Link href={href(page - 1)} className={button}>
          ← Newer
        </Link>
      ) : (
        <span />
      )}
      <span className="text-[#4C566A] text-sm">
        Page {page} of {pages}
      </span>
      {page < pages ? (
        <Link href={href(page + 1)} className={button}>
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
        className="h-11 w-full rounded-lg border-0 bg-white px-4 text-sm shadow-sm ring-1 ring-[#D8DEE9] focus:outline-none focus:ring-2 focus:ring-[var(--nord-accent)]"
      />
      <button
        type="submit"
        className="h-11 rounded-lg bg-[var(--nord-accent)] px-5 font-medium text-sm text-white"
      >
        Search
      </button>
    </form>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <p className="rounded-xl bg-white p-8 text-center text-[#4C566A] shadow-sm ring-1 ring-[#D8DEE9]">
      {message}
    </p>
  );
}

export const nordComponents: ThemeComponents = {
  Layout,
  Single,
  PostList,
  ArchiveHeader,
  Paging,
  SearchForm,
  Empty,
};
