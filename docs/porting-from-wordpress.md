# Porting WordPress code to Nordpress

For developers moving a WordPress plugin, theme or REST integration from PHP to TypeScript. To move a site's content, see [Migrating from WordPress](migrating-from-wordpress.md) instead.

Nordpress keeps WordPress's ideas: posts and pages, categories and tags, roles and capabilities, actions and filters, shortcodes, permalinks and `/wp-json/wp/v2`. So most code ports one piece at a time, and the names will be familiar.

## Start with `port:wp`

Point it at a plugin or theme folder:

```bash
pnpm port:wp ~/Downloads/my-plugin
```

It reads the PHP and lists every WordPress hook and function the code uses, each with its file and line and where it goes in Nordpress, in three groups: **use instead** (a Nordpress API does the same job), **built in** (delete the code; core does it) and **no equivalent yet** (with what to do instead). For a theme it also maps each template file to the component that replaces it. If the plugin is one Nordpress already replaces (Yoast, Contact Form 7, WooCommerce …), it says so first, so you don't port what you don't need.

Add `--scaffold <slug>` to also create the Nordpress plugin or theme, with the name, version, description and author from the WordPress header, and a `PORTING.md` checklist in its folder:

```bash
pnpm port:wp ~/Downloads/my-plugin --scaffold my-plugin
```

Then work through the checklist. A coding agent can do this too: Claude Code and others read [`AGENTS.md`](../AGENTS.md) automatically, so ask it to "port this plugin following `src/plugins/my-plugin/PORTING.md`".

## What's different

| WordPress                                             | Nordpress                                                                                                         |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| PHP, a fresh process per request                      | TypeScript on Node.js, one long-running process; module state persists, so don't keep per-request data in globals |
| Plugins uploaded and activated at runtime             | Plugins are folders in `src/plugins`, compiled and type-checked with the site; activation is still a click        |
| Global functions (`get_option()`)                     | Imports (`import { getSettings } from "@/lib/options"`)                                                           |
| `add_action('save_post', 'fn', 10, 3)`                | `api.addAction("post.saved", fn, 10)`: one typed argument object, so no `accepted_args`                           |
| Templates mixing PHP and HTML, the template hierarchy | React Server Components; core picks which one renders                                                             |
| MySQL through `$wpdb`, `dbDelta()` for tables         | PostgreSQL through Drizzle; tables in `src/db/schema.ts`, migrations from `pnpm db:generate`                      |
| `wp_options` rows                                     | Typed settings fields that core draws and saves for you                                                           |
| Post content is HTML with block comments              | Tiptap JSON, rendered to HTML on save; HTML from anywhere goes through `htmlToDoc()`                              |
| Nonces on every form                                  | Server Actions and authenticated REST routes; keep the capability check, drop the nonce                           |
| `esc_html()` everywhere                               | React escapes what it renders; `escapeHtml()` for the HTML strings filters and shortcodes return                  |
| Transients, object cache                              | `"use cache"` with `cacheTag()` / `cacheLife()`, invalidated after writes                                         |
| WP-Cron                                               | `api.defer()` for work after the response; a route called by your scheduler for recurring work                    |
| gettext (`__()`)                                      | Not yet: write plain strings                                                                                      |

## Hooks

| WordPress                                                               | Nordpress                                                                  |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `save_post`, `transition_post_status`, `publish_post`, `wp_insert_post` | `post.saved` with `{ post, previousStatus, url, actorId, source }`         |
| `wp_trash_post`, `before_delete_post`, `deleted_post`                   | `post.trashed`, `post.deleted`                                             |
| `the_content`                                                           | `post.contentHtml` (also used for feeds and newsletters)                   |
| —                                                                       | `post.markdown`: the Markdown copy served to AI agents at `<permalink>.md` |
| `comment_post`, `wp_insert_comment`                                     | `comment.created`                                                          |
| `pre_comment_approved`, `preprocess_comment`                            | `comment.status`: return `"approved"`, `"pending"` or `"spam"`             |
| `add_attachment`                                                        | `media.uploaded`                                                           |
| `user_register`                                                         | `user.created`                                                             |
| `wpcf7_mail_sent`, `gform_after_submission`                             | `form.submitted` (forms are built in; spam never arrives)                  |
| `init`, `plugins_loaded`                                                | `register(api)`, once per process                                          |
| `admin_menu`                                                            | `adminPages`                                                               |
| `rest_api_init`                                                         | `rest`                                                                     |
| `wp_ajax_*`                                                             | a REST route or a Server Action                                            |
| your own `do_action('my_plugin_done')`                                  | `doAction("my-plugin.done", ...)` after declaring it (below)               |

Priorities work as in WordPress: lower runs first, the default is 10, and equal priorities keep registration order. A filter that forgets to return keeps the previous value instead of blanking the content, and an error in one plugin is logged without breaking the page.

Declare your own hooks so other plugins get types for them:

```ts
declare module "@/lib/plugins/types" {
  interface ActionHooks {
    "my-plugin.done": [id: number];
  }
}
```

## Functions

| WordPress                                                          | Nordpress                                                                              |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `add_shortcode()`                                                  | `api.addShortcode(tag, (attrs, content, { post }) => html)`                            |
| `shortcode_atts($defaults, $atts)`                                 | `{ ...defaults, ...attrs }`                                                            |
| `get_option()` for your plugin                                     | `settings` fields, read with `api.settings()`                                          |
| `get_option()` for the site (`blogname`, `posts_per_page` …)       | `getSettings()` in `src/lib/options.ts`                                                |
| `register_setting()`, `add_settings_field()`, `add_options_page()` | `settings: [{ type, key, label, default }]`                                            |
| `add_menu_page()`, `add_management_page()`                         | `adminPages: [{ path, title, cap, component }]`                                        |
| `register_rest_route()` with `permission_callback`                 | `rest: [{ method, path, handler }]` with `await requireCap("…")`                       |
| `current_user_can()`                                               | `requireCap()` (REST), `assertCap()` / `requireViewer()` (Server Actions), `hasCap()`  |
| `wp_get_current_user()`                                            | `getViewer()` in `src/lib/session.ts`                                                  |
| `WP_Query`, `get_posts()`                                          | `listPublished()`, `publishedSummaries()`, `getPublished()` in `src/lib/posts.ts`      |
| `wp_insert_post()`, `wp_update_post()`                             | `savePost(actor, input)`                                                               |
| `get_post_meta()`, `update_post_meta()`, ACF's `get_field()`       | the `meta` JSON column on posts (and terms, media, products)                           |
| `get_terms()`, `wp_get_post_terms()`                               | `listTerms()`, `getPostTerms()` in `src/lib/terms.ts`                                  |
| `get_permalink()`, `get_term_link()`                               | `postPath()`, `termPath()` in `src/lib/permalinks.ts`; `siteUrl()` makes them absolute |
| `wp_handle_upload()`, `media_sideload_image()`                     | `storeUpload(file, uploaderId)` in `src/lib/media.ts`                                  |
| `wp_remote_post()`                                                 | `fetch()`; check URLs people typed with `assertPublicUrl()` from `src/lib/net.ts`      |
| `wp_mail()`                                                        | `sendMail()` in `src/lib/mail.ts`                                                      |
| `wp_schedule_single_event(time(), …)`                              | `api.defer(fn)`                                                                        |
| `wp_kses_post()`                                                   | `htmlToDoc()`, which keeps only what the editor allows                                 |
| `sanitize_text_field()`, `absint()`                                | zod schemas                                                                            |
| `sanitize_title()`                                                 | `slugify()`                                                                            |

`pnpm port:wp` knows about 270 hooks and functions; the tables above are the common ones.

## Example: a plugin, before and after

A small WordPress plugin: a notice above every post, a `[notice]` shortcode, a webhook when a post is first published, and a REST route.

```php
<?php
/**
 * Plugin Name: Post Notice
 * Description: Adds a notice above posts and a [notice] shortcode.
 * Version: 1.0.0
 */
add_action('admin_init', function () {
  register_setting('post_notice', 'post_notice_text');
  register_setting('post_notice', 'post_notice_webhook');
  // ...plus add_options_page() and a form that renders both fields
});

add_filter('the_content', function ($content) {
  if (get_post_type() !== 'post') return $content;
  $text = get_option('post_notice_text', 'Thanks for reading!');
  return '<p class="post-notice">' . esc_html($text) . '</p>' . $content;
});

add_shortcode('notice', function ($atts, $content = null) {
  $atts = shortcode_atts(['type' => 'info'], $atts);
  return '<div class="notice notice-' . esc_attr($atts['type']) . '">' . $content . '</div>';
});

add_action('transition_post_status', function ($new, $old, $post) {
  if ($new === 'publish' && $old !== 'publish' && $post->post_type === 'post') {
    wp_schedule_single_event(time(), 'post_notice_ping', [$post->ID]);
  }
}, 10, 3);

add_action('post_notice_ping', function ($id) {
  $url = get_option('post_notice_webhook');
  if ($url) wp_safe_remote_post($url, ['body' => ['url' => get_permalink($id)]]);
});

add_action('rest_api_init', function () {
  register_rest_route('post-notice/v1', '/text', [
    'methods' => 'GET',
    'callback' => fn () => ['text' => get_option('post_notice_text')],
    'permission_callback' => fn () => current_user_can('edit_posts'),
  ]);
});
```

The same plugin in `src/plugins/post-notice/index.ts`:

```ts
import { assertPublicUrl } from "@/lib/net";
import { escapeHtml } from "@/lib/plugins/shortcodes";
import { definePlugin } from "@/lib/plugins/types";

export default definePlugin({
  slug: "post-notice",
  name: "Post Notice",
  version: "1.0.0",
  description: "Adds a notice above posts and a [notice] shortcode.",
  // Core draws and saves the form under Plugins → Post Notice
  settings: [
    {
      type: "text",
      key: "text",
      label: "Notice",
      default: "Thanks for reading!",
    },
    { type: "url", key: "webhook", label: "Webhook URL", default: "" },
  ],
  rest: [
    {
      // GET /wp-json/post-notice/v1/text
      method: "GET",
      path: "/text",
      handler: async ({ requireCap }) => {
        await requireCap("edit_posts");
        const { getPluginSettings } = await import("@/lib/plugins");
        return { text: (await getPluginSettings("post-notice")).text };
      },
    },
  ],
  register(api) {
    api.addFilter("post.contentHtml", async (html, { post }) => {
      if (post.type !== "post") return html;
      const { text } = await api.settings();
      return `<p class="post-notice">${escapeHtml(String(text))}</p>${html}`;
    });

    api.addShortcode("notice", (attrs, content) => {
      const { type } = { type: "info", ...attrs };
      return `<div class="notice notice-${escapeHtml(type)}">${content ?? ""}</div>`;
    });

    api.addAction(
      "post.saved",
      async ({ post, previousStatus, url, source }) => {
        if (source === "import" || post.type !== "post") return;
        if (post.status !== "publish" || previousStatus === "publish") return;
        const { webhook } = await api.settings();
        if (!webhook) return;
        // Runs after the response is sent, like a single WP-Cron event
        api.defer(async () => {
          await assertPublicUrl(String(webhook));
          await fetch(String(webhook), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ url }),
          });
        });
      },
    );
  },
});
```

Register it in `src/plugins/index.ts` (`pnpm new:plugin` and `--scaffold` do that) and activate it under **Plugins**. The settings page, nonce and sanitizing code are gone; `source === "import"` keeps a bulk import from firing hundreds of webhooks.

## Shortcodes

`api.addShortcode()` parses shortcodes the way WordPress does: quoted and unquoted attributes, positional values (`[video "a.mp4"]` gives `attrs[0]`), self-closing `[tag /]`, enclosing `[tag]…[/tag]`, and `[[tag]]` for a literal `[tag]`. Attribute names are lowercased, and the curly quotes and `&quot;` editors leave behind are undone. A shortcode alone in a paragraph replaces the paragraph, as `shortcode_unautop()` does.

Shortcodes expand at priority 11 on `post.contentHtml`, after other content filters, and stop when their plugin is deactivated. Content imported from WordPress keeps its `[shortcodes]` as text, so registering the tag is enough to bring old posts back to life. `content` is HTML: to expand shortcodes nested inside it, call `expandShortcodes()` from `@/lib/plugins/shortcodes`. The returned HTML is trusted, so escape every attribute with `escapeHtml()`.

## Porting a theme

```bash
pnpm port:wp ~/Downloads/my-theme --scaffold my-theme
```

This copies the Classic theme as a starting point and lists your templates against the components that replace them:

| WordPress template                                                                            | Nordpress component                                                   |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `header.php`, `footer.php`, `sidebar.php`                                                     | `Layout`, wrapping every page                                         |
| `single.php`, `page.php`, `singular.php`                                                      | `Single`                                                              |
| `index.php`, `home.php`, `archive.php`, `category.php`, `tag.php`, `author.php`, `search.php` | `PostList`, with `ArchiveHeader`, `Paging` and `Empty`                |
| `searchform.php`                                                                              | `SearchForm`                                                          |
| `comments.php`                                                                                | built in: `Single` gets `comments`                                    |
| `functions.php`                                                                               | `defineTheme()` for menu locations and settings; hooks go in a plugin |
| `theme.json`                                                                                  | **Appearance → Design** (colors, fonts, spacing)                      |
| Customizer settings (`get_theme_mod()`)                                                       | theme `settings`, read from the `options` prop                        |

The Loop becomes a list your component gets as a prop:

```php
<?php while ( have_posts() ) : the_post(); ?>
  <article>
    <h2><a href="<?php the_permalink(); ?>"><?php the_title(); ?></a></h2>
    <?php the_excerpt(); ?>
  </article>
<?php endwhile; ?>
```

```tsx
function PostList({
  posts,
  site,
}: {
  posts: PostSummary[];
  site: SiteSettings;
}) {
  return posts.map((post) => (
    <article key={post.id}>
      <h2>
        <Link href={postUrl(post, site)}>{post.title}</Link>
      </h2>
      <p>{summaryOf(post)}</p>
    </article>
  ));
}
```

`Single` gets the post body ready-made as `body`, already filtered by plugins, with forms, videos and members-only teasers in place. Render it where `the_content()` was. There are no conditional tags like `is_single()`, because each component only renders in its own context. Styles move into the components (Tailwind classes) or a CSS file they import. Read [Writing themes](themes.md) for the full contract.

## Data

| WordPress table                                         | Nordpress                                                 |
| ------------------------------------------------------- | --------------------------------------------------------- |
| `wp_posts` (posts, pages)                               | `posts`, with `type` `post` or `page`                     |
| `wp_posts` (revisions)                                  | `post_revisions`                                          |
| `wp_posts` (attachments)                                | `media`                                                   |
| `wp_postmeta`                                           | `posts.meta` (JSON)                                       |
| `wp_terms`, `wp_term_taxonomy`, `wp_term_relationships` | `terms`, `post_terms`                                     |
| `wp_comments`                                           | `comments`                                                |
| `wp_users`, `wp_usermeta`                               | `user` (Better Auth), with a WordPress role               |
| `wp_options`                                            | `options`, typed through `getSettings()`                  |
| a plugin's own tables                                   | new tables in `src/db/schema.ts`, then `pnpm db:generate` |

Writes that the public site reads must invalidate its cache: Server Actions call `updateTag(POSTS_TAG)`, and route handlers call `invalidate(POSTS_TAG)` from `src/lib/rest/core.ts`.

## Keeping REST API clients

Apps and scripts written against the WordPress REST API mostly keep working: point them at the new domain and create an application password under **Profile**. Supported under `/wp-json/wp/v2`: posts, pages, categories, tags, media and comments (list, read, create, update, delete), users (list and read), settings (read and update), search, types and taxonomies, with `_fields`, `per_page`/`page`, `X-WP-Total` and WordPress's error format.

Differences to know:

- `content.raw` is HTML; content you send is cleaned with `htmlToDoc()`, so scripts, styles and unknown tags are dropped.
- Post `meta` is returned but can't be written through REST yet.
- Only posts and pages: there are no custom post type routes.
- Plugin routes live at `/wp-json/<plugin-slug>/v1/…`.

For new integrations, the MCP server at `/mcp` is usually a better fit than REST: see [AI agents](agents.md).

## Not there yet

Some WordPress features have no Nordpress equivalent yet. Work around them as below, or open an issue if your port needs one.

- **Custom post types and taxonomies:** use a category and post meta, or your own table.
- **Plugin output in every page's `<head>` or footer** (`wp_head`, `wp_enqueue_script`): put it in the theme's `Layout`.
- **Widgets and sidebars:** build them into the theme.
- **Gutenberg blocks:** the editor is Tiptap; page sections cover common layouts, and shortcodes cover the rest.
- **Meta boxes:** custom fields in the editor sidebar.
- **Altering queries** (`pre_get_posts`) and **title/excerpt filters.**
- **Recurring scheduled events:** add a route that checks a secret, like core's `/api/cron/*`, and call it from your scheduler.
- **Translating the admin** (gettext).
- **Multisite:** run one Nordpress per site; the hosted platform in `platform/` does that.
