# Writing themes

A theme decides how the site looks; Nordpress core does everything else (routing, data, comments, forms, structured data, members-only gating, translations and plugin filters). Start from an existing theme:

```bash
pnpm new:theme sunrise "Sunrise" --from nord
```

Then switch to it under **Appearance → Themes** and edit `src/themes/sunrise/`.

## The definition

```ts
import { defineTheme } from "@/lib/themes/types";

export default defineTheme({
  slug: "sunrise",
  name: "Sunrise",
  version: "1.0.0",
  description: "One sentence for the Themes screen.",
  menuLocations: { primary: "Header menu", footer: "Footer menu" },
  settings: [
    /* fields under Appearance → Customize */
  ],
  components: {
    Layout,
    Single,
    PostList,
    ArchiveHeader,
    Paging,
    SearchForm,
    Empty,
  },
});
```

## Components

All are React Server Components, and all receive the theme's settings as `options` (except where noted).

| Component       | Renders                                      | Props                                                                                          |
| --------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `Layout`        | header, navigation, footer around every page | `site`, `menus` (by location, or `null`), `pages` (for a fallback menu), `options`, `children` |
| `Single`        | a post or page                               | `post`, `site`, `options`, `isFront`, `preview`, `body`, `comments`                            |
| `PostList`      | post listings: home, archives, search        | `posts`, `site`, `options`                                                                     |
| `ArchiveHeader` | the heading of an archive                    | `title`, `description`, `options`                                                              |
| `Paging`        | older/newer links                            | `page`, `pages`, `base`                                                                        |
| `SearchForm`    | the search box                               | `query`                                                                                        |
| `Empty`         | an empty listing                             | `message`                                                                                      |

`Single` gets `body` and `comments` ready-made: render them where they belong, and core handles forms, videos, members-only teasers and language links inside them.

## Helpers

`src/lib/themes/helpers.ts` has `formatDate`, `postUrl`, `summaryOf`, `authorPath` and `termPath`. For images use `UploadImage` from `@/components/upload-image`, which serves resized, modern formats.

## Settings

The same field types as plugins. Read them from `options` in any component; they're saved per theme, so switching themes and back keeps them.

The two built-in themes are worth reading: `classic` (single column, reading-focused) and `nord` (cards, an accent color, a list/grid option).
