import "server-only";
import { db } from "@/db";
import { posts, postTerms, user } from "@/db/schema";
import { createUserWithPassword } from "./auth";
import { renderContent } from "./content";
import { saveSettings } from "./options";
import { createTerm } from "./terms";

export type InstallInput = {
  title: string;
  name: string;
  email: string;
  password: string;
  blogPublic: boolean;
};

export async function isInstalled() {
  return (await db.$count(user)) > 0;
}

export async function installSite(input: InstallInput) {
  if (await isInstalled()) throw new Error("This site is already installed.");

  const admin = await createUserWithPassword({
    name: input.name,
    email: input.email,
    password: input.password,
    role: "administrator",
  });

  const uncategorized = await createTerm("category", { name: "Uncategorized" });

  const helloDoc = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Welcome to your new site. This is your first post. Edit or delete it, then start writing!",
          },
        ],
      },
    ],
  };
  const sampleDoc = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "This is an example page. Unlike posts, pages stay in one place and show up in your site navigation. Most people start with an About page.",
          },
        ],
      },
    ],
  };

  const now = new Date();
  const [hello] = await db
    .insert(posts)
    .values([
      {
        type: "post",
        status: "publish",
        title: "Hello world!",
        slug: "hello-world",
        content: helloDoc,
        contentHtml: renderContent(helloDoc).html,
        contentText: renderContent(helloDoc).text,
        authorId: admin.id,
        publishedAt: now,
      },
      {
        type: "page",
        status: "publish",
        title: "Sample Page",
        slug: "sample-page",
        content: sampleDoc,
        contentHtml: renderContent(sampleDoc).html,
        contentText: renderContent(sampleDoc).text,
        authorId: admin.id,
        publishedAt: now,
      },
    ])
    .returning();
  await db
    .insert(postTerms)
    .values({ postId: hello.id, termId: uncategorized.id });

  await saveSettings({
    installed: true,
    title: input.title,
    adminEmail: input.email.toLowerCase(),
    blogPublic: input.blogPublic,
    defaultCategory: uncategorized.id,
  });
}
