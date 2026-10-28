"use client";

import { ArrowDown, ArrowUp, ImageIcon, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  cleanSection,
  SECTION_LABELS,
  type SectionData,
  type SectionKind,
} from "@/lib/sections";
import { MediaPicker } from "./media-picker";

// The form for one section, built from a description of its fields so every
// kind shares the same controls. The data is checked again by lib/sections
// when the page is saved.

type Field =
  | {
      key: string;
      label: string;
      type: "text" | "textarea" | "link" | "image" | "lines" | "checkbox";
    }
  | { key: string; label: string; type: "select"; options: [string, string][] }
  | {
      key: string;
      label: string;
      type: "list";
      item: string;
      fields: Field[];
      max: number;
    }
  // An image whose src and alt sit directly on the item (gallery)
  | { key: "_image"; label: string; type: "inline-image" };

const FIELDS: Record<SectionKind, Field[]> = {
  hero: [
    { key: "eyebrow", label: "Small line above (optional)", type: "text" },
    { key: "heading", label: "Headline", type: "text" },
    { key: "text", label: "Text", type: "textarea" },
    { key: "primary", label: "Main button", type: "link" },
    { key: "secondary", label: "Second button (optional)", type: "link" },
    { key: "image", label: "Image (optional)", type: "image" },
    {
      key: "layout",
      label: "Layout",
      type: "select",
      options: [
        ["center", "Centered text"],
        ["split", "Text beside the image"],
        ["cover", "Text over the image"],
      ],
    },
  ],
  features: [
    { key: "heading", label: "Heading", type: "text" },
    { key: "intro", label: "Intro (optional)", type: "textarea" },
    {
      key: "columns",
      label: "Columns on wide screens",
      type: "select",
      options: [
        ["2", "2"],
        ["3", "3"],
        ["4", "4"],
      ],
    },
    {
      key: "items",
      label: "Items",
      item: "item",
      type: "list",
      max: 12,
      fields: [
        { key: "title", label: "Title", type: "text" },
        { key: "text", label: "Text", type: "textarea" },
      ],
    },
  ],
  gallery: [
    { key: "heading", label: "Heading (optional)", type: "text" },
    {
      key: "images",
      label: "Images",
      item: "image",
      type: "list",
      max: 24,
      fields: [
        { key: "_image", label: "Image", type: "inline-image" },
        { key: "caption", label: "Caption (optional)", type: "text" },
      ],
    },
  ],
  testimonials: [
    { key: "heading", label: "Heading", type: "text" },
    {
      key: "items",
      label: "Testimonials",
      item: "testimonial",
      type: "list",
      max: 9,
      fields: [
        { key: "quote", label: "What they said", type: "textarea" },
        { key: "name", label: "Name", type: "text" },
        { key: "role", label: "Role or company (optional)", type: "text" },
      ],
    },
  ],
  faq: [
    { key: "heading", label: "Heading", type: "text" },
    {
      key: "items",
      label: "Questions",
      item: "question",
      type: "list",
      max: 20,
      fields: [
        { key: "question", label: "Question", type: "text" },
        { key: "answer", label: "Answer", type: "textarea" },
      ],
    },
  ],
  pricing: [
    { key: "heading", label: "Heading", type: "text" },
    { key: "intro", label: "Intro (optional)", type: "textarea" },
    {
      key: "plans",
      label: "Plans",
      item: "plan",
      type: "list",
      max: 4,
      fields: [
        { key: "name", label: "Name", type: "text" },
        { key: "price", label: "Price", type: "text" },
        { key: "period", label: "Per (e.g. per month)", type: "text" },
        {
          key: "features",
          label: "What's included, one per line",
          type: "lines",
        },
        { key: "button", label: "Button", type: "link" },
        { key: "highlight", label: "Highlight this plan", type: "checkbox" },
      ],
    },
  ],
  cta: [
    { key: "heading", label: "Heading", type: "text" },
    { key: "text", label: "Text (optional)", type: "textarea" },
    { key: "button", label: "Button", type: "link" },
  ],
};

const EMPTY_ITEMS: Record<string, Record<string, unknown>> = {
  item: { title: "", text: "" },
  image: { src: "", alt: "", caption: "" },
  testimonial: { quote: "", name: "", role: "" },
  question: { question: "", answer: "" },
  plan: {
    name: "",
    price: "",
    period: "",
    features: [],
    button: { label: "", url: "" },
    highlight: false,
  },
};

type Value = Record<string, unknown>;

function FieldInput({
  field,
  value,
  onChange,
  id,
}: {
  field: Field;
  value: Value;
  onChange: (patch: Value) => void;
  id: string;
}) {
  const [picker, setPicker] = useState(false);
  switch (field.type) {
    case "text":
      return (
        <Input
          id={id}
          value={String(value[field.key] ?? "")}
          onChange={(e) => onChange({ [field.key]: e.target.value })}
        />
      );
    case "textarea":
      return (
        <Textarea
          id={id}
          rows={3}
          value={String(value[field.key] ?? "")}
          onChange={(e) => onChange({ [field.key]: e.target.value })}
        />
      );
    case "lines":
      return (
        <Textarea
          id={id}
          rows={3}
          value={((value[field.key] as string[]) ?? []).join("\n")}
          onChange={(e) =>
            onChange({ [field.key]: e.target.value.split("\n") })
          }
        />
      );
    case "checkbox":
      return (
        <Checkbox
          id={id}
          checked={value[field.key] === true}
          onCheckedChange={(c) => onChange({ [field.key]: c === true })}
        />
      );
    case "select":
      return (
        <select
          id={id}
          value={String(value[field.key] ?? "")}
          onChange={(e) => onChange({ [field.key]: e.target.value })}
          className="h-9 rounded-lg border bg-transparent px-2 text-sm"
        >
          {field.options.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      );
    case "link": {
      const link = (value[field.key] as { label: string; url: string }) ?? {
        label: "",
        url: "",
      };
      return (
        <div className="grid grid-cols-2 gap-2">
          <Input
            id={id}
            placeholder="Label"
            value={link.label}
            onChange={(e) =>
              onChange({ [field.key]: { ...link, label: e.target.value } })
            }
          />
          <Input
            aria-label={`${field.label} address`}
            placeholder="/contact or https://…"
            value={link.url}
            onChange={(e) =>
              onChange({ [field.key]: { ...link, url: e.target.value } })
            }
          />
        </div>
      );
    }
    case "image":
    case "inline-image": {
      const inline = field.type === "inline-image";
      const img = inline
        ? { src: String(value.src ?? ""), alt: String(value.alt ?? "") }
        : ((value[field.key] as { src: string; alt: string }) ?? {
            src: "",
            alt: "",
          });
      const set = (next: { src: string; alt: string }) =>
        onChange(inline ? next : { [field.key]: next });
      return (
        <div className="grid gap-2">
          <div className="flex items-center gap-2">
            {img.src && (
              // biome-ignore lint/performance/noImgElement: a media library preview
              <img
                src={img.src}
                alt=""
                className="h-14 w-20 rounded border object-cover"
              />
            )}
            <Button
              id={id}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setPicker(true)}
            >
              <ImageIcon /> {img.src ? "Change" : "Choose"}
            </Button>
            {img.src && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => set({ src: "", alt: "" })}
              >
                Remove
              </Button>
            )}
          </div>
          {img.src && (
            <Input
              aria-label="Image description for screen readers"
              placeholder="Describe the image for people who can't see it"
              value={img.alt}
              onChange={(e) => set({ ...img, alt: e.target.value })}
            />
          )}
          <MediaPicker
            open={picker}
            onOpenChange={setPicker}
            onSelect={(item) => {
              set({ src: item.url, alt: item.alt || item.title });
              setPicker(false);
            }}
          />
        </div>
      );
    }
    case "list": {
      const items = (value[field.key] as Value[]) ?? [];
      const setItems = (next: Value[]) => onChange({ [field.key]: next });
      return (
        <div className="grid gap-3">
          {items.map((item, i) => (
            <fieldset
              // biome-ignore lint/suspicious/noArrayIndexKey: items have no ids; order is the identity
              key={i}
              className="grid gap-2 rounded-lg border p-3"
            >
              <legend className="flex items-center gap-1 px-1 text-muted-foreground text-xs">
                {field.item} {i + 1}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Move up"
                  disabled={i === 0}
                  onClick={() => {
                    const next = [...items];
                    [next[i - 1], next[i]] = [next[i], next[i - 1]];
                    setItems(next);
                  }}
                >
                  <ArrowUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Move down"
                  disabled={i === items.length - 1}
                  onClick={() => {
                    const next = [...items];
                    [next[i + 1], next[i]] = [next[i], next[i + 1]];
                    setItems(next);
                  }}
                >
                  <ArrowDown />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove ${field.item}`}
                  onClick={() => setItems(items.filter((_, j) => j !== i))}
                >
                  <Trash2 />
                </Button>
              </legend>
              {field.fields.map((sub) => (
                <FieldRow
                  key={sub.key}
                  field={sub}
                  value={item}
                  id={`${id}-${i}-${sub.key}`}
                  onChange={(patch) =>
                    setItems(
                      items.map((it, j) =>
                        j === i ? { ...it, ...patch } : it,
                      ),
                    )
                  }
                />
              ))}
            </fieldset>
          ))}
          {items.length < field.max && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="justify-self-start"
              onClick={() =>
                setItems([...items, { ...EMPTY_ITEMS[field.item] }])
              }
            >
              <Plus /> Add {field.item}
            </Button>
          )}
        </div>
      );
    }
  }
}

function FieldRow(props: {
  field: Field;
  value: Value;
  onChange: (patch: Value) => void;
  id: string;
}) {
  if (props.field.type === "checkbox")
    return (
      <Label className="flex items-center gap-2 font-normal">
        <FieldInput {...props} /> {props.field.label}
      </Label>
    );
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={props.id}>{props.field.label}</Label>
      <FieldInput {...props} />
    </div>
  );
}

export function SectionEditor({
  kind,
  initial,
  open,
  onOpenChange,
  onSave,
}: {
  kind: SectionKind;
  initial: SectionData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: SectionData) => void;
}) {
  const [value, setValue] = useState<Value>(initial as Value);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{SECTION_LABELS[kind]}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 text-sm">
          {FIELDS[kind].map((field) => (
            <FieldRow
              key={field.key}
              field={field}
              value={value}
              id={`section-${field.key}`}
              onChange={(patch) => setValue((v) => ({ ...v, ...patch }))}
            />
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              onSave(cleanSection(kind, value));
              onOpenChange(false);
            }}
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
