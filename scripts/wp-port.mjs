// What a WordPress plugin or theme uses, and where each piece goes in
// Nordpress. Used by `pnpm port:wp`; kept free of file access so it can be
// unit tested. docs/porting-from-wordpress.md explains the same map in prose.

/**
 * "api": a Nordpress API does the same job.
 * "built-in": core already does it; delete the code.
 * "missing": no equivalent yet; the note says what to do instead.
 * @typedef {"api" | "built-in" | "missing"} Status
 * @typedef {{ names: string[], status: Status, nordpress: string }} Entry
 */

/** @type {Entry[]} */
export const HOOKS = [
  {
    names: [
      "save_post",
      "wp_insert_post",
      "publish_post",
      "transition_post_status",
      "wp_after_insert_post",
    ],
    status: "api",
    nordpress:
      'api.addAction("post.saved", ({ post, previousStatus, source }) => ...); skip side effects when source === "import"',
  },
  {
    names: ["wp_trash_post", "trashed_post"],
    status: "api",
    nordpress: 'api.addAction("post.trashed", (post) => ...)',
  },
  {
    names: ["before_delete_post", "delete_post", "deleted_post"],
    status: "api",
    nordpress: 'api.addAction("post.deleted", (post) => ...)',
  },
  {
    names: ["the_content"],
    status: "api",
    nordpress:
      'api.addFilter("post.contentHtml", (html, { post }) => html); also applies to feeds and newsletters',
  },
  {
    names: ["comment_post", "wp_insert_comment"],
    status: "api",
    nordpress: 'api.addAction("comment.created", (comment) => ...)',
  },
  {
    names: ["pre_comment_approved", "preprocess_comment"],
    status: "api",
    nordpress:
      'api.addFilter("comment.status", (status, comment) => status): return "spam", "pending" or "approved"; the text itself can\'t be changed',
  },
  {
    names: ["add_attachment"],
    status: "api",
    nordpress: 'api.addAction("media.uploaded", (item) => ...)',
  },
  {
    names: ["user_register"],
    status: "api",
    nordpress: 'api.addAction("user.created", (user) => ...)',
  },
  {
    names: [
      "wpcf7_mail_sent",
      "wpcf7_before_send_mail",
      "gform_after_submission",
    ],
    status: "api",
    nordpress:
      'Forms are built in: api.addAction("form.submitted", ({ form, submission }) => ...), after spam triage',
  },
  {
    names: ["init", "plugins_loaded", "after_setup_theme", "wp_loaded"],
    status: "api",
    nordpress: "register(api) runs once per process; register hooks there",
  },
  {
    names: ["admin_menu", "admin_init"],
    status: "api",
    nordpress: "adminPages: React Server Components listed under Tools",
  },
  {
    names: ["rest_api_init"],
    status: "api",
    nordpress: "rest: routes served at /wp-json/<slug>/v1/...",
  },
  {
    names: ["wp_head", "wp_footer", "wp_enqueue_scripts", "wp_body_open"],
    status: "missing",
    nordpress:
      "Plugins can't inject into every page yet; put markup, styles and scripts in the theme's Layout component. Meta tags, canonical URLs, JSON-LD and feeds are built in",
  },
  {
    names: ["admin_enqueue_scripts", "admin_head", "admin_footer"],
    status: "built-in",
    nordpress:
      "Admin screens are React components; import what they need instead",
  },
  {
    names: ["widgets_init"],
    status: "missing",
    nordpress: "No widgets; render the same content in the theme's Layout",
  },
  {
    names: ["template_redirect", "template_include", "parse_request"],
    status: "missing",
    nordpress:
      "Core resolves every URL. Fixed redirects go under Tools → Redirects (src/lib/redirects); new pages are themes' components or plugin REST routes",
  },
  {
    names: ["pre_get_posts", "posts_where", "posts_join", "query_vars"],
    status: "missing",
    nordpress:
      "Listings can't be altered by plugins yet; query with Drizzle in a REST route or change the theme",
  },
  {
    names: [
      "the_title",
      "the_excerpt",
      "get_the_excerpt",
      "excerpt_length",
      "excerpt_more",
    ],
    status: "missing",
    nordpress:
      "No title/excerpt filters; themes decide (summaryOf() in src/lib/themes/helpers.ts)",
  },
  {
    names: ["body_class", "post_class", "nav_menu_css_class"],
    status: "built-in",
    nordpress: "Themes set classes directly in their components",
  },
  {
    names: ["wp_login", "wp_logout", "authenticate", "login_form"],
    status: "missing",
    nordpress:
      "Sign-in is Better Auth (src/lib/auth.ts), with 2FA and passkeys built in; no plugin hooks",
  },
  {
    names: ["wp_mail", "phpmailer_init"],
    status: "missing",
    nordpress:
      "Email goes through sendMail() in src/lib/mail.ts, set by SMTP_URL",
  },
];

/** @type {Entry[]} */
export const FUNCTIONS = [
  // Hooks and plugin structure
  {
    names: ["add_action", "add_filter"],
    status: "api",
    nordpress:
      "api.addAction / api.addFilter in register(api); same priorities (lower runs first, default 10); handlers get typed arguments, so there's no accepted_args",
  },
  {
    names: ["do_action", "apply_filters"],
    status: "api",
    nordpress:
      'doAction / applyFilters from "@/lib/plugins"; declare your own hooks by augmenting ActionHooks / FilterHooks in "@/lib/plugins/types"',
  },
  {
    names: ["remove_action", "remove_filter", "remove_all_actions"],
    status: "missing",
    nordpress:
      "Handlers can't be removed; deactivate the plugin, or check a setting inside the handler",
  },
  {
    names: ["add_shortcode"],
    status: "api",
    nordpress:
      'api.addShortcode("tag", (attrs, content, { post }) => html); escape attributes with escapeHtml() from "@/lib/plugins/shortcodes"',
  },
  {
    names: ["do_shortcode", "shortcode_atts"],
    status: "api",
    nordpress:
      "expandShortcodes() from @/lib/plugins/shortcodes for nested content; shortcode_atts becomes { ...defaults, ...attrs }",
  },
  {
    names: [
      "register_activation_hook",
      "register_deactivation_hook",
      "register_uninstall_hook",
    ],
    status: "missing",
    nordpress:
      "Activation only flips a setting; create tables with a migration (src/db/schema.ts, pnpm db:generate) and do setup lazily",
  },
  {
    names: [
      "plugins_url",
      "plugin_dir_path",
      "plugin_dir_url",
      "get_template_directory_uri",
      "get_stylesheet_directory_uri",
      "get_template_directory",
    ],
    status: "built-in",
    nordpress:
      "Import files from the plugin or theme folder; put static files in public/",
  },
  // Settings and admin
  {
    names: ["get_option", "update_option", "add_option", "delete_option"],
    status: "api",
    nordpress:
      "Plugin options: declare `settings` fields and read api.settings(). Site options: getSettings() / saveSettings() in src/lib/options.ts",
  },
  {
    names: [
      "register_setting",
      "add_settings_section",
      "add_settings_field",
      "add_options_page",
      "settings_fields",
      "do_settings_sections",
    ],
    status: "api",
    nordpress:
      "`settings` fields (text, url, email, textarea, number, checkbox, select); core draws and saves the form under Plugins",
  },
  {
    names: [
      "add_menu_page",
      "add_submenu_page",
      "add_management_page",
      "add_dashboard_page",
    ],
    status: "api",
    nordpress:
      "adminPages: { path, title, cap, component }, at /admin/tools/<slug>/<path>",
  },
  {
    names: ["add_meta_box", "add_meta_boxes"],
    status: "missing",
    nordpress:
      "No custom editor panels yet; store fields in post meta and edit them from an admin page or REST",
  },
  {
    names: ["admin_notices", "add_settings_error"],
    status: "missing",
    nordpress: "Show messages on the plugin's own admin page",
  },
  // REST, AJAX, security
  {
    names: ["register_rest_route"],
    status: "api",
    nordpress:
      'rest: [{ method, path: "/items/:id", handler }]; permission_callback becomes await requireCap("...") in the handler',
  },
  {
    names: [
      "rest_ensure_response",
      "wp_send_json",
      "wp_send_json_success",
      "wp_send_json_error",
      "wp_die",
    ],
    status: "api",
    nordpress:
      "Return a value from the REST handler; throw RestError (src/lib/rest/core.ts) for errors",
  },
  {
    names: [
      "wp_create_nonce",
      "wp_verify_nonce",
      "check_admin_referer",
      "check_ajax_referer",
      "wp_nonce_field",
    ],
    status: "built-in",
    nordpress:
      "Server Actions and authenticated REST routes need no nonces; keep the capability check",
  },
  {
    names: ["current_user_can", "user_can"],
    status: "api",
    nordpress:
      "requireCap() in REST handlers, assertCap() / requireViewer() in Server Actions (src/lib/session.ts), hasCap() / canOnPost() (src/lib/capabilities.ts). Same capability names",
  },
  {
    names: ["is_user_logged_in", "wp_get_current_user", "get_current_user_id"],
    status: "api",
    nordpress:
      "getViewer() in src/lib/session.ts, or viewer() in a REST handler",
  },
  // Content
  {
    names: [
      "WP_Query",
      "get_posts",
      "query_posts",
      "have_posts",
      "the_post",
      "wp_reset_postdata",
    ],
    status: "api",
    nordpress:
      "listPublished() / publishedSummaries() / getPublished() in src/lib/posts.ts, or Drizzle on the posts table. Themes get posts as props",
  },
  {
    names: ["get_post", "get_page_by_path", "get_page_by_title"],
    status: "api",
    nordpress: "getPublished() or getPostForEdit() in src/lib/posts.ts",
  },
  {
    names: ["wp_insert_post", "wp_update_post"],
    status: "api",
    nordpress:
      "savePost(actor, input) in src/lib/posts.ts; body as Tiptap JSON (htmlToDoc() turns HTML into it)",
  },
  {
    names: ["wp_delete_post", "wp_trash_post"],
    status: "api",
    nordpress: "trashPost() / deletePostPermanently() in src/lib/posts.ts",
  },
  {
    names: [
      "get_post_meta",
      "update_post_meta",
      "add_post_meta",
      "delete_post_meta",
      "get_field",
      "update_field",
    ],
    status: "api",
    nordpress:
      "posts.meta, a JSON column (also on terms, media and products); read and write it with Drizzle",
  },
  {
    names: ["register_post_type"],
    status: "missing",
    nordpress:
      "Only posts and pages for now; use a category plus post meta, or add a table in src/db/schema.ts",
  },
  {
    names: ["register_taxonomy"],
    status: "missing",
    nordpress:
      "Only categories and tags for now; store extra groupings in term or post meta",
  },
  {
    names: [
      "get_terms",
      "get_categories",
      "get_tags",
      "get_the_terms",
      "wp_get_post_terms",
      "get_the_category",
      "get_the_tags",
    ],
    status: "api",
    nordpress:
      "listTerms() / getPostTerms() / getTermBySlug() in src/lib/terms.ts",
  },
  {
    names: [
      "wp_insert_term",
      "wp_update_term",
      "wp_delete_term",
      "wp_set_post_terms",
    ],
    status: "api",
    nordpress:
      "createTerm() / updateTerm() / deleteTerm() in src/lib/terms.ts; post terms via savePost()",
  },
  {
    names: [
      "get_permalink",
      "the_permalink",
      "get_term_link",
      "get_category_link",
      "get_author_posts_url",
    ],
    status: "api",
    nordpress:
      "postPath() / termPath() / authorPath() in src/lib/permalinks.ts, with siteUrl() for absolute URLs",
  },
  {
    names: [
      "home_url",
      "site_url",
      "get_home_url",
      "get_site_url",
      "admin_url",
    ],
    status: "api",
    nordpress: "siteUrl(path) in src/lib/site-url.ts; admin is at /admin",
  },
  {
    names: [
      "get_comments",
      "wp_insert_comment",
      "wp_new_comment",
      "wp_set_comment_status",
    ],
    status: "api",
    nordpress:
      "getApprovedComments() / submitComment() / moderateComment() in src/lib/comments.ts",
  },
  {
    names: ["get_users", "get_user_by", "get_userdata"],
    status: "api",
    nordpress: "listUsers() / getUser() in src/lib/users.ts",
  },
  {
    names: ["wp_insert_user", "wp_create_user"],
    status: "missing",
    nordpress:
      "Accounts are created through Better Auth (src/lib/auth.ts) or Users → Add new",
  },
  {
    names: [
      "wp_handle_upload",
      "media_handle_upload",
      "wp_insert_attachment",
      "wp_upload_bits",
      "media_sideload_image",
    ],
    status: "api",
    nordpress:
      "storeUpload(file, uploaderId) in src/lib/media.ts (local disk or S3)",
  },
  {
    names: [
      "wp_get_attachment_url",
      "wp_get_attachment_image",
      "wp_get_attachment_image_src",
      "the_post_thumbnail",
      "get_the_post_thumbnail_url",
    ],
    status: "api",
    nordpress:
      "mediaUrl() in src/lib/media.ts; in themes, <UploadImage> from @/components/upload-image (resized, modern formats)",
  },
  // Data, caching, scheduling, HTTP
  {
    names: ["$wpdb", "dbDelta"],
    status: "api",
    nordpress:
      "db from @/db with Drizzle; new tables go in src/db/schema.ts, then pnpm db:generate and pnpm db:migrate",
  },
  {
    names: [
      "get_transient",
      "set_transient",
      "delete_transient",
      "wp_cache_get",
      "wp_cache_set",
      "wp_cache_delete",
    ],
    status: "api",
    nordpress:
      '"use cache" with cacheTag() / cacheLife() on the read; updateTag() or invalidate() after writes',
  },
  {
    names: ["wp_schedule_single_event"],
    status: "api",
    nordpress: "api.defer(fn) runs work after the response is sent",
  },
  {
    names: [
      "wp_schedule_event",
      "wp_next_scheduled",
      "wp_clear_scheduled_hook",
    ],
    status: "missing",
    nordpress:
      "No plugin scheduler yet; add a REST route that checks a secret and call it from cron, like core's /api/cron/* routes",
  },
  {
    names: [
      "wp_remote_get",
      "wp_remote_post",
      "wp_remote_request",
      "wp_safe_remote_get",
      "wp_safe_remote_post",
    ],
    status: "api",
    nordpress:
      "fetch(); for URLs users typed, check them first with assertPublicUrl() in src/lib/net.ts",
  },
  {
    names: ["wp_mail"],
    status: "api",
    nordpress: "sendMail({ to, subject, text, html }) in src/lib/mail.ts",
  },
  {
    names: ["wp_redirect", "wp_safe_redirect"],
    status: "api",
    nordpress:
      'redirect() from "next/navigation" in Server Actions; permanent redirects under Tools → Redirects',
  },
  // Escaping, sanitizing, translation
  {
    names: ["esc_html", "esc_attr", "esc_textarea", "esc_html_e", "esc_attr_e"],
    status: "built-in",
    nordpress:
      "React escapes everything it renders; in HTML strings (filters, shortcodes) use escapeHtml()",
  },
  {
    names: ["esc_url", "esc_url_raw"],
    status: "api",
    nordpress: "Parse with new URL() and allow only http(s)",
  },
  {
    names: ["wp_kses", "wp_kses_post", "wp_filter_post_kses"],
    status: "api",
    nordpress:
      "htmlToDoc() in src/lib/content.ts keeps only what the editor allows; it's the XSS boundary",
  },
  {
    names: [
      "sanitize_text_field",
      "sanitize_email",
      "sanitize_key",
      "absint",
      "intval",
    ],
    status: "api",
    nordpress: "Validate input with zod schemas",
  },
  {
    names: ["sanitize_title"],
    status: "api",
    nordpress: "slugify() in src/lib/slug.ts",
  },
  {
    names: [
      "__",
      "_e",
      "_x",
      "_n",
      "esc_html__",
      "esc_attr__",
      "load_plugin_textdomain",
      "load_theme_textdomain",
    ],
    status: "missing",
    nordpress:
      "No gettext yet, and the admin is English-only; write plain strings. Content translations are built in (/<lang>/ URLs)",
  },
  // Themes
  {
    names: [
      "wp_enqueue_script",
      "wp_enqueue_style",
      "wp_register_script",
      "wp_register_style",
      "wp_localize_script",
      "wp_add_inline_script",
    ],
    status: "missing",
    nordpress:
      "Themes import their CSS and components; plugins can't add scripts to public pages yet",
  },
  {
    names: [
      "get_header",
      "get_footer",
      "get_sidebar",
      "get_template_part",
      "locate_template",
    ],
    status: "api",
    nordpress:
      "The theme's Layout component wraps every page; share markup as React components",
  },
  {
    names: ["register_nav_menus", "register_nav_menu", "wp_nav_menu"],
    status: "api",
    nordpress:
      "menuLocations in defineTheme(); Layout gets the assigned menus as the `menus` prop",
  },
  {
    names: ["add_theme_support"],
    status: "built-in",
    nordpress:
      "Featured images, the title tag, HTML5 markup, feeds and responsive embeds are always on",
  },
  {
    names: ["get_theme_mod", "set_theme_mod", "customize_register"],
    status: "api",
    nordpress:
      "Theme `settings` fields; components read them from the `options` prop (Appearance → Customize)",
  },
  {
    names: [
      "the_title",
      "get_the_title",
      "the_content",
      "the_excerpt",
      "the_date",
      "get_the_date",
      "the_author",
      "the_time",
    ],
    status: "api",
    nordpress:
      "Props on Single and PostList: post.title, the ready-made `body`, summaryOf(), formatDate()",
  },
  {
    names: [
      "is_single",
      "is_page",
      "is_singular",
      "is_home",
      "is_front_page",
      "is_archive",
      "is_category",
      "is_tag",
      "is_search",
      "is_404",
      "is_admin",
    ],
    status: "built-in",
    nordpress:
      "Core picks the component (Single gets isFront; archives get ArchiveHeader); no global conditionals",
  },
  {
    names: [
      "comments_template",
      "wp_list_comments",
      "comment_form",
      "comments_open",
    ],
    status: "built-in",
    nordpress:
      "Single gets threaded comments and the form ready-made as `comments`",
  },
  {
    names: ["get_search_form"],
    status: "api",
    nordpress: "The theme's SearchForm component",
  },
  {
    names: [
      "paginate_links",
      "the_posts_pagination",
      "next_posts_link",
      "previous_posts_link",
    ],
    status: "api",
    nordpress: "The theme's Paging component ({ page, pages, base })",
  },
  {
    names: [
      "register_sidebar",
      "dynamic_sidebar",
      "register_widget",
      "the_widget",
    ],
    status: "missing",
    nordpress: "No widgets; build the sidebar into the theme's Layout",
  },
  {
    names: [
      "register_block_type",
      "register_block_pattern",
      "register_block_style",
    ],
    status: "missing",
    nordpress:
      "The editor is Tiptap, not Gutenberg; page sections cover common layouts (src/lib/sections.ts)",
  },
  {
    names: ["WC", "wc_get_product", "wc_get_order", "wc_get_products"],
    status: "built-in",
    nordpress:
      "The Shop is built in (src/lib/shop) with its own agent tools; no WooCommerce hooks",
  },
];

/** Template files a classic theme has, and the component that replaces each. */
export const THEME_FILES = {
  "style.css":
    "defineTheme() in index.ts (the header becomes name, version, description); styles move into the components or a CSS file they import",
  "theme.json": "Appearance → Design (colors, fonts, spacing; src/lib/design)",
  "functions.php":
    "defineTheme() for menus and settings; hooks move to a plugin",
  "header.php": "Layout",
  "footer.php": "Layout",
  "sidebar.php": "Layout",
  "single.php": "Single",
  "page.php": "Single",
  "singular.php": "Single",
  "front-page.php":
    "Single with isFront, or PostList when the front page shows posts",
  "index.php": "PostList (home), with ArchiveHeader, Paging and Empty",
  "home.php": "PostList",
  "archive.php": "ArchiveHeader + PostList",
  "category.php": "ArchiveHeader + PostList",
  "tag.php": "ArchiveHeader + PostList",
  "author.php": "ArchiveHeader + PostList",
  "date.php": "ArchiveHeader + PostList",
  "search.php": "SearchForm + PostList",
  "searchform.php": "SearchForm",
  "comments.php": "built in: Single gets `comments`",
  "404.php": "built in: core renders the not-found page",
};

/** @type {Entry} */
const AJAX = {
  names: ["wp_ajax_*"],
  status: "api",
  nordpress:
    "Admin-ajax handlers become REST routes (rest: [...]) or Server Actions",
};

/** Popular plugins whose job Nordpress already does, by wordpress.org slug. */
export const BUILT_IN_PLUGINS = {
  "wordpress-seo":
    "SEO: structured data, sitemap, canonical URLs, per-post titles and descriptions, llms.txt",
  "seo-by-rank-math":
    "SEO: structured data, sitemap, canonical URLs, per-post titles and descriptions, llms.txt",
  "all-in-one-seo-pack":
    "SEO: structured data, sitemap, canonical URLs, per-post titles and descriptions, llms.txt",
  "contact-form-7": "Forms, with AI drafting and spam triage",
  "wpforms-lite": "Forms, with AI drafting and spam triage",
  gravityforms: "Forms, with AI drafting and spam triage",
  "ninja-forms": "Forms, with AI drafting and spam triage",
  woocommerce: "Shop, with Stripe Checkout",
  memberpress: "Members",
  "paid-memberships-pro": "Members",
  "sitepress-multilingual-cms": "Translations",
  polylang: "Translations",
  jetpack: "Insights (stats) and Newsletter",
  "google-analytics-for-wordpress": "Insights, cookie-free",
  akismet:
    "AI spam triage for forms; moderation rules and the comment-blocklist plugin",
  mailpoet: "Newsletter",
  redirection:
    "Redirects (Tools → Redirects) and automatic redirects from old permalinks",
  updraftplus: "Backups (Tools → Backups)",
  wordfence: "Login rate limits, 2FA and passkeys (there is no firewall)",
  "two-factor": "2FA and passkeys",
  "broken-link-checker": "The Inbox's daily checks",
  "classic-editor": "Nothing to port: the editor is Tiptap",
};

const entryIndex = (entries) => {
  const map = new Map();
  for (const entry of entries)
    for (const name of entry.names) map.set(name.toLowerCase(), entry);
  return map;
};
const HOOK_INDEX = entryIndex(HOOKS);
const FUNCTION_INDEX = entryIndex(FUNCTIONS);

/**
 * Reads the "Plugin Name:" / "Theme Name:" comment header of a PHP or CSS file.
 * @returns {{ name: string, description?: string, version?: string, author?: string } | null}
 */
export function parseHeader(source) {
  const fields = {
    name: /^[ \t/*#@]*(?:Plugin|Theme) Name:(.*)$/im,
    description: /^[ \t/*#@]*Description:(.*)$/im,
    version: /^[ \t/*#@]*Version:(.*)$/im,
    author: /^[ \t/*#@]*Author:(.*)$/im,
  };
  const header = {};
  for (const [key, re] of Object.entries(fields)) {
    const m = source.slice(0, 8192).match(re);
    if (m) header[key] = m[1].replace(/\s*\*\/\s*$/, "").trim();
  }
  return header.name ? header : null;
}

// PHP comments are skipped so documentation doesn't count as usage; newlines
// are kept so line numbers stay right.
function stripComments(source) {
  return source.replace(
    /\/\*[\s\S]*?\*\/|(?<![:"'\\])\/\/[^\n]*|^\s*#[^\n[]*/gm,
    (m) => m.replace(/[^\n]/g, " "),
  );
}

/**
 * Every WordPress hook and function a PHP file uses that Nordpress has an
 * answer for. Calls to the plugin's own functions are ignored.
 * @returns {{ kind: "hook" | "function", name: string, at: number, line: number, entry: Entry }[]}
 */
export function scanPhp(source) {
  const code = stripComments(source);
  const lineAt = (index) => code.slice(0, index).split("\n").length;
  const found = [];
  const hookRe =
    /\b(add_action|add_filter|do_action|apply_filters|has_action|has_filter)\s*\(\s*(['"])([\w/.-]+)\2/g;
  for (const m of code.matchAll(hookRe)) {
    const name = m[3];
    const entry =
      HOOK_INDEX.get(name.toLowerCase()) ??
      (name.startsWith("save_post_") ? HOOK_INDEX.get("save_post") : null) ??
      (/^wp_ajax_/.test(name) ? AJAX : null);
    // Positioned at the hook's name, so it sorts after add_action itself
    const at = m.index + m[0].lastIndexOf(name);
    if (entry) found.push({ kind: "hook", name, at, line: lineAt(at), entry });
  }
  const callRe =
    /(?<![\w$>:\\])(\$wpdb|new\s+WP_Query|[A-Za-z_]\w*)\s*(\(|->)/g;
  for (const m of code.matchAll(callRe)) {
    const name = m[1].replace(/^new\s+/, "");
    if (m[2] === "->" && name !== "$wpdb") continue;
    const entry = FUNCTION_INDEX.get(name.toLowerCase());
    if (entry)
      found.push({
        kind: "function",
        name,
        at: m.index,
        line: lineAt(m.index),
        entry,
      });
  }
  return found.sort((a, b) => a.at - b.at);
}

/** Groups scan results by the Nordpress entry they map to. */
export function summarize(findings) {
  const groups = new Map();
  for (const f of findings) {
    const group = groups.get(f.entry) ?? {
      entry: f.entry,
      names: new Set(),
      places: [],
    };
    group.names.add(f.name);
    group.places.push(f.place ?? `line ${f.line}`);
    groups.set(f.entry, group);
  }
  const order = { missing: 0, api: 1, "built-in": 2 };
  return [...groups.values()].sort(
    (a, b) => order[a.entry.status] - order[b.entry.status],
  );
}
