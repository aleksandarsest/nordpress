import { JsonLd } from "@/components/json-ld";
import { aiProvenance } from "@/lib/ai-provenance";
import { pathsOf } from "@/lib/ai-readable";
import { getPublicForm } from "@/lib/forms";
import { splitFormEmbeds } from "@/lib/forms/embed";
import { responsiveContent } from "@/lib/images";
import { getSettings } from "@/lib/options";
import { applyFilters } from "@/lib/plugins";
import { postJsonLd } from "@/lib/structured-data";
import { activeTheme, getThemeOptions } from "@/lib/themes";
import type { SinglePost } from "@/lib/themes/types";
import { Comments } from "./comments";
import { SiteForm } from "./site-form";

export type { SinglePost };

// Core side of a single post or page: prepares the body (plugin filters,
// responsive images) and comments, then hands everything to the theme.
export async function SingleView({
  post,
  isFront = false,
  preview = false,
}: {
  post: SinglePost;
  isFront?: boolean;
  preview?: boolean;
}) {
  const [theme, site] = await Promise.all([activeTheme(), getSettings()]);
  const options = await getThemeOptions(theme.slug);
  const { Single } = theme.components;
  const showComments =
    !preview && (post.type === "post" || post.commentStatus === "open");
  const paths = preview ? null : await pathsOf(post, site);
  return (
    <>
      {paths && (
        <JsonLd data={postJsonLd(post, site, paths.html, paths.markdown)} />
      )}
      <Single
        post={post}
        site={site}
        options={options}
        isFront={isFront}
        preview={preview}
        body={
          <>
            {site.aiDisclosure && aiProvenance(post.meta) && (
              <p className="not-prose mb-6 text-muted-foreground text-xs">
                This {post.type === "page" ? "page" : "post"} was written with
                AI assistance.
              </p>
            )}
            <PostBody post={post} preview={preview} />
          </>
        }
        comments={
          showComments ? <Comments post={post} settings={site} /> : null
        }
      />
    </>
  );
}

async function PostBody({
  post,
  preview,
}: {
  post: SinglePost;
  preview: boolean;
}) {
  const html = await applyFilters(
    "post.contentHtml",
    await responsiveContent(post.contentHtml),
    { post },
  );
  return (
    <div className="prose prose-neutral dark:prose-invert max-w-none">
      {splitFormEmbeds(html).map((part) =>
        "html" in part ? (
          <div
            key={part.at}
            className="contents"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: core renders it from a schema-validated Tiptap document; plugins are trusted, compiled-in code
            dangerouslySetInnerHTML={{ __html: part.html }}
          />
        ) : (
          <FormBlock
            key={part.at}
            formId={part.formId}
            postId={preview ? null : post.id}
          />
        ),
      )}
    </div>
  );
}

async function FormBlock({
  formId,
  postId,
}: {
  formId: number;
  postId: number | null;
}) {
  const form = await getPublicForm(formId);
  if (!form) return null;
  if (!form.settings.open)
    return (
      <p className="not-prose my-8 rounded-xl border p-6 text-muted-foreground text-sm">
        This form is no longer accepting responses.
      </p>
    );
  return <SiteForm form={form} postId={postId} />;
}
