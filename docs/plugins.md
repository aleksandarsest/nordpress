# Writing plugins

A plugin is a folder in `src/plugins/` exporting `definePlugin({...})`, registered in `src/plugins/index.ts`. Start one with:

```bash
pnpm new:plugin event-calendar "Event Calendar"
```

Activate it under **Plugins**. Plugins are compiled with the site, so they're type-checked and can use anything in `src/lib`.

## The definition

```ts
import { definePlugin } from "@/lib/plugins/types";

export default definePlugin({
  slug: "event-calendar", // also the REST namespace
  name: "Event Calendar",
  version: "1.0.0",
  description: "One sentence for the Plugins screen.",
  settings: [
    /* fields shown under Plugins → Event Calendar */
  ],
  rest: [
    /* routes at /wp-json/event-calendar/v1/... */
  ],
  adminPages: [
    /* screens under Tools */
  ],
  register(api) {
    /* hooks */
  },
});
```

## Hooks

Actions run after something happened; filters change a value and return it.

| Action                         | Arguments                                                                                                            |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `post.saved`                   | `{ post, previousStatus, url, actorId, source }`; `source` is `"import"` for bulk imports, so skip side effects then |
| `post.trashed`, `post.deleted` | the post                                                                                                             |
| `comment.created`              | the comment                                                                                                          |
| `media.uploaded`               | the media item                                                                                                       |
| `form.submitted`               | `{ form, submission }`, after spam triage; spam never arrives                                                        |
| `newsletter.subscribed`        | `{ id, email, name }`, once the subscriber has confirmed                                                             |
| `user.created`                 | `{ id, name, email, role }`                                                                                          |

| Filter             | Value, context                                       |
| ------------------ | ---------------------------------------------------- |
| `post.contentHtml` | the post's HTML on the site and in feeds, `{ post }` |
| `post.markdown`    | the Markdown copy served to AI agents, `{ post }`    |
| `comment.status`   | the status a new comment gets, the comment           |

```ts
register(api) {
  api.addFilter("post.contentHtml", async (html, { post }) =>
    post.type === "post" ? `${html}<p>Thanks for reading!</p>` : html,
  );
  api.addAction("post.saved", async ({ post, previousStatus, source }) => {
    if (source === "import") return;
    if (post.status === "publish" && previousStatus !== "publish")
      api.defer(async () => {
        await fetch("https://example.com/hook", { method: "POST" });
      });
  });
}
```

`api.defer()` runs work after the response is sent; use it for anything slow. `api.settings()` returns the plugin's saved settings merged over the defaults. `api.log()` prefixes messages with the plugin's name.

## Settings

Field types: `text`, `url`, `email`, `textarea`, `number` (with `min`/`max`), `checkbox`, `select` (with `options`). Each has `key`, `label`, optional `help` and `default`.

## REST routes

```ts
rest: [
  {
    method: "GET",           // GET, POST or DELETE
    path: "/items/:id",      // served at /wp-json/<slug>/v1/items/:id
    handler: async ({ params, query, viewer, requireCap, body }) => {
      await requireCap("edit_posts");   // 401/403 unless allowed
      return { id: params.id };
    },
  },
],
```

Callers authenticate with an application password or a signed-in session.

## Admin screens

```ts
adminPages: [
  { path: "import", title: "Import events", cap: "manage_options", component: ImportScreen },
],
```

The screen lives at `/admin/tools/<slug>/<path>` and appears under **Tools** while the plugin is active. It's a React Server Component and can use Server Actions.

## Examples in the repository

- `reading-time`: a filter, settings and a REST route.
- `webhooks`: actions and deferred HTTP calls.
- `comment-blocklist`: the `comment.status` filter.
- `wordpress-importer` (the Site Importer): an admin screen and a long-running job; it copies WordPress through its API or an export file, and any other site page by page.
