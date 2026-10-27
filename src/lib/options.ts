import "server-only";
import { inArray } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/db";
import type { Role } from "@/db/schema";
import { options } from "@/db/schema";

export const PERMALINK_STRUCTURES = {
  plain: "/?p=%post_id%",
  postname: "/%postname%",
  dated: "/%year%/%monthnum%/%postname%",
  archive: "/archives/%post_id%",
} as const;

export const AI_MODELS = {
  "claude-opus-5-5": "Claude Opus 5.5 (best quality)",
  "claude-sonnet-5-5": "Claude Sonnet 5.5 (faster, lower cost)",
  "claude-haiku-5-5": "Claude Haiku 5.5 (fastest, lowest cost)",
} as const;

export type AiModel = keyof typeof AI_MODELS;

export type PermalinkStructure = keyof typeof PERMALINK_STRUCTURES;

export type SiteSettings = {
  installed: boolean;
  title: string;
  tagline: string;
  adminEmail: string;
  usersCanRegister: boolean;
  defaultRole: Role;
  timezone: string;
  dateFormat: string;
  postsPerPage: number;
  permalinkStructure: PermalinkStructure;
  showOnFront: "posts" | "page";
  pageOnFront: number | null;
  pageForPosts: number | null;
  defaultCategory: number | null;
  blogPublic: boolean;
  /** Let AI search engines and assistants (ChatGPT search, Claude, Perplexity) read the site. */
  aiSearchCrawlers: boolean;
  /** Let crawlers that collect AI training data (GPTBot, ClaudeBot, CCBot) read the site. */
  aiTrainingCrawlers: boolean;
  // Discussion
  defaultCommentStatus: "open" | "closed";
  requireNameEmail: boolean;
  commentRegistration: boolean;
  commentModeration: boolean;
  commentPreviouslyApproved: boolean;
  threadDepth: number;
  closeCommentsDaysOld: number;
  // AI
  aiEnabled: boolean;
  aiModel: AiModel;
  aiAutoAltText: boolean;
  chatEnabled: boolean;
  chatDailyLimit: number;
  /** What the site is about: who runs it, what it offers, for whom. */
  siteAbout: string;
  /** Tone, audience and style rules every AI feature follows. */
  brandVoice: string;
  /** Tell readers when AI helped write a post or page. */
  aiDisclosure: boolean;
  /** Run daily site checks and propose fixes in the AI inbox. */
  inboxEnabled: boolean;
  /** ISO time the inbox checks last ran. */
  inboxLastRun: string;
  /** The shop's currency (ISO 4217). */
  shopCurrency: string;
  /** How to pay when Stripe isn't set up, e.g. bank details. */
  shopPaymentInstructions: string;
  /** Let AI agents connect over MCP at /mcp with an application password. */
  mcpEnabled: boolean;
  /**
   * Let agents change the live site: publish, edit or trash published
   * content, and reply to comments. Off means their work waits for review.
   */
  agentsCanPublish: boolean;
  /** Slugs of activated plugins (see src/plugins). */
  activePlugins: string[];
  /** Theme location (e.g. "primary") → menu id. */
  menuLocations: Record<string, number>;
  /** Slug of the active theme (see src/themes). */
  theme: string;
  /** Set once the setup wizard has created a starter site, or was dismissed. */
  setupCompleted: boolean;
};

export const DEFAULT_SETTINGS: SiteSettings = {
  installed: false,
  title: "My Site",
  tagline: "Just another site",
  adminEmail: "",
  usersCanRegister: false,
  defaultRole: "subscriber",
  timezone: "UTC",
  dateFormat: "MMMM d, yyyy",
  postsPerPage: 10,
  permalinkStructure: "postname",
  showOnFront: "posts",
  pageOnFront: null,
  pageForPosts: null,
  defaultCategory: null,
  blogPublic: true,
  aiSearchCrawlers: true,
  aiTrainingCrawlers: true,
  defaultCommentStatus: "open",
  requireNameEmail: true,
  commentRegistration: false,
  commentModeration: false,
  commentPreviouslyApproved: true,
  threadDepth: 5,
  closeCommentsDaysOld: 0,
  aiEnabled: true,
  aiModel: "claude-opus-5-5",
  aiAutoAltText: false,
  chatEnabled: false,
  chatDailyLimit: 300,
  siteAbout: "",
  brandVoice: "",
  aiDisclosure: false,
  inboxEnabled: true,
  inboxLastRun: "",
  shopCurrency: "EUR",
  shopPaymentInstructions: "",
  mcpEnabled: true,
  agentsCanPublish: false,
  activePlugins: [],
  menuLocations: {},
  theme: "classic",
  setupCompleted: false,
};

export const SETTINGS_TAG = "options";

export async function getSettings(): Promise<SiteSettings> {
  "use cache";
  cacheTag(SETTINGS_TAG);
  cacheLife("max");

  const rows = await db.select().from(options);
  const stored = Object.fromEntries(rows.map((r) => [r.name, r.value]));
  return { ...DEFAULT_SETTINGS, ...stored } as SiteSettings;
}

export async function saveSettings(values: Partial<SiteSettings>) {
  const entries = Object.entries(values).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;
  await db.transaction(async (tx) => {
    await tx.delete(options).where(
      inArray(
        options.name,
        entries.map(([k]) => k),
      ),
    );
    // A null setting is stored as no row, so its default (null) applies
    const kept = entries.filter(([, value]) => value !== null);
    if (kept.length)
      await tx
        .insert(options)
        .values(kept.map(([name, value]) => ({ name, value })));
  });
}
