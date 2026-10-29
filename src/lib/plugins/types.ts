import type { ComponentType } from "react";
import type {
  Comment,
  CommentStatus,
  Form,
  FormSubmission,
  Media,
  Post,
  PostStatus,
  Role,
} from "@/db/schema";
import type { Capability } from "../capabilities";
import type { Viewer } from "../session";
import type { ShortcodeHandler } from "./shortcodes";

// ---------------------------------------------------------------------------
// Hooks: every action and filter core fires, with its arguments.
// Plugins may add their own by augmenting these interfaces:
//
//   declare module "@/lib/plugins/types" {
//     interface ActionHooks { "my-plugin.done": [id: number] }
//   }
// ---------------------------------------------------------------------------

export type SavedPostEvent = {
  post: Post;
  previousStatus: PostStatus | null;
  /** Public URL of the post (meaningful once published). */
  url: string;
  actorId: string;
  /** "import" for bulk imports, so plugins can skip side effects. */
  source: "app" | "import";
};

export type FormSubmittedEvent = {
  form: Pick<Form, "id" | "title" | "fields">;
  submission: FormSubmission;
};

export interface ActionHooks {
  "post.saved": [event: SavedPostEvent];
  "post.trashed": [post: Post];
  "post.deleted": [post: Post];
  "comment.created": [comment: Comment];
  "media.uploaded": [item: Media];
  "form.submitted": [event: FormSubmittedEvent];
  /** Someone confirmed their newsletter subscription. */
  "newsletter.subscribed": [
    subscriber: { id: number; email: string; name: string },
  ];
  "user.created": [
    user: { id: string; name: string; email: string; role: Role },
  ];
}

export type CommentCheck = {
  postId: number;
  content: string;
  authorName: string;
  authorEmail: string;
  authorUrl: string;
  ip: string | null;
};

export interface FilterHooks {
  /** Rendered HTML of a post body on the public site and in feeds. */
  "post.contentHtml": [
    html: string,
    context: { post: Pick<Post, "id" | "type" | "title" | "contentText"> },
  ];
  /** Markdown version of a post served to AI agents at <permalink>.md. */
  "post.markdown": [
    markdown: string,
    context: { post: Pick<Post, "id" | "type" | "title" | "contentText"> },
  ];
  /** Status a new comment from a non-moderator gets. */
  "comment.status": [status: CommentStatus, comment: CommentCheck];
}

export type ActionName = keyof ActionHooks;
export type FilterName = keyof FilterHooks;

// ---------------------------------------------------------------------------
// Plugin definition
// ---------------------------------------------------------------------------

export type SettingField =
  | {
      type: "text" | "url" | "email";
      key: string;
      label: string;
      help?: string;
      default?: string;
    }
  | {
      type: "textarea";
      key: string;
      label: string;
      help?: string;
      default?: string;
      rows?: number;
    }
  | {
      type: "number";
      key: string;
      label: string;
      help?: string;
      default?: number;
      min?: number;
      max?: number;
    }
  | {
      type: "checkbox";
      key: string;
      label: string;
      help?: string;
      default?: boolean;
    }
  | {
      type: "select";
      key: string;
      label: string;
      help?: string;
      default?: string;
      options: { value: string; label: string }[];
    };

export type PluginSettings = Record<string, string | number | boolean>;

export type RestRequest = {
  request: Request;
  params: Record<string, string>;
  query: URLSearchParams;
  /** The authenticated user, if any (application password or session). */
  viewer: () => Promise<Viewer | null>;
  /** Throws a 401/403 REST error unless the user has the capability. */
  requireCap: (cap: Capability) => Promise<Viewer>;
  body: () => Promise<Record<string, unknown>>;
};

export type PluginRestRoute = {
  method: "GET" | "POST" | "DELETE";
  /** Path below the plugin's namespace, e.g. "/estimate" or "/items/:id". */
  path: string;
  handler: (req: RestRequest) => Promise<unknown> | unknown;
};

export type PluginApi = {
  addAction<N extends ActionName>(
    name: N,
    fn: (...args: ActionHooks[N]) => void | Promise<void>,
    priority?: number,
  ): void;
  addFilter<N extends FilterName>(
    name: N,
    fn: (
      ...args: FilterHooks[N]
    ) => FilterHooks[N][0] | Promise<FilterHooks[N][0]>,
    priority?: number,
  ): void;
  /**
   * Expands [tag attr="x"] and [tag]...[/tag] in post HTML, like WordPress's
   * add_shortcode(). Return HTML, and escape attributes with escapeHtml().
   */
  addShortcode(
    tag: string,
    fn: ShortcodeHandler<FilterHooks["post.contentHtml"][1]>,
  ): void;
  /** This plugin's saved settings, merged over the field defaults. */
  settings(): Promise<PluginSettings>;
  /** Runs work after the response has been sent (webhooks, emails, ...). */
  defer(fn: () => Promise<void>): void;
  log(...args: unknown[]): void;
};

export type PluginAdminPage = {
  /** URL segment: the page lives at /admin/tools/<plugin>/<path>. */
  path: string;
  title: string;
  cap: Capability;
  /** A Server Component; it may render Client Components and use Server Actions. */
  component: ComponentType;
};

export type PluginDefinition = {
  /** Unique, URL-safe identifier; also the REST namespace. */
  slug: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  settings?: SettingField[];
  rest?: PluginRestRoute[];
  /** Admin screens, listed under Tools while the plugin is active. */
  adminPages?: PluginAdminPage[];
  register(api: PluginApi): void;
};

export function definePlugin(plugin: PluginDefinition): PluginDefinition {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(plugin.slug)) {
    throw new Error(
      `Invalid plugin slug "${plugin.slug}": use lowercase letters, digits and dashes.`,
    );
  }
  return plugin;
}
