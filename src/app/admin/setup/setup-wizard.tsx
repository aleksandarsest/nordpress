"use client";

import { ArrowLeft, Check, LayoutTemplate, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FIELD_TYPE_LABELS } from "@/lib/forms/fields";
import { SITE_KINDS, type SiteKind, type SitePlan } from "@/lib/setup/plan";
import {
  applyPlanAction,
  dismissSetupAction,
  draftPlanAction,
} from "./actions";

type Step = "describe" | "review" | "done";

const select =
  "h-9 w-full rounded-lg border bg-transparent px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export function SetupWizard({
  siteTitle,
  ai,
  fresh,
  setUpBefore,
}: {
  siteTitle: string;
  ai: boolean;
  fresh: boolean;
  setUpBefore: boolean;
}) {
  // Read once: finishing setup flips the setting while this page is open
  const [wasSetUp] = useState(setUpBefore);
  const [step, setStep] = useState<Step>("describe");
  const [title, setTitle] = useState(siteTitle);
  const [kind, setKind] = useState<SiteKind>("business");
  const [description, setDescription] = useState("");
  const [plan, setPlan] = useState<SitePlan | null>(null);
  const [aiDrafted, setAiDrafted] = useState(false);
  const [trashSamples, setTrashSamples] = useState(fresh);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ frontPage: number | null } | null>(
    null,
  );
  const [pending, start] = useTransition();

  function draft(mode: "ai" | "template") {
    setError(null);
    start(async () => {
      const r = await draftPlanAction({ mode, kind, title, description });
      if (r.error || !r.plan) {
        setError(r.error ?? "Couldn't draft the site.");
        return;
      }
      setPlan(r.plan);
      setAiDrafted(mode === "ai");
      setStep("review");
    });
  }

  function apply() {
    if (!plan) return;
    setError(null);
    start(async () => {
      const r = await applyPlanAction(plan, { trashSamples, aiDrafted });
      if (r.error || !r.result) {
        setError(r.error ?? "Couldn't create the site.");
        return;
      }
      setResult(r.result);
      setStep("done");
    });
  }

  const update = (patch: Partial<SitePlan>) =>
    setPlan((p) => (p ? { ...p, ...patch } : p));

  if (step === "done")
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Check className="size-5 text-emerald-600" /> Your site is ready
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
          <p>
            Pages, menu{plan?.contact_form.include ? ", contact form" : ""} and
            settings are in place. Look for text in [square brackets] and
            replace it with your own details.
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              className={buttonVariants()}
            >
              View your site
            </a>
            <Link
              href="/admin/pages"
              className={buttonVariants({ variant: "outline" })}
            >
              Edit pages
            </Link>
            {result?.frontPage && (
              <Link
                href={`/admin/posts/${result.frontPage}`}
                className={buttonVariants({ variant: "outline" })}
              >
                Edit the home page
              </Link>
            )}
            {ai && (
              <Link
                href="/admin/assistant"
                className={buttonVariants({ variant: "outline" })}
              >
                Ask the assistant to fill in the blanks
              </Link>
            )}
          </div>
        </CardContent>
      </Card>
    );

  return (
    <div className="grid gap-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {step === "describe" && wasSetUp && (
        <p className="rounded-lg border bg-muted/40 p-4 text-sm">
          Your site has been set up before. Running this again adds new pages
          and a new menu next to what's already there.
        </p>
      )}

      {step === "describe" && (
        <Card>
          <CardContent className="grid gap-4 pt-6 text-sm">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="setup-title">Site name</Label>
                <Input
                  id="setup-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="setup-kind">Kind of site</Label>
                <select
                  id="setup-kind"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as SiteKind)}
                  className={select}
                >
                  {Object.entries(SITE_KINDS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {ai ? (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="setup-description">
                    Describe it in your own words
                  </Label>
                  <Textarea
                    id="setup-description"
                    rows={5}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="We're a small bakery in Ljubljana run by two sisters. We bake sourdough and pastries every morning and run weekend baking classes for beginners. Customers are mostly locals and tourists; we want people to find our hours and book classes."
                  />
                  <span className="text-muted-foreground text-xs">
                    What you offer, who it's for, what visitors should do.
                    Claude won't invent prices, addresses or reviews; it leaves
                    [placeholders] for those.
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={pending || description.trim().length < 15}
                    onClick={() => draft("ai")}
                  >
                    <Sparkles />{" "}
                    {pending ? "Drafting your site…" : "Draft my site"}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={() => draft("template")}
                  >
                    <LayoutTemplate /> Use a template instead
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-muted-foreground">
                  Add ANTHROPIC_API_KEY to draft a site from a description. For
                  now, start from a template with placeholder text to fill in.
                </p>
                <div>
                  <Button disabled={pending} onClick={() => draft("template")}>
                    <LayoutTemplate />{" "}
                    {pending ? "Preparing…" : "Preview the template"}
                  </Button>
                </div>
              </>
            )}
            <form action={dismissSetupAction} className="border-t pt-4">
              <Button
                type="submit"
                variant="link"
                className="h-auto px-0 text-muted-foreground"
              >
                Skip setup, I'll build it myself
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {step === "review" && plan && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Identity</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="plan-title">Site name</Label>
                  <Input
                    id="plan-title"
                    value={plan.title}
                    onChange={(e) => update({ title: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="plan-tagline">Tagline</Label>
                  <Input
                    id="plan-tagline"
                    value={plan.tagline}
                    onChange={(e) => update({ tagline: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="plan-about">
                  About the site (for the AI features)
                </Label>
                <Textarea
                  id="plan-about"
                  rows={2}
                  value={plan.site_about}
                  onChange={(e) => update({ site_about: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="plan-voice">Voice and style guide</Label>
                <Textarea
                  id="plan-voice"
                  rows={3}
                  value={plan.brand_voice}
                  onChange={(e) => update({ brand_voice: e.target.value })}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="plan-theme">Theme</Label>
                  <select
                    id="plan-theme"
                    className={select}
                    value={plan.theme}
                    onChange={(e) =>
                      update({ theme: e.target.value as SitePlan["theme"] })
                    }
                  >
                    <option value="nord">Nord (modern cards)</option>
                    <option value="classic">Classic (simple reading)</option>
                  </select>
                </div>
                {plan.theme === "nord" && (
                  <div className="grid gap-1.5">
                    <Label htmlFor="plan-accent">Accent color</Label>
                    <select
                      id="plan-accent"
                      className={select}
                      value={plan.accent}
                      onChange={(e) =>
                        update({ accent: e.target.value as SitePlan["accent"] })
                      }
                    >
                      {["frost", "green", "purple", "orange", "red"].map(
                        (a) => (
                          <option key={a} value={a}>
                            {a[0].toUpperCase() + a.slice(1)}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                )}
                <div className="grid gap-1.5">
                  <Label htmlFor="plan-home">Front page shows</Label>
                  <select
                    id="plan-home"
                    className={select}
                    value={plan.homepage}
                    onChange={(e) =>
                      update({
                        homepage: e.target.value as SitePlan["homepage"],
                      })
                    }
                  >
                    <option
                      value="page"
                      disabled={!plan.pages.some((p) => p.role === "home")}
                    >
                      The home page
                    </option>
                    <option value="posts">The latest posts</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                Pages ({plan.pages.length})
                {plan.posts.length > 0 && ` and posts (${plan.posts.length})`}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              {plan.pages.map((page, i) => (
                <ContentItem
                  key={`page:${page.role}:${page.title}:${page.content.length}`}
                  label={page.role === "home" ? "Home page" : "Page"}
                  title={page.title}
                  content={page.content}
                  note={page.in_menu ? "In the menu" : undefined}
                  onRemove={() =>
                    update({ pages: plan.pages.filter((_, j) => j !== i) })
                  }
                />
              ))}
              {plan.posts.map((post, i) => (
                <ContentItem
                  key={`post:${post.title}:${post.content.length}`}
                  label="Post"
                  title={post.title}
                  content={post.content}
                  onRemove={() =>
                    update({ posts: plan.posts.filter((_, j) => j !== i) })
                  }
                />
              ))}
            </CardContent>
          </Card>

          {plan.contact_form.fields.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Contact form</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm">
                <Label className="font-normal">
                  <Checkbox
                    checked={plan.contact_form.include}
                    onCheckedChange={(c) =>
                      update({
                        contact_form: {
                          ...plan.contact_form,
                          include: c === true,
                        },
                      })
                    }
                  />
                  Add a contact form
                  {plan.pages.some((p) => p.role === "contact")
                    ? " to the Contact page"
                    : ""}
                </Label>
                <ul className="ml-6 grid gap-1 text-muted-foreground">
                  {plan.contact_form.fields.map((f) => (
                    <li key={f.label}>
                      {f.label} · {FIELD_TYPE_LABELS[f.type]}
                      {f.required && " · required"}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Label className="font-normal text-sm">
            <Checkbox
              checked={trashSamples}
              onCheckedChange={(c) => setTrashSamples(c === true)}
            />
            Move the sample post and page (“Hello world!”, “Sample Page”) to the
            trash
          </Label>

          <div className="flex flex-wrap gap-2">
            <Button
              disabled={pending || (!plan.pages.length && !plan.posts.length)}
              onClick={apply}
            >
              <Check /> {pending ? "Creating your site…" : "Create my site"}
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setStep("describe")}
            >
              <ArrowLeft /> Start over
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function ContentItem({
  label,
  title,
  content,
  note,
  onRemove,
}: {
  label: string;
  title: string;
  content: string;
  note?: string;
  onRemove: () => void;
}) {
  return (
    <details className="rounded-lg border p-3">
      <summary className="flex cursor-pointer flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-xs uppercase tracking-wide">
          {label}
        </span>
        <span className="font-medium">{title}</span>
        {note && (
          <span className="text-muted-foreground text-xs">· {note}</span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="ml-auto text-destructive"
          onClick={(e) => {
            e.preventDefault();
            onRemove();
          }}
        >
          Leave out
        </Button>
      </summary>
      <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words font-sans text-muted-foreground text-xs leading-relaxed">
        {content}
      </pre>
    </details>
  );
}
