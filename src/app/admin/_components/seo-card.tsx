"use client";

import { Search, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SEO_DESCRIPTION_LIMIT, SEO_TITLE_LIMIT } from "@/lib/seo";
import { suggestSeoAction } from "../ai/actions";
import { MediaPicker } from "./media-picker";

export type EditorSeo = {
  title: string;
  description: string;
  imageId: number | null;
  imageUrl: string | null;
  noindex: boolean;
};

function Counter({ value, limit }: { value: string; limit: number }) {
  const over = value.length > limit;
  return (
    <span className={over ? "text-destructive" : "text-muted-foreground"}>
      {value.length}/{limit}
    </span>
  );
}

// Lives inside the editor's form: its fields are submitted with the post.
export function SeoCard({
  initial,
  postTitle,
  excerpt,
  address,
  ai,
  read,
  onChange,
}: {
  initial: EditorSeo;
  postTitle: string;
  excerpt: string;
  /** The post's address, for the search preview. */
  address: string;
  ai: boolean;
  read: () => { title: string; contentText: string };
  onChange: () => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [image, setImage] = useState({
    id: initial.imageId,
    url: initial.imageUrl,
  });
  const [picker, setPicker] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const shownTitle = title || postTitle || "Untitled";
  const shownDescription = description || excerpt;

  function suggest() {
    setError(null);
    start(async () => {
      const result = await suggestSeoAction(read());
      if (!result.ok) setError(result.error);
      else {
        setTitle(result.data.title);
        setDescription(result.data.description);
        onChange();
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="size-4" /> Search & sharing
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {/* How the page looks as a search result */}
        <div className="rounded-lg border p-3">
          <p className="truncate text-muted-foreground text-xs">{address}</p>
          <p className="line-clamp-1 font-medium text-[#1a0dab] dark:text-blue-300">
            {shownTitle.length > SEO_TITLE_LIMIT
              ? `${shownTitle.slice(0, SEO_TITLE_LIMIT)}…`
              : shownTitle}
          </p>
          <p className="line-clamp-2 text-muted-foreground text-xs">
            {shownDescription || "Add an excerpt or a description."}
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="seo-title" className="flex justify-between">
            <span>Title in search results</span>
            <Counter value={title} limit={SEO_TITLE_LIMIT} />
          </Label>
          <Input
            id="seo-title"
            name="seo_title"
            value={title}
            placeholder={postTitle}
            maxLength={200}
            onChange={(e) => {
              setTitle(e.target.value);
              onChange();
            }}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="seo-description" className="flex justify-between">
            <span>Description</span>
            <Counter value={description} limit={SEO_DESCRIPTION_LIMIT} />
          </Label>
          <Textarea
            id="seo-description"
            name="seo_description"
            rows={3}
            value={description}
            placeholder={excerpt || "Uses the excerpt when empty"}
            maxLength={400}
            onChange={(e) => {
              setDescription(e.target.value);
              onChange();
            }}
          />
        </div>
        {ai && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={suggest}
            className="justify-self-start"
          >
            <Sparkles className="size-3.5" />
            {pending ? "Writing…" : "Write with AI"}
          </Button>
        )}
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        <div className="grid gap-1.5">
          <span className="font-medium">Image for link previews</span>
          <input type="hidden" name="seo_image_id" value={image.id ?? ""} />
          {image.url && (
            // biome-ignore lint/performance/noImgElement: arbitrary user uploads
            <img src={image.url} alt="" className="w-full rounded-md border" />
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPicker(true)}
            >
              {image.id ? "Replace" : "Choose image"}
            </Button>
            {image.id && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setImage({ id: null, url: null });
                  onChange();
                }}
              >
                Remove
              </Button>
            )}
          </div>
          <p className="text-muted-foreground text-xs">
            Shown when the page is shared on social media or in chat apps. Uses
            the featured image when empty; 1200×630 works best.
          </p>
        </div>
        <Label className="font-normal">
          <Checkbox
            name="seo_noindex"
            defaultChecked={initial.noindex}
            onCheckedChange={onChange}
          />{" "}
          Hide from search engines
        </Label>
      </CardContent>
      <MediaPicker
        open={picker}
        onOpenChange={setPicker}
        title="Image for link previews"
        onSelect={(item) => {
          setImage({ id: item.id, url: item.url });
          setPicker(false);
          onChange();
        }}
      />
    </Card>
  );
}
