# AI agents

Nordpress is an MCP server at `/mcp`. Anything that speaks MCP (Claude, Claude Code, other agents) can find, read and write content, moderate comments, read form responses and manage the shop, always as a specific person and with that person's role.

## Connecting

**Claude (custom connector) and other OAuth-capable clients:** add `https://your-site/mcp`. The client registers itself, you sign in to Nordpress, read what it will be able to do, and choose **Allow**. Connected apps are listed under **Profile → Connected apps**; disconnecting cuts access immediately.

**Scripts and clients without OAuth:** create an application password under **Profile**, then send it as HTTP Basic auth:

```bash
claude mcp add --transport http nordpress https://your-site/mcp \
  --header "Authorization: Basic $(printf '%s' 'you@example.com:abcd efgh ijkl mnop qrst uvwx' | base64)"
```

## Using your Claude or ChatGPT subscription

The built-in AI features (writing assistant, admin assistant, site chat, form triage, automatic translation and alt text) run on the site's Anthropic API key. If you'd rather not add a key, or want to use the Claude plan you already pay for, connect Claude to the site over MCP: the work then happens in your own Claude app, on your own subscription, and the site needs no key at all.

- **Claude (claude.ai, Claude Desktop):** add `https://your-site/mcp` as a custom connector.
- **Claude Code:** `claude mcp add --transport http nordpress https://your-site/mcp`. This is also the easiest way to try the agent tools against the real model while developing (use `http://localhost:3000/mcp`).
- **Other MCP clients,** including ChatGPT where it supports custom MCP connectors, take the same address.

The tools cover what the built-in features do: `view_image` lets the model see an image and `set_image_alt_text` saves its description, `save_translation` stores a translation it wrote, `create_form` builds a form it designed, and `get_site_tasks` with `resolve_inbox_item` work through the Inbox. Ready-made prompts start the common jobs; in Claude they appear in the connector's prompt menu:

| Prompt            | Does                                                                   |
| ----------------- | ---------------------------------------------------------------------- |
| `write_post`      | Drafts a post on a topic, in the voice of the site's recent posts      |
| `translate_post`  | Translates a post or page into one of the site's languages, as a draft |
| `describe_images` | Writes alt text for images that have none                              |
| `site_checkup`    | Missing excerpts and alt text plus the Inbox, fixed with your go-ahead |
| `create_form`     | Designs a form from a description and adds it to a page                |
| `answer_comments` | Reviews the moderation queue and drafts replies                        |

Subscriptions can't be used as API keys: Claude and ChatGPT plans cover their own apps, not calls from other software. So features that run on the site itself, for visitors or in the background (the site chat, spam checks on form responses, automatic alt text on upload), still need an API key. Everything you do yourself, as the site's author or editor, works through MCP.

## Tools

| Tool                                                    | Needs                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------ |
| `get_site_info`                                         | any account                                                              |
| `search_content`, `get_post`                            | writing posts or pages (own content only, unless the role edits others') |
| `create_post`, `update_post`, `trash_post`              | writing posts or pages                                                   |
| `list_categories_and_tags`                              | any account                                                              |
| `list_comments`, `moderate_comment`, `reply_to_comment` | moderating comments                                                      |
| `list_media`, `view_image`, `set_image_alt_text`        | uploading media                                                          |
| `save_translation`                                      | editing the original post or page                                        |
| `get_form_responses`, `create_form`                     | Editor or above                                                          |
| `get_site_tasks`, `resolve_inbox_item`                  | any account (each list shows what that role may fix)                     |
| `get_newsletter`, `email_post`                          | Editor or above; emailing follows the live-site policy                   |
| `search_products`, `save_product`                       | Editor or above                                                          |
| `list_orders`                                           | Administrator                                                            |

Post bodies go in and out as Markdown, sanitized like any other content. Embedded forms and videos appear as tags (`<div data-form="5"></div>`) so they survive an edit; agents add a form to a page the same way.

## What agents may change

By default (**Settings → Agents**), agents can't touch the live site:

- asking to publish saves the post as **Pending Review** for a person;
- published posts and pages, and products for sale, are read-only to them;
- replies to comments (which are public) are refused.

Each refusal says why, so the agent can tell its user. Allowing live changes is one checkbox. The admin **Assistant** is different: there a person approves every change as it's proposed.

## The log

Every change, refusal and failure is recorded under **Settings → Agents**: when, which person, which app or application password, the arguments (long text shortened) and the outcome. Read-only lookups aren't logged.

## Rate limits

120 calls a minute per person, and at most 600 requests a minute from one address, signed in or not.
