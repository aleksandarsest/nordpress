import type { SiteSettings } from "./options";
import { authorPath, termPath } from "./permalinks";
import { siteUrl } from "./site-url";
import type { SinglePost } from "./themes/types";

// schema.org descriptions that search engines and AI assistants use to
// understand what a page is, who wrote it and when.

export function postJsonLd(
  post: SinglePost,
  settings: SiteSettings,
  path: string,
  markdownPath: string,
) {
  const url = siteUrl(path);
  const tags = post.terms.filter((t) => t.taxonomy === "post_tag");
  const category = post.terms.find((t) => t.taxonomy === "category");
  return {
    "@context": "https://schema.org",
    "@type": post.type === "post" ? "BlogPosting" : "WebPage",
    "@id": url,
    url,
    mainEntityOfPage: url,
    headline: post.title,
    name: post.title,
    ...(post.excerpt && { description: post.excerpt }),
    ...(post.publishedAt && { datePublished: post.publishedAt.toISOString() }),
    dateModified: post.updatedAt.toISOString(),
    ...(post.featuredPath && {
      image: siteUrl(`/uploads/${post.featuredPath}`),
    }),
    ...(post.type === "post" &&
      post.authorName &&
      post.authorId && {
        author: {
          "@type": "Person",
          name: post.authorName,
          url: siteUrl(authorPath(post.authorId)),
        },
      }),
    ...(category && {
      articleSection: category.name,
      about: {
        "@type": "Thing",
        name: category.name,
        url: siteUrl(termPath(category.taxonomy, category.slug)),
      },
    }),
    ...(tags.length && { keywords: tags.map((t) => t.name).join(", ") }),
    isPartOf: { "@type": "WebSite", name: settings.title, url: siteUrl("/") },
    publisher: {
      "@type": "Organization",
      name: settings.title,
      url: siteUrl("/"),
    },
    // Points agents at the cleaner Markdown copy of this page
    encoding: {
      "@type": "MediaObject",
      encodingFormat: "text/markdown",
      contentUrl: siteUrl(markdownPath),
    },
  };
}

export function websiteJsonLd(settings: SiteSettings) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: settings.title,
    ...(settings.tagline && { description: settings.tagline }),
    url: siteUrl("/"),
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteUrl("/")}?s={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}
