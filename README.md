# Nordpress

An open-source content management system in the spirit of WordPress, built on a modern TypeScript stack: posts, pages,
categories and tags, media, users with WordPress's roles, settings, and a
public theme with WordPress-compatible permalinks, threaded comments, and a
WordPress-compatible REST API, plus AI writing tools powered by Claude.

## Stack

| Layer | Choice |
| --- | --- |
| Runtime | Node 24 LTS (`.nvmrc`), pnpm 12 |
| Framework | Next.js 16.4 (App Router, Cache Components, React Compiler), React 19.3 |
| Language | TypeScript 7 |
| Database | PostgreSQL 17 + Drizzle ORM (pgvector ready for AI search) |
| Auth | Better Auth (email + password, WordPress roles/capabilities) |
| Editor | Tiptap 3 (content stored as JSON, rendered to HTML on save) |
| UI | Tailwind CSS 4, shadcn/ui (Base UI) |
| Tooling | Biome, Vitest |

## Getting started

```bash
nvm use
cp .env.example .env.local   # fill in DATABASE_URL and BETTER_AUTH_SECRET
createdb nordpress
psql -d nordpress -c "create extension if not exists vector"
pnpm install
pnpm db:migrate
pnpm dev
```

Open http://localhost:3000. You'll be sent to `/install` to create the site and its first administrator.

## Media storage

Uploads are stored on local disk by default (`UPLOADS_DIR`). For hosts without a persistent disk, set `STORAGE_DRIVER=s3` with `S3_BUCKET` and credentials. This works with AWS S3 and S3-compatible services: Cloudflare R2, Backblaze B2, DigitalOcean Spaces, MinIO (set `S3_ENDPOINT` for those). See `.env.example`.

Either way, files are served at `/uploads/...` with long-lived cache headers, so URLs never change when you switch storage; put a CDN in front for best performance. Images are resized on demand by the Next.js image optimizer (WebP/AVIF), so no fixed thumbnail sizes are generated.

## Scripts

- `pnpm dev`: development server
- `pnpm build` / `pnpm start`: production build (needs the database reachable at build time)
- `pnpm db:generate`: create a migration after editing `src/db/schema.ts`
- `pnpm db:migrate`: apply migrations
- `pnpm test`, `pnpm typecheck`, `pnpm lint`

## Layout

```
src/
  db/            schema.ts (all tables) and migrations
  lib/           domain logic: posts, terms, media, users, options,
                 capabilities (roles), permalinks (URL routing), auth, session
  app/
    (site)/      public theme; [[...path]] resolves every public URL
    (auth)/      install, login, register
    admin/       the dashboard (posts, pages, media, taxonomies, users, settings)
    api/         auth and media upload endpoints
    wp-json/     the WordPress-compatible REST API (handlers in src/lib/rest)
  lib/ai/        Claude integration: writing assistant, suggestions, alt text, usage
  lib/plugins/   plugin runtime: hook engine, activation, settings, REST routing
  plugins/       installed plugins (one folder each) and the registry
    uploads/     serves uploaded files from UPLOADS_DIR
    feed/        RSS 2.0
```

## REST API (`/wp-json/wp/v2`)

A WordPress-compatible API, so existing clients, apps and scripts keep working.

| Route | Methods |
| --- | --- |
| `/posts`, `/pages` (+ `/{id}`) | list, read, create, update (`POST`/`PUT`/`PATCH`), delete (trash, or `?force=true`) |
| `/categories`, `/tags` (+ `/{id}`) | list, read, create, update, delete (`force=true`) |
| `/media` (+ `/{id}`) | list, read, upload (multipart `file` or raw body with `Content-Disposition`), update, delete |
| `/comments` (+ `/{id}`) | list, read, create (anonymous or authenticated), moderate, delete |
| `/users`, `/users/{id}`, `/users/me` | read |
| `/search`, `/settings`, `/types`, `/taxonomies` | read; settings are writable by administrators |

Supports `page`, `per_page` (max 100), `search`, `_fields`, a practical `_embed` (author, featured media, terms), the `X-WP-Total` / `X-WP-TotalPages` / `Link` headers, and WordPress-shaped errors.

**Authentication:** create an *application password* under **Profile** in the admin, then use HTTP Basic auth with your email address and that password:

```bash
curl -u "you@example.com:abcd efgh ijkl mnop qrst uvwx" \
  -H "Content-Type: application/json" \
  -d '{"title":"Hello","content":"<p>Hi</p>","status":"publish"}' \
  http://localhost:3000/wp-json/wp/v2/posts
```

Logged-in browser sessions also work for same-origin requests. Incoming HTML is parsed into the editor's schema, so scripts and unknown markup are dropped.

**Differences from WordPress:** user IDs are strings, not integers; `content.raw` is HTML (the native editor document is in `content.document` with `context=edit`); avatars and image sizes are empty for now.

## AI features (Claude)

Set `ANTHROPIC_API_KEY` in `.env.local` and restart. Without a key, the AI controls simply don't appear.

- **Writing assistant:** the **AI** menu in the editor toolbar can improve, fix, shorten, lengthen, simplify or re-tone the selection (or the whole post), continue writing, write an excerpt, or follow a custom instruction. Answers stream into a preview; nothing changes until you choose Replace or Insert, and Undo works afterwards.
- **Suggestions:** the **AI Suggestions** card proposes titles, an excerpt, a slug, categories (from your existing ones) and tags (reusing existing tags where they fit). Apply each one individually.
- **Alt text:** **Generate with AI** on a media item, a bulk **Generate with AI** for images missing alt text, and optional automatic alt text for new uploads.
- **Settings → AI:** turn features on or off, pick the model (Claude Opus 5.5 by default; Sonnet 5.5 or Haiku 5.5 for lower cost), and see 30 days of usage with estimated cost.

Model output is treated as untrusted: HTML is passed through the editor's schema before it's shown or inserted, and suggested categories are checked against real ones. Declined requests automatically retry on a fallback model where Anthropic supports it (`fallbacks: "default"`).

## Semantic search and site chat

Add `VOYAGE_API_KEY` (from voyageai.com) to `.env.local` and restart. Then open **Settings → AI** and click **Rebuild search index** once. After that, content is re-indexed automatically whenever it's published, updated or removed.

- **Search** ranks by meaning and keywords together (reciprocal rank fusion over pgvector similarity and Postgres full-text search). Without a Voyage key it uses keywords only.
- **Site chat** ("Ask this site") answers visitors from your published content, citing the posts it used. It is **off by default**; turn it on under Settings → AI. Limits: 12 questions per visitor every 10 minutes, and a site-wide daily cap (300 by default). The per-visitor limit is kept in memory per server process, so use a shared store if you run several instances.

How it works: published posts and pages are split into passages of about 600 tokens (`src/lib/ai/chunk.ts`), embedded with `voyage-4` (1024 dimensions) into the `post_chunks` table with an HNSW index. Unchanged passages are never re-embedded. Chat sends the best passages to Claude as `search_result` blocks, so answers come with citations.

`VOYAGE_BASE_URL` optionally points the embeddings client somewhere else (a proxy, or a local test double).

## Plugins

Plugins work like WordPress's: they hook into core through **actions** (react to events) and **filters** (change values), can have a settings page, and can add REST routes. Manage them under **Admin → Plugins**; activating or deactivating takes effect immediately.

Because the site is compiled, plugins are part of the codebase rather than uploaded through the admin. To install one, add a folder under `src/plugins/` and list it in `src/plugins/index.ts`.

```ts
// src/plugins/hello/index.ts
import { definePlugin } from "@/lib/plugins/types";

export default definePlugin({
  slug: "hello",
  name: "Hello",
  version: "1.0.0",
  description: "Appends a greeting to every post.",
  settings: [{ type: "text", key: "greeting", label: "Greeting", default: "Thanks for reading!" }],
  rest: [{ method: "GET", path: "/ping", handler: () => ({ pong: true }) }], // GET /wp-json/hello/v1/ping
  register(api) {
    api.addFilter("post.contentHtml", async (html) => {
      const { greeting } = await api.settings();
      return `${html}<p>${greeting}</p>`;
    });
    api.addAction("post.saved", ({ post, previousStatus }) => {
      if (post.status === "publish" && previousStatus !== "publish") api.log("published", post.title);
    });
  },
});
```

| Hook | Kind | When |
| --- | --- | --- |
| `post.saved` | action | After a post or page is created or updated (any source: admin, REST, importer) |
| `post.trashed`, `post.deleted` | action | After a post is trashed or permanently deleted |
| `comment.created` | action | After a comment is stored |
| `media.uploaded` | action | After a file is uploaded |
| `user.created` | action | After a user account is created |

`post.saved` includes `source` (`"app"` or `"import"`) so plugins can skip bulk imports. Plugins can also add admin screens (`adminPages`), which appear under **Tools**.
| `post.contentHtml` | filter | Post body HTML on the public site and in the RSS feed |
| `comment.status` | filter | Status for a new comment from a non-moderator (`approved`, `pending`, `spam`) |

Hooks run in priority order (lower first, default 10). An error in one plugin is logged and skipped; it never breaks the page or the other plugins. Use `api.defer()` for slow work so it runs after the response. Plugins can declare their own hooks by augmenting `ActionHooks` / `FilterHooks` in `src/lib/plugins/types.ts`.

Bundled examples: **Reading Time**, **Comment Blocklist** and **Webhooks** (signed `POST` requests on publish or new comments).

## Importing from WordPress

Activate the **WordPress Importer** plugin, then open **Tools → Import from WordPress**. In the old WordPress dashboard, export with **Tools → Export → All content** and upload that file.

- **Imported:** posts, pages (with parent pages), categories (with hierarchy), tags, threaded comments with their original dates and status, sticky posts, excerpts and featured images.
- **Authors:** matched to existing users by email. Optionally, missing authors are created as Author accounts; set their passwords under **Users**, since the importer gives them random ones.
- **Media:** downloaded from the old site, with alt text and captions. Image links inside posts, including resized variants like `photo-300x200.jpg`, are rewritten to the new copies. The old site must still be online for this.
- **Safe to re-run:** anything already imported is skipped. Imports don't trigger publish webhooks.
- **Old links keep working:** URLs like `/2024/05/my-post/` and `/my-post/` redirect to the new address. Old numeric `?p=123` links do not; the original IDs are stored in each post's `meta.wpId`.
- **Not imported:** menus, custom post types, revisions, shortcode output (shortcodes stay as text) and password protection (protected posts become private).

Media downloads refuse private and loopback network addresses, so an export file can't make the server fetch internal URLs. The importer's settings can allow them for a WordPress install on your own network.

## Comments

Threaded comments with WordPress's moderation rules (manual approval, auto-approval for authors with an earlier approved comment, more than two links held for review), duplicate and flood protection, and a honeypot field for bots. Configure them under **Settings → Discussion**; moderate under **Comments**.

The flood check uses the `X-Forwarded-For` header, so run the app behind a reverse proxy that sets it.

## WordPress concepts and where they live

| WordPress | Here |
| --- | --- |
| `wp_posts` / `wp_postmeta` | `posts` table with a typed `meta` JSONB column |
| `wp_terms` + taxonomy tables | `terms` + `post_terms` |
| `wp_options` | `options` table, read through the cached `getSettings()` |
| Roles and `map_meta_cap` | `src/lib/capabilities.ts` |
| Rewrite rules | `resolveRoute()` in `src/lib/permalinks.ts` |
| `redirect_canonical` | `canonical()` in `src/app/(site)/[[...path]]/page.tsx` |
| Revisions | `post_revisions` (last 25 kept per post) |
| `wp_comments` | `comments` table; rules in `src/lib/comments.ts` |
| Application passwords | `app_passwords` (SHA-256 hashed) |

## License

MIT. Nordpress is an independent project and is not affiliated with WordPress or the WordPress Foundation; it implements WordPress-compatible formats and APIs so existing content and tools keep working.
