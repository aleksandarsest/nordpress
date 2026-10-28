import { JsonLd } from "@/components/json-ld";
import { aiProvenance } from "@/lib/ai-provenance";
import { pathsOf } from "@/lib/ai-readable";
import { getPublicForm } from "@/lib/forms";
import { splitFormEmbeds } from "@/lib/forms/embed";
import { languageName, translationLang } from "@/lib/i18n";
import { responsiveContent } from "@/lib/images";
import { hasMemberAccess } from "@/lib/members";
import { isMembersOnly, teaser } from "@/lib/members/access";
import { getSettings } from "@/lib/options";
import { applyFilters } from "@/lib/plugins";
import { getViewer } from "@/lib/session";
import { postJsonLd } from "@/lib/structured-data";
import { activeTheme, getThemeOptions } from "@/lib/themes";
import type { SinglePost } from "@/lib/themes/types";
import { getTranslations } from "@/lib/translations";
import { NewsletterSignup } from "../newsletter/signup-form";
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
  // Members-only content is checked per visitor; previews are for staff
  const locked =
    !preview &&
    isMembersOnly(post.meta) &&
    !(await hasMemberAccess(await getViewer()));
  const showComments =
    !locked &&
    !preview &&
    (post.type === "post" || post.commentStatus === "open");
  const paths = preview ? null : await pathsOf(post, site);
  return (
    <>
      {paths && (
        <JsonLd data={postJsonLd(post, site, paths.html, paths.markdown)} />
      )}
      <div lang={translationLang(post.meta) ?? undefined} className="contents">
        <Single
          post={post}
          site={site}
          options={options}
          isFront={isFront}
          preview={preview}
          body={
            <>
              {!preview && site.languages.length > 0 && (
                <LanguageSwitcher post={post} />
              )}
              {site.aiDisclosure && aiProvenance(post.meta) && (
                <p className="not-prose mb-6 text-muted-foreground text-xs">
                  This {post.type === "page" ? "page" : "post"} was written with
                  AI assistance.
                </p>
              )}
              {locked ? (
                <MembersGate post={post} />
              ) : (
                <PostBody post={post} preview={preview} />
              )}
              {!preview &&
                post.type === "post" &&
                site.newsletterEnabled &&
                site.newsletterSignupAfterPosts && (
                  <NewsletterSignup
                    title={`Get new posts from ${site.title}`}
                    description="By email, when they're published. Unsubscribe anytime."
                    compact
                  />
                )}
            </>
          }
          comments={
            showComments ? <Comments post={post} settings={site} /> : null
          }
        />
      </div>
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

// What non-members see of a members-only post: the teaser and a way in.
async function MembersGate({ post }: { post: SinglePost }) {
  const viewer = await getViewer();
  return (
    <div className="grid gap-6">
      <p className="text-lg">{teaser(post)}</p>
      <div className="not-prose grid gap-3 rounded-xl border bg-muted/40 p-6 text-sm">
        <p className="font-semibold text-base">
          This {post.type === "page" ? "page" : "post"} is for members
        </p>
        <p className="text-muted-foreground">
          Become a member to read the rest
          {viewer ? "." : ", or log in if you already are."}
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            href="/members"
            className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground"
          >
            See memberships
          </a>
          {!viewer && (
            <a
              href="/login"
              className="rounded-lg border px-4 py-2 font-medium"
            >
              Log in
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// "Also in: Deutsch · Français" for posts with published translations.
async function LanguageSwitcher({ post }: { post: SinglePost }) {
  const others = (await getTranslations(post)).filter(
    (t) => t.path && t.id !== post.id,
  );
  if (others.length === 0) return null;
  return (
    <nav aria-label="Languages" className="not-prose mb-6 text-sm">
      <span className="text-muted-foreground">Also in: </span>
      {others.map((t, i) => (
        <span key={t.id}>
          {i > 0 && " · "}
          <a
            href={t.path ?? "#"}
            hrefLang={t.lang}
            lang={t.lang}
            className="underline"
          >
            {languageName(t.lang)}
          </a>
        </span>
      ))}
    </nav>
  );
}
