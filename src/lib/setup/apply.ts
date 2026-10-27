import "server-only";
import { and, inArray } from "drizzle-orm";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { htmlToDoc } from "../content";
import { createForm, deleteForm } from "../forms";
import { DEFAULT_FORM_SETTINGS } from "../forms/fields";
import { markdownToHtml } from "../markdown";
import {
  addMenuItems,
  createMenu,
  deleteMenu,
  setMenuLocations,
} from "../menus";
import { getSettings, saveSettings } from "../options";
import {
  deletePostPermanently,
  restorePost,
  savePost,
  trashPost,
} from "../posts";
import type { Viewer } from "../session";
import { getThemeOptions, saveThemeOptions } from "../themes";
import type { SitePlan } from "./plan";

const SAMPLE_SLUGS = ["hello-world", "sample-page"];

// Creates an approved starter site. Adds to what's there; it never deletes
// existing content, only moves the sample post and page to the trash when
// asked. If any step fails, everything it made is removed again.
export async function applySitePlan(
  viewer: Viewer,
  plan: SitePlan,
  options: { trashSamples: boolean },
) {
  const settings = await getSettings();
  const nordOptions = await getThemeOptions("nord");
  const doc = (markdown: string) => htmlToDoc(markdownToHtml(markdown));
  // Everything made so far, so a failure part-way leaves the site as it was
  const made = {
    posts: [] as number[],
    trashed: [] as number[],
    form: null as number | null,
    menu: null as number | null,
  };

  try {
    if (options.trashSamples) {
      const samples = await db
        .select({ id: posts.id })
        .from(posts)
        .where(
          and(
            inArray(posts.slug, SAMPLE_SLUGS),
            inArray(posts.status, ["publish", "draft"]),
          ),
        );
      for (const { id } of samples) {
        await trashPost(viewer, id);
        made.trashed.push(id);
      }
    }

    // The contact form first, so the contact page can embed it
    if (plan.contact_form.include && plan.contact_form.fields.length) {
      const form = await createForm({
        title: "Contact",
        fields: plan.contact_form.fields.map((f) => ({
          ...f,
          options: f.options.length ? f.options : undefined,
        })),
        settings: DEFAULT_FORM_SETTINGS,
      });
      made.form = form.id;
    }

    const created: {
      id: number;
      role: string;
      inMenu: boolean;
    }[] = [];
    for (const page of plan.pages) {
      const content = doc(page.content);
      if (page.role === "contact" && made.form)
        content.content = [
          ...(content.content ?? []),
          { type: "formEmbed", attrs: { formId: made.form, title: "Contact" } },
        ];
      const saved = await savePost(viewer, {
        type: "page",
        intent: "publish",
        title: page.title,
        content,
        commentStatus: "closed",
      });
      made.posts.push(saved.id);
      created.push({ id: saved.id, role: page.role, inMenu: page.in_menu });
    }

    for (const post of plan.posts) {
      const saved = await savePost(viewer, {
        type: "post",
        intent: "publish",
        title: post.title,
        excerpt: post.excerpt,
        content: doc(post.content),
        commentStatus: settings.defaultCommentStatus,
        categoryIds: settings.defaultCategory ? [settings.defaultCategory] : [],
      });
      made.posts.push(saved.id);
    }

    // A static home page needs somewhere for posts to live
    const home =
      plan.homepage === "page"
        ? created.find((p) => p.role === "home")
        : undefined;
    let blogPage: number | null = null;
    if (home && plan.posts.length) {
      const blog = await savePost(viewer, {
        type: "page",
        intent: "publish",
        title: "Blog",
        content: null,
        commentStatus: "closed",
      });
      made.posts.push(blog.id);
      blogPage = blog.id;
      created.push({ id: blog.id, role: "blog", inMenu: true });
    }

    // Home first, then the rest in plan order, the contact page last
    const menuPages = created
      .filter((p) => p.inMenu)
      .sort((a, b) => rank(a.role) - rank(b.role));
    if (menuPages.length) {
      const menu = await createMenu("Main menu");
      made.menu = menu.id;
      await addMenuItems(
        menu.id,
        menuPages.map((p) => ({ type: "post" as const, objectId: p.id })),
      );
      await setMenuLocations(menu.id, ["primary"]);
    }

    if (plan.theme === "nord")
      await saveThemeOptions("nord", { ...nordOptions, accent: plan.accent });
    // Settings last, in one transaction
    await saveSettings({
      title: plan.title.trim() || settings.title,
      tagline: plan.tagline.trim(),
      siteAbout: plan.site_about.trim(),
      brandVoice: plan.brand_voice.trim(),
      theme: plan.theme,
      showOnFront: home ? "page" : "posts",
      pageOnFront: home ? home.id : null,
      pageForPosts: blogPage,
      setupCompleted: true,
    });

    return {
      pages: created.length,
      posts: plan.posts.length,
      formId: made.form,
      menuId: made.menu,
      frontPage: home?.id ?? null,
    };
  } catch (error) {
    // Undo in reverse; each step on its own so one failure doesn't stop the rest
    const undo = async (fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (e) {
        console.error("[setup] rollback step failed", e);
      }
    };
    await undo(() => saveThemeOptions("nord", nordOptions));
    if (made.menu) {
      const menu = made.menu;
      await undo(() => deleteMenu(menu));
      await undo(() => saveSettings({ menuLocations: settings.menuLocations }));
    }
    for (const id of made.posts.reverse())
      await undo(() => deletePostPermanently(viewer, id));
    if (made.form) {
      const form = made.form;
      await undo(() => deleteForm(form));
    }
    for (const id of made.trashed) await undo(() => restorePost(viewer, id));
    throw error;
  }
}

function rank(role: string) {
  return role === "home" ? 0 : role === "contact" ? 3 : role === "blog" ? 2 : 1;
}

/** Whether the site still has only the content a fresh install creates. */
export async function hasOnlySampleContent() {
  const rows = await db
    .select({ slug: posts.slug })
    .from(posts)
    .where(
      inArray(posts.status, [
        "publish",
        "draft",
        "pending",
        "future",
        "private",
      ]),
    );
  return rows.every((r) => SAMPLE_SLUGS.includes(r.slug));
}
