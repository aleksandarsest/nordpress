import { type Actor, type Capability, hasCap } from "@/lib/capabilities";

export type NavItem = {
  label: string;
  href: string;
  icon:
    | "dashboard"
    | "assistant"
    | "inbox"
    | "insights"
    | "posts"
    | "media"
    | "pages"
    | "comments"
    | "forms"
    | "shop"
    | "members"
    | "newsletter"
    | "appearance"
    | "plugins"
    | "tools"
    | "users"
    | "profile"
    | "settings";
  badge?: number;
  children?: { label: string; href: string }[];
};

type NavDef = Omit<NavItem, "children"> & {
  cap: Capability;
  children?: { label: string; href: string; cap: Capability }[];
};

const NAV: NavDef[] = [
  { label: "Dashboard", href: "/admin", icon: "dashboard", cap: "read" },
  {
    label: "Assistant",
    href: "/admin/assistant",
    icon: "assistant",
    cap: "edit_posts",
  },
  {
    label: "Inbox",
    href: "/admin/inbox",
    icon: "inbox",
    cap: "edit_others_posts",
  },
  {
    label: "Insights",
    href: "/admin/insights",
    icon: "insights",
    cap: "edit_others_posts",
  },
  {
    label: "Posts",
    href: "/admin/posts",
    icon: "posts",
    cap: "edit_posts",
    children: [
      { label: "All Posts", href: "/admin/posts", cap: "edit_posts" },
      { label: "Add New Post", href: "/admin/posts/new", cap: "edit_posts" },
      {
        label: "Categories",
        href: "/admin/categories",
        cap: "manage_categories",
      },
      { label: "Tags", href: "/admin/tags", cap: "manage_categories" },
    ],
  },
  {
    label: "Media",
    href: "/admin/media",
    icon: "media",
    cap: "upload_files",
  },
  {
    label: "Pages",
    href: "/admin/pages",
    icon: "pages",
    cap: "edit_pages",
    children: [
      { label: "All Pages", href: "/admin/pages", cap: "edit_pages" },
      {
        label: "Add New Page",
        href: "/admin/posts/new?type=page",
        cap: "edit_pages",
      },
    ],
  },
  {
    label: "Comments",
    href: "/admin/comments",
    icon: "comments",
    cap: "moderate_comments",
  },
  {
    label: "Forms",
    href: "/admin/forms",
    icon: "forms",
    cap: "edit_others_pages",
  },
  {
    label: "Shop",
    href: "/admin/shop",
    icon: "shop",
    cap: "edit_others_pages",
    children: [
      { label: "Products", href: "/admin/shop", cap: "edit_others_pages" },
      {
        label: "Add Product",
        href: "/admin/shop/new",
        cap: "edit_others_pages",
      },
      { label: "Orders", href: "/admin/shop/orders", cap: "manage_options" },
      {
        label: "Settings",
        href: "/admin/shop/settings",
        cap: "manage_options",
      },
    ],
  },
  {
    label: "Newsletter",
    href: "/admin/newsletter",
    icon: "newsletter",
    cap: "edit_others_posts",
  },
  {
    label: "Members",
    href: "/admin/members",
    icon: "members",
    cap: "manage_options",
  },
  {
    label: "Appearance",
    href: "/admin/appearance/design",
    icon: "appearance",
    cap: "manage_options",
    children: [
      {
        label: "Design",
        href: "/admin/appearance/design",
        cap: "manage_options",
      },
      {
        label: "Themes",
        href: "/admin/appearance/themes",
        cap: "manage_options",
      },
      {
        label: "Customize",
        href: "/admin/appearance/customize",
        cap: "manage_options",
      },
      {
        label: "Menus",
        href: "/admin/appearance/menus",
        cap: "manage_options",
      },
    ],
  },
  {
    label: "Plugins",
    href: "/admin/plugins",
    icon: "plugins",
    cap: "manage_options",
  },
  {
    label: "Users",
    href: "/admin/users",
    icon: "users",
    cap: "list_users",
    children: [
      { label: "All Users", href: "/admin/users", cap: "list_users" },
      { label: "Add New User", href: "/admin/users/new", cap: "create_users" },
      { label: "Profile", href: "/admin/profile", cap: "read" },
    ],
  },
  { label: "Profile", href: "/admin/profile", icon: "profile", cap: "read" },
  {
    label: "Settings",
    href: "/admin/settings",
    icon: "settings",
    cap: "manage_options",
    children: [
      { label: "General", href: "/admin/settings", cap: "manage_options" },
      {
        label: "Reading",
        href: "/admin/settings/reading",
        cap: "manage_options",
      },
      {
        label: "Discussion",
        href: "/admin/settings/discussion",
        cap: "manage_options",
      },
      {
        label: "Permalinks",
        href: "/admin/settings/permalinks",
        cap: "manage_options",
      },
      { label: "AI", href: "/admin/settings/ai", cap: "manage_options" },
      {
        label: "Agents",
        href: "/admin/settings/agents",
        cap: "manage_options",
      },
    ],
  },
];

export type ToolPage = { plugin: string; path: string; title: string };

export function navFor(
  actor: Actor,
  pendingComments = 0,
  tools: ToolPage[] = [],
  openSuggestions = 0,
): NavItem[] {
  const canListUsers = hasCap(actor, "list_users");
  // Backups and plugin pages appear under Tools, as in WordPress
  const admin = hasCap(actor, "manage_options");
  const toolsItem: NavDef[] =
    tools.length || admin
      ? [
          {
            label: "Tools",
            href: admin
              ? "/admin/backups"
              : `/admin/tools/${tools[0].plugin}/${tools[0].path}`,
            icon: "tools",
            cap: "read",
            children: [
              {
                label: "Backups",
                href: "/admin/backups",
                cap: "manage_options",
              },
              {
                label: "Redirects",
                href: "/admin/redirects",
                cap: "manage_options",
              },
              ...tools.map((t) => ({
                label: t.title,
                href: `/admin/tools/${t.plugin}/${t.path}`,
                cap: "read" as const,
              })),
            ],
          },
        ]
      : [];
  const items = [...NAV];
  items.splice(
    items.findIndex((i) => i.icon === "settings"),
    0,
    ...toolsItem,
  );
  return items
    .filter((item) => hasCap(actor, item.cap))
    .filter((item) => !(item.icon === "profile" && canListUsers))
    .map(({ cap: _cap, children, ...item }) => ({
      ...item,
      badge:
        item.icon === "comments" && pendingComments
          ? pendingComments
          : item.icon === "inbox" && openSuggestions
            ? openSuggestions
            : undefined,
      children: children
        ?.filter((c) => hasCap(actor, c.cap))
        .map(({ cap: _c, ...c }) => c),
    }));
}
