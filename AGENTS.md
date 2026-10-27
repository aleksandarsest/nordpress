# Nordpress: guide for coding agents

Nordpress is a WordPress-style CMS on Next.js 16 (App Router, Cache Components), PostgreSQL with pgvector, Drizzle, Better Auth and Tiptap, with Claude built in. This guide is for AI coding agents (and people) extending it. `README.md` covers features and setup.

## Commands

- `pnpm dev`: development server on :3000. After long sessions with many edits it can serve stale modules; restart it if a change doesn't show.
- `pnpm lint` (Biome), `pnpm typecheck`, `pnpm test` (Vitest), `pnpm build`. Run all four before calling work done.
- `pnpm db:generate` after changing `src/db/schema.ts`, then `pnpm db:migrate`.
- `pnpm new:plugin <slug> ["Name"]` and `pnpm new:theme <slug> ["Name"] [--from classic|nord]` scaffold and register a plugin or theme.

## Where things live

- `src/db/schema.ts`: every table. `src/lib/*`: domain logic (posts, terms, comments, media, menus, forms, options, permalinks, capabilities). Pages and routes stay thin and call these.
- `src/app/(site)`: the public site; `[[...path]]` resolves every public URL. `src/app/admin`: the dashboard. `src/app/wp-json`: the WordPress-compatible REST API (`src/lib/rest`).
- `src/lib/ai`: Claude features. `src/lib/agent`: tools agents use, shared by the MCP server (`src/lib/mcp`, `/mcp`) and the admin assistant.
- `src/plugins/<slug>`: plugins, registered in `src/plugins/index.ts`. `src/themes/<slug>`: themes, registered in `src/themes/index.ts`.

## Rules that matter

- **Permissions:** every server action, route and agent tool checks capabilities (`assertCap`/`requireViewer` in `src/lib/session.ts`, `hasCap`/`canOnPost` in `src/lib/capabilities.ts`). Never trust the client.
- **Content:** post bodies are Tiptap JSON. HTML from anywhere (REST, imports, Markdown, model output) goes through `htmlToDoc`, which keeps only what the editor schema allows. That's the XSS boundary; don't render untrusted HTML any other way.
- **Caching:** reads use `"use cache"` with `cacheTag(...)` and `cacheLife(...)`. After writes, Server Actions call `updateTag(TAG)`; route handlers can't, so they call `invalidate(TAG)` from `src/lib/rest/core.ts`. Pages that read the session or request call `requireViewer`/`connection()` first and use `export const instant = false` when they must block.
- **URLs:** no trailing slashes. Permalinks come from `postPath`/`termPath` in `src/lib/permalinks.ts`.
- **Server Action forms:** a `formAction` button doesn't carry its name/value, so use one small `<form>` per action.
- **Settings:** add a field to `SiteSettings` and `DEFAULT_SETTINGS` in `src/lib/options.ts`; read with `getSettings()`, write with `saveSettings()` and invalidate `SETTINGS_TAG`.
- **Style:** match the code around you: short comments that say why, plain names, Biome formatting. User-facing text is plain and specific.

## Extending

- **Plugins** (`definePlugin` in `src/lib/plugins/types.ts`) get typed hooks (`post.saved`, `post.contentHtml`, `post.markdown`, `comment.created`, `comment.status`, `form.submitted`, ...), settings fields shown in the admin, REST routes at `/wp-json/<slug>/v1/...`, and admin screens under Tools. Use `api.defer()` for slow work and skip side effects when `source === "import"`. Examples: `reading-time` (filter, settings, route), `webhooks` (actions, deferred HTTP), `wordpress-importer` (admin screen, long-running job).
- **Themes** (`defineTheme` in `src/lib/themes/types.ts`) provide React server components (`Layout`, `Single`, `PostList`, `ArchiveHeader`, `Paging`, `SearchForm`, `Empty`), menu locations and settings. Core does routing, data loading, comments, forms, structured data and plugin filters, so themes only decide presentation. Start from `pnpm new:theme`.
- **Agent tools** live in `createAgentTools` (`src/lib/agent/tools.ts`). A tool added there appears in both MCP and the admin assistant. Write tools need `kind: "write"` and a `preview()`, which the assistant shows before asking the user to approve. Respect `ctx.canChangeLive`.
- **AI features:** get the client and settings from `aiContext()`, pass `fallbackParams(model)`, record usage with `recordUsage`, map errors with `toAiError`, and add the site's voice with `withGuidance()`. Prefer structured outputs (`betaZodOutputFormat`) over parsing text. Treat model output and visitor-written text as untrusted.

## Tests

Vitest covers pure modules (`*.test.ts` next to the code). Modules that import `@/db` need a database, so keep logic you want to test in files that don't, as `src/lib/forms/fields.ts` and `src/lib/markdown.ts` do.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
