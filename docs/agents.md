# AI agents

Nordpress is an MCP server at `/mcp`. Anything that speaks MCP (Claude, Claude Code, other agents) can find, read and write content, moderate comments, read form responses and manage the shop, always as a specific person and with that person's role.

## Connecting

**Claude (custom connector) and other OAuth-capable clients:** add `https://your-site/mcp`. The client registers itself, you sign in to Nordpress, read what it will be able to do, and choose **Allow**. Connected apps are listed under **Profile → Connected apps**; disconnecting cuts access immediately.

**Scripts and clients without OAuth:** create an application password under **Profile**, then send it as HTTP Basic auth:

```bash
claude mcp add --transport http nordpress https://your-site/mcp \
  --header "Authorization: Basic $(printf '%s' 'you@example.com:abcd efgh ijkl mnop qrst uvwx' | base64)"
```

## Tools

| Tool                                                    | Needs                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------ |
| `get_site_info`                                         | any account                                                              |
| `search_content`, `get_post`                            | writing posts or pages (own content only, unless the role edits others') |
| `create_post`, `update_post`, `trash_post`              | writing posts or pages                                                   |
| `list_categories_and_tags`                              | any account                                                              |
| `list_comments`, `moderate_comment`, `reply_to_comment` | moderating comments                                                      |
| `set_image_alt_text`                                    | uploading media                                                          |
| `get_form_responses`                                    | Editor or above                                                          |
| `search_products`, `save_product`                       | Editor or above                                                          |
| `list_orders`                                           | Administrator                                                            |

Post bodies go in and out as Markdown, sanitized like any other content.

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
