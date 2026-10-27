import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSettings } from "@/lib/options";
import { getPageTree } from "@/lib/posts";
import { requireViewer } from "@/lib/session";
import { saveReadingAction } from "../actions";

export const metadata: Metadata = { title: "Reading Settings" };

export default async function ReadingSettingsPage() {
  await requireViewer("manage_options");
  const [s, pages] = await Promise.all([getSettings(), getPageTree()]);

  return (
    <>
      <h1 className="mb-6 font-semibold text-2xl tracking-tight">
        Reading Settings
      </h1>
      <ActionForm
        action={saveReadingAction}
        className="grid max-w-xl gap-5 text-sm"
      >
        <fieldset className="grid gap-3">
          <legend className="mb-2 font-medium">Your homepage displays</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="show_on_front"
              value="posts"
              defaultChecked={s.showOnFront === "posts"}
            />{" "}
            Your latest posts
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="show_on_front"
              value="page"
              defaultChecked={s.showOnFront === "page"}
            />{" "}
            A static page (select below)
          </label>
          <div className="ml-6 grid gap-3">
            <PageSelect
              name="page_on_front"
              label="Homepage"
              value={s.pageOnFront}
              pages={pages}
            />
            <PageSelect
              name="page_for_posts"
              label="Posts page"
              value={s.pageForPosts}
              pages={pages}
            />
          </div>
        </fieldset>
        <div className="grid gap-2">
          <Label htmlFor="posts_per_page">Blog pages show at most</Label>
          <div className="flex items-center gap-2">
            <Input
              id="posts_per_page"
              name="posts_per_page"
              type="number"
              min={1}
              max={100}
              defaultValue={s.postsPerPage}
              className="w-24"
            />{" "}
            posts
          </div>
        </div>
        <Label className="font-normal">
          <Checkbox name="blog_public" defaultChecked={!s.blogPublic} />{" "}
          Discourage search engines from indexing this site
        </Label>
        <fieldset className="grid gap-2">
          <legend className="mb-1 font-medium text-sm">AI crawlers</legend>
          <Label className="items-start font-normal">
            <Checkbox name="ai_search" defaultChecked={s.aiSearchCrawlers} />
            <span>
              Allow AI search and assistants
              <span className="block text-muted-foreground text-xs">
                ChatGPT search, Claude, Perplexity and similar tools can read
                and cite your pages when answering people.
              </span>
            </span>
          </Label>
          <Label className="items-start font-normal">
            <Checkbox
              name="ai_training"
              defaultChecked={s.aiTrainingCrawlers}
            />
            <span>
              Allow AI training
              <span className="block text-muted-foreground text-xs">
                Crawlers such as GPTBot, ClaudeBot, Google-Extended and Common
                Crawl may collect your content to train models. Published in
                robots.txt, which well-behaved crawlers follow.
              </span>
            </span>
          </Label>
        </fieldset>
        <div>
          <SubmitButton>Save Changes</SubmitButton>
        </div>
      </ActionForm>
    </>
  );
}

function PageSelect({
  name,
  label,
  value,
  pages,
}: {
  name: string;
  label: string;
  value: number | null;
  pages: { id: number; title: string; path: string }[];
}) {
  return (
    <label className="grid gap-1.5">
      <span>{label}</span>
      <select
        name={name}
        defaultValue={value ?? ""}
        className="h-8 rounded-lg border bg-transparent px-2"
      >
        <option value="">— Select —</option>
        {pages.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title || p.path}
          </option>
        ))}
      </select>
    </label>
  );
}
