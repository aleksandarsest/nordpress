import { CircleAlert, CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { aiConfigured } from "@/lib/ai/client";
import { embeddingsConfigured, indexStatus } from "@/lib/ai/embeddings";
import { FEATURE_LABELS, usageSummary } from "@/lib/ai/usage";
import { AI_MODELS, type AiModel, getSettings } from "@/lib/options";
import { requireViewer } from "@/lib/session";
import { rebuildIndexAction, saveAiAction } from "../actions";

export const metadata: Metadata = { title: "AI Settings" };

const tokens = (n: number | null) =>
  new Intl.NumberFormat("en", { notation: "compact" }).format(n ?? 0);

export default async function AiSettingsPage() {
  await requireViewer("manage_options");
  const [s, usage, index] = await Promise.all([
    getSettings(),
    usageSummary(30),
    indexStatus(),
  ]);
  const voyage = embeddingsConfigured();
  const configured = aiConfigured();
  const totalCost = usage.reduce((sum, r) => sum + (r.cost ?? 0), 0);

  return (
    <>
      <h1 className="mb-6 font-semibold text-2xl tracking-tight">
        AI Settings
      </h1>

      <Alert
        className="mb-6 max-w-2xl"
        variant={configured ? "default" : "destructive"}
      >
        {configured ? <CircleCheck /> : <CircleAlert />}
        <AlertDescription>
          {configured ? (
            "An API key is configured. AI tools appear in the editor and the media library; failed requests show up in the usage table below."
          ) : (
            <>
              AI features need an Anthropic API key. Set{" "}
              <code>ANTHROPIC_API_KEY</code> in the server environment (for
              local development, in <code>.env.local</code>) and restart the
              server.
            </>
          )}
        </AlertDescription>
      </Alert>

      <ActionForm
        action={saveAiAction}
        className="grid max-w-2xl gap-6 text-sm"
      >
        <Label className="font-normal">
          <Checkbox name="ai_enabled" defaultChecked={s.aiEnabled} /> Enable AI
          writing tools for everyone who can write posts
        </Label>
        <div className="grid gap-2">
          <Label htmlFor="ai_model">Model</Label>
          <select
            id="ai_model"
            name="ai_model"
            defaultValue={s.aiModel}
            className="h-8 max-w-sm rounded-lg border bg-transparent px-2"
          >
            {(Object.keys(AI_MODELS) as AiModel[]).map((m) => (
              <option key={m} value={m}>
                {AI_MODELS[m]}
              </option>
            ))}
          </select>
        </div>
        <Label className="font-normal">
          <Checkbox name="ai_auto_alt_text" defaultChecked={s.aiAutoAltText} />{" "}
          Write alt text automatically for new image uploads
        </Label>
        <p className="-mt-4 ml-6 text-muted-foreground text-xs">
          Runs in the background after each upload. Authors can always review
          and edit it in the media library.
        </p>
        <p className="text-muted-foreground text-xs">
          Post content and images are sent to Anthropic for processing only when
          someone uses an AI feature (or uploads an image, if automatic alt text
          is on).
        </p>
        <fieldset className="grid gap-3 border-t pt-6">
          <legend className="mb-2 font-semibold text-base">Brand voice</legend>
          <p className="text-muted-foreground text-xs">
            Every AI feature that writes for the site follows these: the writing
            assistant, suggestions, form drafts, the site chat and the admin
            assistant.
          </p>
          <div className="grid gap-1.5">
            <Label htmlFor="site_about">About the site</Label>
            <Textarea
              id="site_about"
              name="site_about"
              rows={3}
              maxLength={4000}
              defaultValue={s.siteAbout}
              placeholder="A family-run bakery in Ljubljana. We sell sourdough and pastries and teach weekend baking classes to beginners."
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="brand_voice">Voice and style guide</Label>
            <Textarea
              id="brand_voice"
              name="brand_voice"
              rows={5}
              maxLength={4000}
              defaultValue={s.brandVoice}
              placeholder={
                "Warm, plain and practical; write like a friendly baker, not a marketer.\nUse British spelling. Short paragraphs.\nNever promise health benefits. Say “classes”, not “workshops”."
              }
            />
          </div>
        </fieldset>
        <fieldset className="grid gap-3 border-t pt-6">
          <legend className="mb-2 font-semibold text-base">Transparency</legend>
          <Label className="items-start font-normal">
            <Checkbox name="ai_disclosure" defaultChecked={s.aiDisclosure} />
            <span>
              Tell readers when AI helped write a post or page
              <span className="block text-muted-foreground text-xs">
                Nordpress records when text from the writing assistant, the
                admin assistant, an agent or site setup is accepted into a post.
                With this on, those posts show a short note to readers. The
                Markdown copies for AI crawlers always say so.
              </span>
            </span>
          </Label>
        </fieldset>
        <fieldset className="grid gap-3 border-t pt-6">
          <legend className="mb-2 font-semibold text-base">Site chat</legend>
          <Label className="font-normal">
            <Checkbox name="chat_enabled" defaultChecked={s.chatEnabled} /> Show
            an “Ask this site” assistant to visitors
          </Label>
          <p className="ml-6 text-muted-foreground text-xs">
            Answers questions from your published content, with links to the
            sources. Open to anyone who visits the site, so it has limits: 12
            questions per visitor every 10 minutes, and the daily cap below.
          </p>
          <div className="ml-6 flex items-center gap-2">
            <Label htmlFor="chat_daily_limit" className="font-normal">
              At most
            </Label>
            <Input
              id="chat_daily_limit"
              name="chat_daily_limit"
              type="number"
              min={1}
              defaultValue={s.chatDailyLimit}
              className="h-8 w-24"
            />
            answers per day for the whole site
          </div>
        </fieldset>
        <div>
          <SubmitButton>Save Changes</SubmitButton>
        </div>
      </ActionForm>

      <section className="mt-12 max-w-2xl">
        <h2 className="mb-1 font-semibold text-lg">Semantic search</h2>
        {voyage ? (
          <div className="grid gap-3 text-sm">
            <p className="text-muted-foreground">
              Search and site chat understand meaning, not just keywords.
              Content is indexed automatically when it's published or updated.
            </p>
            <p>
              <strong>{index.indexed}</strong> of <strong>{index.total}</strong>{" "}
              published items indexed ({index.chunks} passages,{" "}
              <code>{index.model}</code>)
              {index.rebuilding && (
                <span className="ml-2 text-muted-foreground">
                  Rebuilding… refresh to see progress.
                </span>
              )}
            </p>
            <form action={rebuildIndexAction}>
              <Button
                type="submit"
                variant="outline"
                size="sm"
                disabled={index.rebuilding}
              >
                Rebuild search index
              </Button>
            </form>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Search uses keywords only. For search by meaning (and better chat
            answers), add a <code>VOYAGE_API_KEY</code> from voyageai.com to the
            server environment, restart, then rebuild the index here.
          </p>
        )}
      </section>

      <section className="mt-12 max-w-3xl">
        <h2 className="mb-1 font-semibold text-lg">Usage, last 30 days</h2>
        <p className="mb-4 text-muted-foreground text-sm">
          Estimated cost at list prices:{" "}
          <strong className="text-foreground">${totalCost.toFixed(2)}</strong>.
          Your Anthropic Console has the exact bill.
        </p>
        {usage.length === 0 ? (
          <p className="text-muted-foreground text-sm">No AI requests yet.</p>
        ) : (
          <div className="rounded-lg border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Feature</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Requests</TableHead>
                  <TableHead className="text-right">Input</TableHead>
                  <TableHead className="text-right">Output</TableHead>
                  <TableHead className="text-right">Est. cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usage.map((r) => (
                  <TableRow key={`${r.feature}-${r.model}`}>
                    <TableCell>
                      {FEATURE_LABELS[r.feature] ?? r.feature}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {r.model}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.calls}
                      {r.refused + r.failed > 0 && (
                        <span className="block text-muted-foreground text-xs">
                          {r.refused ? `${r.refused} declined` : ""}
                          {r.refused && r.failed ? ", " : ""}
                          {r.failed ? `${r.failed} failed` : ""}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {tokens(r.input)}
                    </TableCell>
                    <TableCell className="text-right">
                      {tokens(r.output)}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.cost === null ? "—" : `$${r.cost.toFixed(3)}`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </>
  );
}
