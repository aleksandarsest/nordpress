import type { ComponentType, ReactNode } from "react";
import type { ResolvedMenuItem } from "../menus";
import type { SiteSettings } from "../options";
import type { SettingField } from "../plugins/types";
import type { getPublished, PageNode, PostSummary } from "../posts";

export type SinglePost = NonNullable<Awaited<ReturnType<typeof getPublished>>>;

/** The theme's own settings (Appearance → Customize), merged over defaults. */
export type ThemeOptions = Record<string, string | number | boolean>;

export type ThemeLayoutProps = {
  site: SiteSettings;
  /** Menus by location; null when no menu is assigned there. */
  menus: Record<string, ResolvedMenuItem[] | null>;
  /** Published top-level pages, for a fallback when no menu is assigned. */
  pages: PageNode[];
  options: ThemeOptions;
  children: ReactNode;
};

export type ThemeSingleProps = {
  post: SinglePost;
  site: SiteSettings;
  options: ThemeOptions;
  /** True when this page is the static front page. */
  isFront: boolean;
  /** True on /preview: leave out links that only make sense once published. */
  preview: boolean;
  /** The post body, already filtered by plugins and made responsive. */
  body: ReactNode;
  /** The comments section, or null when comments don't apply. */
  comments: ReactNode;
};

export type ThemeComponents = {
  Layout: ComponentType<ThemeLayoutProps>;
  Single: ComponentType<ThemeSingleProps>;
  PostList: ComponentType<{
    posts: PostSummary[];
    site: SiteSettings;
    options: ThemeOptions;
  }>;
  ArchiveHeader: ComponentType<{
    title: string;
    description?: string;
    options: ThemeOptions;
  }>;
  Paging: ComponentType<{ page: number; pages: number; base: string }>;
  SearchForm: ComponentType<{ query?: string }>;
  /** Shown on archives with no posts. */
  Empty: ComponentType<{ message: string }>;
};

export type ThemeDefinition = {
  /** Unique, URL-safe identifier. */
  slug: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  /** Where menus can be placed, e.g. { primary: "Primary menu" }. */
  menuLocations: Record<string, string>;
  /** Fields shown under Appearance → Customize. */
  settings?: SettingField[];
  components: ThemeComponents;
};

export function defineTheme(theme: ThemeDefinition): ThemeDefinition {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(theme.slug)) {
    throw new Error(
      `Invalid theme slug "${theme.slug}": use lowercase letters, digits and dashes.`,
    );
  }
  return theme;
}
