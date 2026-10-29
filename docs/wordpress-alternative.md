# Nordpress, an open-source WordPress alternative in TypeScript

Nordpress is a content management system that works like WordPress (same concepts, compatible URLs, a compatible REST API) but is written in TypeScript and runs on Node.js. It's for people who like how WordPress works and want a modern stack: type-checked plugins and themes, PostgreSQL, React, and AI built in instead of added through plugins.

It isn't a fork: it shares no code with WordPress. It reimplements WordPress's formats and APIs so content, links and tools carry over, and it is not affiliated with WordPress or the WordPress Foundation.

## Nordpress and WordPress side by side

|                       | WordPress                                     | Nordpress                                                                               |
| --------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------- |
| Language              | PHP                                           | TypeScript on Node.js 24                                                                |
| Framework             | WordPress core                                | Next.js 16 (React Server Components)                                                    |
| Database              | MySQL / MariaDB                               | PostgreSQL with pgvector, or a built-in database (PGlite) in one folder                 |
| Editor                | Gutenberg blocks                              | Tiptap, with page sections; content stored as validated JSON                            |
| Content model         | Posts, pages, categories, tags, custom types  | Posts, pages, categories, tags; custom types not yet                                    |
| Users                 | Roles and capabilities                        | The same roles and capability names; passkeys and 2FA built in                          |
| Extending             | PHP plugins with actions, filters, shortcodes | TypeScript plugins with typed actions, filters and shortcodes                           |
| Themes                | PHP templates, `theme.json`                   | React components; a design system under Appearance → Design                             |
| REST API              | `/wp-json/wp/v2`                              | `/wp-json/wp/v2` (posts, pages, terms, media, comments, users, settings)                |
| Application passwords | Yes                                           | Yes                                                                                     |
| Permalinks            | `/%year%/%monthnum%/%postname%/` and others   | The same structures, without trailing slashes; old URLs redirect                        |
| SEO                   | Plugins (Yoast, Rank Math)                    | Built in: JSON-LD, sitemap, canonical URLs, per-post SEO, `llms.txt`                    |
| Forms                 | Plugins (Contact Form 7, Gravity Forms)       | Built in, with AI spam triage                                                           |
| Shop                  | WooCommerce                                   | Built in: products, cart, Stripe Checkout                                               |
| Memberships           | Plugins (MemberPress)                         | Built in, with Stripe subscriptions                                                     |
| Translations          | Plugins (WPML, Polylang)                      | Built in, with AI drafts and hreflang                                                   |
| Newsletter            | Plugins (MailPoet, Jetpack)                   | Built in, with double opt-in                                                            |
| Analytics             | Plugins (Jetpack Stats, MonsterInsights)      | Built in, cookie-free, counts AI crawlers and AI referrals                              |
| Backups               | Plugins (UpdraftPlus)                         | Built in, scheduled                                                                     |
| AI                    | Plugins                                       | Claude built in: writing help, alt text, semantic search, site chat, an admin assistant |
| AI agents             | REST API                                      | An MCP server (`/mcp`) with OAuth, an action log and a publishing policy                |
| Hosting               | Any PHP host                                  | One command on any Linux server, or any Node.js host                                    |
| License               | GPL                                           | MIT                                                                                     |

## When Nordpress fits

- You want WordPress's model in a TypeScript codebase you or a coding agent can change safely, with types, tests and one build.
- You use WordPress with SEO, forms, a shop, memberships, translations or a newsletter, and would rather have them built in than maintain a dozen plugins.
- You want AI features and AI agent access without sending content through third-party plugins.

## When WordPress still fits better

- You rely on plugins or themes with no Nordpress equivalent and no time to port them.
- You need custom post types, Gutenberg blocks or multisite today.
- You need a large ecosystem of hosts, agencies and ready-made themes.

## Moving across

- **Sites:** [Migrating from WordPress](migrating-from-wordpress.md). The Site Importer copies a live site or an export file, with media, comments, menus and redirects.
- **Plugins and themes:** [Porting WordPress code](porting-from-wordpress.md). `pnpm port:wp` maps a plugin or theme's PHP to Nordpress APIs and starts the port.
- **Hosting:** [Self-hosting](self-hosting.md).
