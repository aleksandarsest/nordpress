"use client";

import {
  Laptop,
  Monitor,
  Shuffle,
  Smartphone,
  Sparkles,
  Undo2,
  Wand2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  FONT_PAIRINGS,
  type FontPairing,
  PRESETS,
  palette,
  type SiteDesign,
  shuffleDesign,
} from "@/lib/design";
import { parseHex } from "@/lib/design/color";
import { brandFromPixels } from "@/lib/design/extract";
import { describeDesignAction, saveDesignAction } from "./actions";

type Preview = { label: string; path: string };

const DEVICES = {
  desktop: { label: "Desktop", width: "100%", icon: Monitor },
  tablet: { label: "Tablet", width: "820px", icon: Laptop },
  phone: { label: "Phone", width: "390px", icon: Smartphone },
} as const;

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className="mb-1.5 font-medium text-xs">{label}</legend>
      <div className="flex flex-wrap gap-1">
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            aria-pressed={value === v}
            onClick={() => onChange(v)}
            className="rounded-md border px-2.5 py-1 text-xs transition hover:bg-muted aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background"
          >
            {text}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Swatches({ design }: { design: SiteDesign }) {
  const p = palette(design);
  return (
    <span className="flex overflow-hidden rounded border">
      {[p.bg, p.headerBg, p.accent, p.text].map((c, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed four swatches
          key={i}
          className="size-4"
          style={{ background: c }}
        />
      ))}
    </span>
  );
}

export function DesignEditor({
  saved,
  usingStudio,
  themeName,
  logoUrl,
  ai,
  previews,
}: {
  saved: SiteDesign;
  usingStudio: boolean;
  themeName: string;
  logoUrl: string | null;
  ai: boolean;
  previews: Preview[];
}) {
  const [design, setDesign] = useState(saved);
  const [published, setPublished] = useState(saved);
  const [studio, setStudio] = useState(usingStudio);
  const [path, setPath] = useState(previews[0]?.path ?? "/");
  const [device, setDevice] = useState<keyof typeof DEVICES>("desktop");
  const [brandText, setBrandText] = useState(saved.brand);
  const [describe, setDescribe] = useState("");
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(
    null,
  );
  const [pending, start] = useTransition();
  const frame = useRef<HTMLIFrameElement>(null);
  const changed = JSON.stringify(design) !== JSON.stringify(published);

  // Sends the draft to the preview, which restyles without reloading
  const send = useCallback(() => {
    frame.current?.contentWindow?.postMessage(
      { type: "nordpress:design", design },
      window.location.origin,
    );
  }, [design]);

  useEffect(() => {
    send();
  }, [send]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "nordpress:preview-ready") send();
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [send]);

  function update(patch: Partial<SiteDesign>) {
    setDesign((d) => ({ ...d, preset: "custom", ...patch }));
    if (patch.brand) setBrandText(patch.brand);
  }

  function choose(next: SiteDesign) {
    setDesign(next);
    setBrandText(next.brand);
  }

  function fromLogo() {
    if (!logoUrl) return;
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 200 / Math.max(image.width, image.height));
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      if (!context) return;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const brand = brandFromPixels(
        context.getImageData(0, 0, canvas.width, canvas.height).data,
      );
      if (brand) {
        update({ brand });
        setNote({ text: "Took the main color from your logo." });
      } else
        setNote({
          text: "Your logo has no clear color (it's black, white or grey). Pick one below.",
          error: true,
        });
    };
    image.src = logoUrl;
  }

  function ask() {
    setNote(null);
    start(async () => {
      const r = await describeDesignAction(describe, design);
      if (r.ok) {
        choose(r.data);
        setNote({
          text: "Here's a design for that. Adjust anything you like.",
        });
      } else setNote({ text: r.error, error: true });
    });
  }

  // Switches the theme, keeping the published design, then reloads the preview
  function switchToStudio() {
    start(async () => {
      const r = await saveDesignAction(published, true);
      if (!r.ok) {
        setNote({ text: r.error, error: true });
        return;
      }
      setStudio(true);
      frame.current?.contentWindow?.location.reload();
    });
  }

  function publish() {
    setNote(null);
    start(async () => {
      const r = await saveDesignAction(design, !studio);
      if (r.ok) {
        setPublished(design);
        setStudio(true);
        setNote({ text: "Published. Your site has the new design." });
      } else setNote({ text: r.error, error: true });
    });
  }

  return (
    <div className="-m-4 grid h-[calc(100dvh-3.5rem)] md:-m-8 lg:grid-cols-[22rem_1fr]">
      <aside className="grid content-start gap-6 overflow-y-auto border-r p-5 text-sm">
        <div className="grid gap-1">
          <h1 className="font-semibold text-xl tracking-tight">Design</h1>
          <p className="text-muted-foreground text-xs">
            Every change shows on the right straight away. Visitors see it once
            you publish. Text always stays readable, whatever colors you pick.
          </p>
        </div>

        {!studio && (
          <Alert>
            <AlertDescription className="grid gap-2 text-xs">
              <span>
                Your site uses the {themeName} theme. These choices are for
                Studio; switch to see them in the preview. Nothing else changes:
                your content and menus stay.
              </span>
              <Button
                type="button"
                size="sm"
                disabled={pending}
                onClick={switchToStudio}
                className="justify-self-start"
              >
                Switch to Studio
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <section className="grid gap-2">
          <h2 className="font-medium text-xs uppercase tracking-wide">
            Styles
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(PRESETS).map(([key, preset]) => (
              <button
                key={key}
                type="button"
                aria-pressed={design.preset === key}
                onClick={() => choose(preset.design)}
                className="grid gap-2 rounded-lg border p-2.5 text-left transition hover:border-foreground/40 aria-pressed:border-foreground aria-pressed:ring-1 aria-pressed:ring-foreground"
              >
                <span
                  className="text-base"
                  style={{
                    fontFamily: `var(--font-${FONT_PAIRINGS[preset.design.fonts].heading})`,
                  }}
                >
                  {preset.label}
                </span>
                <Swatches design={preset.design} />
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => choose(shuffleDesign(design))}
            >
              <Shuffle /> Shuffle
            </Button>
            {logoUrl && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={fromLogo}
              >
                <Wand2 /> Colors from my logo
              </Button>
            )}
          </div>
        </section>

        {ai && (
          <section className="grid gap-2">
            <h2 className="font-medium text-xs uppercase tracking-wide">
              Describe your style
            </h2>
            <Textarea
              rows={2}
              value={describe}
              onChange={(e) => setDescribe(e.target.value)}
              placeholder="Warm and handmade, like a small bakery. Earthy colors."
              aria-label="Describe your style"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending || describe.trim().length < 5}
              onClick={ask}
              className="justify-self-start"
            >
              <Sparkles /> {pending ? "Designing…" : "Design it for me"}
            </Button>
          </section>
        )}

        <section className="grid gap-4">
          <h2 className="font-medium text-xs uppercase tracking-wide">
            Colors
          </h2>
          <div className="grid gap-1.5">
            <label htmlFor="brand" className="font-medium text-xs">
              Brand color
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={design.brand}
                onChange={(e) => update({ brand: e.target.value })}
                aria-label="Pick the brand color"
                className="h-9 w-12 cursor-pointer rounded border bg-transparent p-0.5"
              />
              <Input
                id="brand"
                value={brandText}
                onChange={(e) => {
                  setBrandText(e.target.value);
                  const v = e.target.value.trim();
                  const hex = v.startsWith("#") ? v : `#${v}`;
                  if (/^#[0-9a-f]{6}$/i.test(hex) && parseHex(hex))
                    update({ brand: hex.toLowerCase() });
                }}
                className="h-9 w-28 font-mono"
              />
            </div>
          </div>
          <Choice
            label="Mode"
            value={design.mode}
            options={[
              ["light", "Light"],
              ["dark", "Dark"],
            ]}
            onChange={(mode) => update({ mode })}
          />
          <Choice
            label="Background"
            value={design.tint}
            options={[
              ["neutral", "Neutral"],
              ["warm", "Warm"],
              ["cool", "Cool"],
              ["brand", "Brand tint"],
            ]}
            onChange={(tint) => update({ tint })}
          />
          <Choice
            label="Header"
            value={design.header}
            options={[
              ["plain", "Plain"],
              ["brand", "Brand color"],
              ["contrast", "Dark"],
            ]}
            onChange={(header) => update({ header })}
          />
        </section>

        <section className="grid gap-2">
          <h2 className="font-medium text-xs uppercase tracking-wide">Fonts</h2>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(FONT_PAIRINGS) as FontPairing[]).map((key) => {
              const pair = FONT_PAIRINGS[key];
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={design.fonts === key}
                  onClick={() => update({ fonts: key })}
                  className="grid gap-0.5 rounded-lg border p-2.5 text-left transition hover:border-foreground/40 aria-pressed:border-foreground aria-pressed:ring-1 aria-pressed:ring-foreground"
                >
                  <span
                    className="text-lg leading-tight"
                    style={{ fontFamily: `var(--font-${pair.heading})` }}
                  >
                    {pair.label}
                  </span>
                  <span
                    className="text-muted-foreground text-xs"
                    style={{ fontFamily: `var(--font-${pair.body})` }}
                  >
                    The quick brown fox
                  </span>
                </button>
              );
            })}
          </div>
          <Choice
            label="Text size"
            value={design.size}
            options={[
              ["s", "Small"],
              ["m", "Medium"],
              ["l", "Large"],
            ]}
            onChange={(size) => update({ size })}
          />
        </section>

        <section className="grid gap-4">
          <h2 className="font-medium text-xs uppercase tracking-wide">
            Shapes and layout
          </h2>
          <Choice
            label="Corners"
            value={design.radius}
            options={[
              ["none", "Sharp"],
              ["soft", "Soft"],
              ["round", "Round"],
            ]}
            onChange={(radius) => update({ radius })}
          />
          <Choice
            label="Buttons"
            value={design.buttons}
            options={[
              ["solid", "Solid"],
              ["outline", "Outline"],
              ["pill", "Pill"],
            ]}
            onChange={(buttons) => update({ buttons })}
          />
          <Choice
            label="Header layout"
            value={design.headerLayout}
            options={[
              ["split", "Logo left"],
              ["centered", "Centered"],
              ["stacked", "Menu below"],
            ]}
            onChange={(headerLayout) => update({ headerLayout })}
          />
          <Choice
            label="Page width"
            value={design.width}
            options={[
              ["narrow", "Narrow"],
              ["normal", "Normal"],
              ["wide", "Wide"],
            ]}
            onChange={(width) => update({ width })}
          />
          <Choice
            label="Spacing"
            value={design.density}
            options={[
              ["compact", "Compact"],
              ["comfortable", "Comfortable"],
              ["airy", "Airy"],
            ]}
            onChange={(density) => update({ density })}
          />
          <Choice
            label="Post lists"
            value={design.posts}
            options={[
              ["cards", "Cards"],
              ["list", "List"],
              ["magazine", "Magazine"],
            ]}
            onChange={(posts) => update({ posts })}
          />
        </section>

        <div className="sticky bottom-0 -mx-5 grid gap-2 border-t bg-background p-5">
          {note && (
            <p
              role={note.error ? "alert" : "status"}
              className={`text-xs ${note.error ? "text-destructive" : "text-muted-foreground"}`}
            >
              {note.text}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={pending || (!changed && studio)}
              onClick={publish}
              className="flex-1"
            >
              {pending
                ? "Publishing…"
                : changed || !studio
                  ? "Publish"
                  : "Published"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!changed}
              onClick={() => choose(published)}
              title="Back to the published design"
            >
              <Undo2 />
              <span className="sr-only">Undo changes</span>
            </Button>
          </div>
        </div>
      </aside>

      <section className="hidden min-h-0 flex-col bg-muted/40 lg:flex">
        <div className="flex flex-wrap items-center gap-2 border-b bg-background px-4 py-2 text-xs">
          <select
            value={path}
            onChange={(e) => setPath(e.target.value)}
            aria-label="Page to preview"
            className="h-8 rounded-md border bg-transparent px-2"
          >
            {previews.map((p) => (
              <option key={p.path} value={p.path}>
                {p.label}
              </option>
            ))}
          </select>
          <fieldset className="ml-auto flex gap-1" aria-label="Screen size">
            {Object.entries(DEVICES).map(([key, d]) => (
              <Button
                key={key}
                type="button"
                variant={device === key ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={device === key}
                onClick={() => setDevice(key as keyof typeof DEVICES)}
              >
                <d.icon /> {d.label}
              </Button>
            ))}
          </fieldset>
        </div>
        <div className="flex min-h-0 flex-1 justify-center overflow-auto p-4">
          <iframe
            ref={frame}
            key={path}
            src={path}
            title="Preview of your site"
            onLoad={send}
            className="h-full rounded-lg border bg-background shadow-sm transition-[width]"
            style={{ width: DEVICES[device].width }}
          />
        </div>
      </section>
    </div>
  );
}
