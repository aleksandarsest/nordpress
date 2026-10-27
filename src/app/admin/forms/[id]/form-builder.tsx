"use client";

import { ArrowDown, ArrowUp, Plus, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  FIELD_TYPE_LABELS,
  FIELD_TYPES,
  type FieldType,
  type FormField,
  type FormSettings,
  hasOptions,
} from "@/lib/forms/fields";
import { draftFormAction, saveFormAction } from "../actions";

type EditField = Omit<FormField, "options"> & {
  uid: string;
  optionsText: string;
};

let next = 0;
const uid = () => `f${++next}`;

const toEdit = (f: FormField): EditField => ({
  ...f,
  uid: uid(),
  optionsText: (f.options ?? []).join("\n"),
});

function toField({ uid: _, optionsText, ...f }: EditField): FormField {
  return {
    ...f,
    options: hasOptions(f.type)
      ? optionsText
          .split("\n")
          .map((o) => o.trim())
          .filter(Boolean)
      : undefined,
  };
}

const select =
  "h-8 w-full rounded-lg border bg-transparent px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export function FormBuilder({
  formId,
  initial,
  ai,
}: {
  formId: number;
  initial: { title: string; fields: FormField[]; settings: FormSettings };
  ai: boolean;
}) {
  const [title, setTitle] = useState(initial.title);
  const [fields, setFields] = useState(() => initial.fields.map(toEdit));
  const [settings, setSettings] = useState(initial.settings);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<{ error?: string; message?: string }>(
    {},
  );
  const [saving, startSaving] = useTransition();
  const [drafting, startDrafting] = useTransition();
  const [prompt, setPrompt] = useState("");

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function change(fn: () => void) {
    fn();
    setDirty(true);
    setStatus({});
  }

  function updateField(index: number, patch: Partial<EditField>) {
    change(() =>
      setFields((list) =>
        list.map((f, i) => (i === index ? { ...f, ...patch } : f)),
      ),
    );
  }

  function move(index: number, by: number) {
    change(() =>
      setFields((list) => {
        const target = index + by;
        if (target < 0 || target >= list.length) return list;
        const copy = [...list];
        [copy[index], copy[target]] = [copy[target], copy[index]];
        return copy;
      }),
    );
  }

  function addField(type: FieldType) {
    change(() =>
      setFields((list) => [
        ...list,
        {
          uid: uid(),
          key: "",
          type,
          label: "",
          required: false,
          optionsText: hasOptions(type) ? "Option 1\nOption 2" : "",
        },
      ]),
    );
  }

  function save() {
    startSaving(async () => {
      const result = await saveFormAction(formId, {
        title,
        fields: fields.map(toField),
        settings,
      });
      setStatus(result ?? {});
      if (result?.fields) {
        setFields(result.fields.map(toEdit));
        setDirty(false);
      }
    });
  }

  function draft() {
    startDrafting(async () => {
      const result = await draftFormAction(prompt);
      if (result.error || !result.draft) {
        setStatus({ error: result.error ?? "The AI didn't return a form." });
        return;
      }
      const d = result.draft;
      change(() => {
        setFields(d.fields.map(toEdit));
        setSettings((s) => ({
          ...s,
          submitLabel: d.submitLabel || s.submitLabel,
          successMessage: d.successMessage || s.successMessage,
        }));
      });
      setStatus({
        message: `Drafted ${d.fields.length} fields. Review them, then save.`,
      });
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="grid content-start gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="form-title">Form name</Label>
          <Input
            id="form-title"
            value={title}
            onChange={(e) => change(() => setTitle(e.target.value))}
          />
        </div>

        {fields.length === 0 && (
          <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
            No fields yet. Add one below
            {ai && ", or describe the form to the AI"}.
          </p>
        )}

        <ol className="grid gap-3">
          {fields.map((field, index) => (
            <li key={field.uid}>
              <Card size="sm">
                <CardContent className="grid gap-3 text-sm">
                  <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                    <div className="grid gap-1">
                      <Label htmlFor={`${field.uid}-label`} className="text-xs">
                        Question
                      </Label>
                      <Input
                        id={`${field.uid}-label`}
                        value={field.label}
                        placeholder="e.g. Your email"
                        onChange={(e) =>
                          updateField(index, { label: e.target.value })
                        }
                        className="h-8"
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor={`${field.uid}-type`} className="text-xs">
                        Type
                      </Label>
                      <select
                        id={`${field.uid}-type`}
                        value={field.type}
                        onChange={(e) => {
                          const type = e.target.value as FieldType;
                          updateField(index, {
                            type,
                            optionsText:
                              hasOptions(type) && !field.optionsText
                                ? "Option 1\nOption 2"
                                : field.optionsText,
                          });
                        }}
                        className={select}
                      >
                        {FIELD_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {FIELD_TYPE_LABELS[t]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {hasOptions(field.type) ? (
                    <div className="grid gap-1">
                      <Label
                        htmlFor={`${field.uid}-options`}
                        className="text-xs"
                      >
                        Choices, one per line
                      </Label>
                      <Textarea
                        id={`${field.uid}-options`}
                        value={field.optionsText}
                        rows={Math.min(
                          8,
                          field.optionsText.split("\n").length + 1,
                        )}
                        onChange={(e) =>
                          updateField(index, { optionsText: e.target.value })
                        }
                      />
                    </div>
                  ) : (
                    <div className="grid gap-1">
                      <Label
                        htmlFor={`${field.uid}-placeholder`}
                        className="text-xs"
                      >
                        Placeholder
                      </Label>
                      <Input
                        id={`${field.uid}-placeholder`}
                        value={field.placeholder ?? ""}
                        onChange={(e) =>
                          updateField(index, { placeholder: e.target.value })
                        }
                        className="h-8"
                      />
                    </div>
                  )}

                  <div className="grid gap-1">
                    <Label htmlFor={`${field.uid}-help`} className="text-xs">
                      Help text
                    </Label>
                    <Input
                      id={`${field.uid}-help`}
                      value={field.help ?? ""}
                      onChange={(e) =>
                        updateField(index, { help: e.target.value })
                      }
                      className="h-8"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <Label className="font-normal">
                      <Checkbox
                        checked={field.required}
                        onCheckedChange={(checked) =>
                          updateField(index, { required: checked === true })
                        }
                      />
                      Required
                    </Label>
                    {field.key && (
                      <code className="text-muted-foreground text-xs">
                        {field.key}
                      </code>
                    )}
                    <div className="ml-auto flex gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Move up"
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Move down"
                        disabled={index === fields.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Remove field"
                        className="text-destructive"
                        onClick={() =>
                          change(() =>
                            setFields((list) =>
                              list.filter((_, i) => i !== index),
                            ),
                          )
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Plus className="size-4 text-muted-foreground" />
          {FIELD_TYPES.map((t) => (
            <Button
              key={t}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addField(t)}
            >
              {FIELD_TYPE_LABELS[t]}
            </Button>
          ))}
        </div>
      </div>

      <aside className="grid content-start gap-4">
        <div className="sticky top-4 grid gap-4">
          {status.error && (
            <Alert variant="destructive">
              <AlertDescription>{status.error}</AlertDescription>
            </Alert>
          )}
          {status.message && (
            <Alert>
              <AlertDescription>{status.message}</AlertDescription>
            </Alert>
          )}
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? "Saving…" : dirty ? "Save Form" : "Saved"}
          </Button>

          {ai && (
            <Card size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Sparkles className="size-4" /> Draft fields with AI
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                <Textarea
                  aria-label="Describe the form"
                  rows={3}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Event RSVP with dietary needs and a plus-one"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={drafting || prompt.trim().length < 5}
                  onClick={draft}
                >
                  {drafting ? "Drafting…" : "Replace fields"}
                </Button>
                <p className="text-muted-foreground text-xs">
                  Nothing is saved until you choose Save Form.
                </p>
              </CardContent>
            </Card>
          )}

          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-sm">Settings</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <Label className="font-normal">
                <Checkbox
                  checked={settings.open}
                  onCheckedChange={(c) =>
                    change(() =>
                      setSettings((s) => ({ ...s, open: c === true })),
                    )
                  }
                />
                Accepting responses
              </Label>
              <div className="grid gap-1">
                <Label htmlFor="submit-label" className="text-xs">
                  Button text
                </Label>
                <Input
                  id="submit-label"
                  className="h-8"
                  value={settings.submitLabel}
                  onChange={(e) =>
                    change(() =>
                      setSettings((s) => ({
                        ...s,
                        submitLabel: e.target.value,
                      })),
                    )
                  }
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="success-message" className="text-xs">
                  Message after sending
                </Label>
                <Textarea
                  id="success-message"
                  rows={2}
                  value={settings.successMessage}
                  onChange={(e) =>
                    change(() =>
                      setSettings((s) => ({
                        ...s,
                        successMessage: e.target.value,
                      })),
                    )
                  }
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="notify-email" className="text-xs">
                  Email responses to
                </Label>
                <Input
                  id="notify-email"
                  type="email"
                  className="h-8"
                  placeholder="The site admin email"
                  value={settings.notifyEmail}
                  onChange={(e) =>
                    change(() =>
                      setSettings((s) => ({
                        ...s,
                        notifyEmail: e.target.value,
                      })),
                    )
                  }
                />
              </div>
              <Label className="items-start font-normal">
                <Checkbox
                  checked={settings.aiTriage}
                  onCheckedChange={(c) =>
                    change(() =>
                      setSettings((s) => ({ ...s, aiTriage: c === true })),
                    )
                  }
                />
                <span>
                  AI spam check and summary
                  <span className="block text-muted-foreground text-xs">
                    Uses Claude Haiku on each response; spam skips the email.
                  </span>
                </span>
              </Label>
            </CardContent>
          </Card>
        </div>
      </aside>
    </div>
  );
}
