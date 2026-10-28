"use client";

import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  CalendarHeart,
  Check,
  ImageUp,
  LayoutTemplate,
  Palette,
  PenLine,
  Sparkles,
  Store,
  UserRound,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PRESETS } from "@/lib/design";
import { FIELD_TYPE_LABELS } from "@/lib/forms/fields";
import {
  EMPTY_ANSWERS,
  KIND_QUESTIONS,
  SITE_KINDS,
  type SiteAnswers,
  type SiteKind,
  type SitePlan,
} from "@/lib/setup/plan";
import { MediaPicker } from "../_components/media-picker";
import {
  applyPlanAction,
  dismissSetupAction,
  draftPlanAction,
} from "./actions";

type Step = "kind" | "details" | "review" | "done";

const select =
  "h-9 w-full rounded-lg border bg-transparent px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

const KIND_ICONS: Record<SiteKind, typeof Store> = {
  business: Briefcase,
  shop: Store,
  restaurant: UtensilsCrossed,
  freelancer: UserRound,
  portfolio: Palette,
  blog: PenLine,
  organization: Users,
  event: CalendarHeart,
};

const KIND_HINTS: Record<SiteKind, string> = {
  business: "Services, about, contact and opening hours",
  shop: "Products, checkout, shipping and returns",
  restaurant: "Menu, opening hours and table bookings",
  freelancer: "What you offer and a project inquiry form",
  portfolio: "Your work, about you and a way to reach you",
  blog: "Posts first, plus an about page",
  organization: "What you do, news and ways to get involved",
  event: "Date, programme and RSVPs",
};

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
  const [step, setStep] = useState<Step>("kind");
  const [kind, setKind] = useState<SiteKind>("business");
  const [answers, setAnswers] = useState<SiteAnswers>({
    ...EMPTY_ANSWERS,
    title: siteTitle === "My Site" ? "" : siteTitle,
  });
  const [itemsText, setItemsText] = useState("");
  const [description, setDescription] = useState("");
  const [logo, setLogo] = useState<{ id: number; url: string } | null>(null);
  const [picker, setPicker] = useState(false);
  const [plan, setPlan] = useState<SitePlan | null>(null);
  const [aiDrafted, setAiDrafted] = useState(false);
  const [trashSamples, setTrashSamples] = useState(fresh);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ frontPage: number | null } | null>(
    null,
  );
  const [pending, start] = useTransition();
  const questions = KIND_QUESTIONS[kind];
  const set = (patch: Partial<SiteAnswers>) =>
    setAnswers((a) => ({ ...a, ...patch }));

  function draft(mode: "ai" | "template") {
    setError(null);
    start(async () => {
      const r = await draftPlanAction({
        mode,
        kind,
        answers: {
          ...answers,
          items: itemsText.split(/\r?\n/).filter((l) => l.trim()),
        },
        description,
      });
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
      const r = await applyPlanAction(plan, {
        trashSamples,
        aiDrafted,
        logoId: logo?.id ?? null,
      });
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
            Pages, menu
            {plan?.contact_form.include ? ", form" : ""}
            {plan?.products.length ? ", products" : ""} and settings are in
            place, and the site is live. Change anything whenever you like; the
            dashboard has a short list of next steps.
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
            {result?.frontPage && (
              <Link
                href={`/admin/posts/${result.frontPage}`}
                className={buttonVariants({ variant: "outline" })}
              >
                Edit the home page
              </Link>
            )}
            <Link
              href="/admin"
              className={buttonVariants({ variant: "outline" })}
            >
              Go to the dashboard
            </Link>
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

      {step === "kind" && wasSetUp && (
        <p className="rounded-lg border bg-muted/40 p-4 text-sm">
          Your site has been set up before. Running this again adds new pages
          and a new menu next to what's already there.
        </p>
      )}

      {step === "kind" && (
        <div className="grid gap-4">
          <h2 className="font-medium text-lg">What are you building?</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(Object.keys(SITE_KINDS) as SiteKind[]).map((k) => {
              const Icon = KIND_ICONS[k];
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setKind(k);
                    setStep("details");
                  }}
                  className="flex items-start gap-3 rounded-xl border p-4 text-left transition hover:border-foreground/40 hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <Icon className="mt-0.5 size-5 shrink-0" />
                  <span className="grid gap-0.5">
                    <span className="font-medium">{SITE_KINDS[k]}</span>
                    <span className="text-muted-foreground text-xs">
                      {KIND_HINTS[k]}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <form action={dismissSetupAction}>
            <Button
              type="submit"
              variant="link"
              className="h-auto px-0 text-muted-foreground"
            >
              Skip setup, I'll build it myself
            </Button>
          </form>
        </div>
      )}

      {step === "details" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {SITE_KINDS[kind]}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm">
            <p className="text-muted-foreground">
              Answer what you can; everything is optional except the name, and
              you can change it all later.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" id="a-title">
                <Input
                  id="a-title"
                  value={answers.title}
                  required
                  onChange={(e) => set({ title: e.target.value })}
                />
              </Field>
              <Field label={questions.offer} id="a-offer">
                <Input
                  id="a-offer"
                  value={answers.offer}
                  onChange={(e) => set({ offer: e.target.value })}
                />
              </Field>
              {questions.date && (
                <Field label="When" id="a-date">
                  <Input
                    id="a-date"
                    value={answers.date}
                    placeholder="Saturday 12 June 2027, 15:00"
                    onChange={(e) => set({ date: e.target.value })}
                  />
                </Field>
              )}
              {questions.location && (
                <Field label={questions.location} id="a-location">
                  <Input
                    id="a-location"
                    value={answers.location}
                    onChange={(e) => set({ location: e.target.value })}
                  />
                </Field>
              )}
              <Field label="Email for visitors" id="a-email">
                <Input
                  id="a-email"
                  type="email"
                  value={answers.email}
                  onChange={(e) => set({ email: e.target.value })}
                />
              </Field>
              {questions.phone && (
                <Field label="Phone" id="a-phone">
                  <Input
                    id="a-phone"
                    type="tel"
                    value={answers.phone}
                    onChange={(e) => set({ phone: e.target.value })}
                  />
                </Field>
              )}
            </div>
            {questions.hours && (
              <Field label="Opening hours, one line each" id="a-hours">
                <Textarea
                  id="a-hours"
                  rows={3}
                  value={answers.hours}
                  placeholder={"Mon–Fri 8:00–18:00\nSat 9:00–14:00"}
                  onChange={(e) => set({ hours: e.target.value })}
                />
              </Field>
            )}
            {questions.items && (
              <Field label={questions.items} id="a-items">
                <Textarea
                  id="a-items"
                  rows={4}
                  value={itemsText}
                  onChange={(e) => setItemsText(e.target.value)}
                />
              </Field>
            )}
            <Field label="A few words about you (optional)" id="a-about">
              <Textarea
                id="a-about"
                rows={3}
                value={answers.about}
                onChange={(e) => set({ about: e.target.value })}
              />
            </Field>
            <div className="grid gap-1.5">
              <span className="font-medium">Logo (optional)</span>
              <div className="flex items-center gap-3">
                {logo && (
                  // biome-ignore lint/performance/noImgElement: the owner's own upload
                  <img
                    src={logo.url}
                    alt=""
                    className="h-12 max-w-40 rounded border object-contain"
                  />
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPicker(true)}
                >
                  <ImageUp /> {logo ? "Change" : "Upload a logo"}
                </Button>
                {logo && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setLogo(null)}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
            {ai && (
              <Field
                label="Anything else Claude should know? (optional)"
                id="a-description"
              >
                <Textarea
                  id="a-description"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Who your customers are, what makes you different, what visitors should do."
                />
              </Field>
            )}
            <div className="flex flex-wrap gap-2 border-t pt-4">
              {ai ? (
                <>
                  <Button
                    disabled={pending || !answers.title.trim()}
                    onClick={() => draft("ai")}
                  >
                    <Sparkles />{" "}
                    {pending ? "Writing your site…" : "Write my site with AI"}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={pending || !answers.title.trim()}
                    onClick={() => draft("template")}
                  >
                    <LayoutTemplate /> Use the standard text
                  </Button>
                </>
              ) : (
                <Button
                  disabled={pending || !answers.title.trim()}
                  onClick={() => draft("template")}
                >
                  <ArrowRight /> {pending ? "Preparing…" : "Preview my site"}
                </Button>
              )}
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => setStep("kind")}
              >
                <ArrowLeft /> Back
              </Button>
            </div>
          </CardContent>
          <MediaPicker
            open={picker}
            onOpenChange={setPicker}
            title="Your logo"
            onSelect={(item) => {
              setLogo({ id: item.id, url: item.url });
              setPicker(false);
            }}
          />
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
                    <option value="studio">Studio (your own design)</option>
                    <option value="nord">Nord (modern cards)</option>
                    <option value="classic">Classic (simple reading)</option>
                  </select>
                </div>
                {plan.theme === "studio" && (
                  <div className="grid gap-1.5">
                    <Label htmlFor="plan-style">Style</Label>
                    <select
                      id="plan-style"
                      className={select}
                      value={plan.style}
                      onChange={(e) => update({ style: e.target.value })}
                    >
                      {Object.entries(PRESETS).map(([key, p]) => (
                        <option key={key} value={key}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
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

          {plan.products.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Products ({plan.products.length})</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm">
                <p className="text-muted-foreground">
                  Products with a price go on sale right away; the others wait
                  as drafts until you add one. Add photos under Shop.
                </p>
                <ul className="grid gap-1">
                  {plan.products.map((p, i) => (
                    <li
                      key={`${p.name}:${p.price}`}
                      className="flex items-center gap-2 rounded-lg border px-3 py-2"
                    >
                      <span className="font-medium">{p.name}</span>
                      <span className="text-muted-foreground">
                        {p.price || "no price yet"}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="ml-auto text-destructive"
                        onClick={() =>
                          update({
                            products: plan.products.filter((_, j) => j !== i),
                          })
                        }
                      >
                        Leave out
                      </Button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

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
              onClick={() => setStep("details")}
            >
              <ArrowLeft /> Back
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

function Field({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
