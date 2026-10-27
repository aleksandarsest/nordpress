import { describe, expect, it } from "vitest";
import { canOnPost, hasCap } from "./capabilities";

const admin = { id: "a", role: "administrator" } as const;
const editor = { id: "e", role: "editor" } as const;
const author = { id: "u", role: "author" } as const;
const contributor = { id: "c", role: "contributor" } as const;

describe("hasCap", () => {
  it("gives administrators every capability", () => {
    expect(hasCap(admin, "manage_options")).toBe(true);
  });

  it("keeps site settings away from editors", () => {
    expect(hasCap(editor, "manage_options")).toBe(false);
    expect(hasCap(editor, "manage_categories")).toBe(true);
  });

  it("lets editors but not authors moderate comments", () => {
    expect(hasCap(editor, "moderate_comments")).toBe(true);
    expect(hasCap(author, "moderate_comments")).toBe(false);
  });
});

describe("canOnPost", () => {
  const ownDraft = { type: "post", status: "draft", authorId: "c" } as const;
  const ownPublished = {
    type: "post",
    status: "publish",
    authorId: "c",
  } as const;
  const othersPost = { type: "post", status: "draft", authorId: "x" } as const;
  const page = { type: "page", status: "draft", authorId: "u" } as const;

  it("lets contributors edit their own drafts but not publish", () => {
    expect(canOnPost(contributor, "edit", ownDraft)).toBe(true);
    expect(canOnPost(contributor, "publish", ownDraft)).toBe(false);
  });

  it("locks contributors out of their posts once published", () => {
    expect(canOnPost(contributor, "edit", ownPublished)).toBe(false);
  });

  it("restricts authors to their own posts", () => {
    expect(canOnPost(author, "edit", othersPost)).toBe(false);
    expect(canOnPost(author, "publish", ownDraft)).toBe(true);
  });

  it("only lets editors and above manage pages", () => {
    expect(canOnPost(author, "edit", page)).toBe(false);
    expect(canOnPost(editor, "edit", page)).toBe(true);
    expect(canOnPost(editor, "delete", othersPost)).toBe(true);
  });
});
