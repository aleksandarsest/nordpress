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
  /** Slugs of activated plugins (see src/plugins). */
  activePlugins: string[];
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
  activePlugins: [],
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
    await tx
      .insert(options)
      .values(entries.map(([name, value]) => ({ name, value })));
  });
}
