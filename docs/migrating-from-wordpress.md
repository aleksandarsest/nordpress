# Migrating from WordPress

Most sites move in about an hour, most of it spent checking the result.

## 1. Set up Nordpress

Follow **Self-hosting** in the [README](../README.md#self-hosting) and finish the installer. Skip the site setup wizard: you're bringing your own content.

## 2. Import

Activate **WordPress Importer** under **Plugins**, then open **Tools → Import from WordPress**.

|                                          | Live site address                 | Export file                                                |
| ---------------------------------------- | --------------------------------- | ---------------------------------------------------------- |
| How                                      | Enter `https://your-old-site.com` | **Tools → Export → All content** in WordPress, then upload |
| Published posts and pages                | Yes                               | Yes                                                        |
| Drafts, private and scheduled posts      | No                                | Yes                                                        |
| Categories, tags, featured images, media | Yes                               | Yes                                                        |
| Comments                                 | Approved only                     | All, with their status                                     |
| Menus                                    | No                                | Yes                                                        |
| Authors                                  | By name; their posts go to you    | Matched by email, or created                               |

Media is downloaded from the old site, so keep it online until the import finishes. Importing again later skips anything already imported.

## 3. Check what came across

- **Shortcodes** (`[gallery]`, `[contact-form-7]` …) arrive as plain text: WordPress plugins don't run here. Replace them with the Nordpress equivalent (see the table below) or remove them.
- **Page builders** (Elementor, Divi …) store layouts in their own format; the importer keeps the text, not the layout.
- **Password-protected posts** become private posts.
- Re-create **menus** under **Appearance → Menus** if you imported from a live site, and assign them to the theme's locations either way.

## 4. Keep your links working

Old addresses like `/2024/05/my-post/` and `/my-post/` redirect to the new ones with a permanent redirect, so search rankings and links from other sites carry over. Pick the permalink structure that matches your old site under **Settings → Permalinks** to keep URLs identical.

## 5. Switch the domain

Point your domain at the new server, set `SITE_URL` and `BETTER_AUTH_URL` to it, and restart. Submit `/sitemap.xml` in Google Search Console.

## Plugins you won't need

| On WordPress                           | In Nordpress                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------------- |
| Yoast, Rank Math                       | Structured data, sitemap, canonical URLs, `llms.txt` and AI crawler controls are built in |
| Contact Form 7, Gravity Forms, WPForms | **Forms**, with AI drafting and spam triage                                               |
| WooCommerce (store basics)             | **Shop**, with Stripe Checkout                                                            |
| MemberPress, Paid Memberships Pro      | **Members**                                                                               |
| WPML, Polylang                         | **Translations**                                                                          |
| Jetpack Stats, MonsterInsights         | **Insights**, cookie-free                                                                 |
| Akismet                                | AI spam triage for forms; comment moderation rules and the blocklist plugin for comments  |
| Broken Link Checker                    | The **Inbox**'s daily checks                                                              |
| Redirection (for old URLs)             | Automatic redirects from old permalinks                                                   |

For anything else, a plugin is a TypeScript file: see [Writing plugins](plugins.md).
