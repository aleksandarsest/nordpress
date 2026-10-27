// The form field model, shared by the admin builder, the public renderer,
// server-side validation and the AI form generator. Pure: no I/O.

export const FIELD_TYPES = [
  "text",
  "email",
  "tel",
  "url",
  "number",
  "date",
  "textarea",
  "select",
  "radio",
  "checkbox",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Short text",
  email: "Email",
  tel: "Phone",
  url: "Website",
  number: "Number",
  date: "Date",
  textarea: "Paragraph",
  select: "Dropdown",
  radio: "Multiple choice",
  checkbox: "Checkboxes",
};

export type FormField = {
  /** Stable key used in submissions, e.g. "email" or "project_type". */
  key: string;
  type: FieldType;
  label: string;
  required: boolean;
  placeholder?: string;
  help?: string;
  /** Choices for select, radio and checkbox fields. */
  options?: string[];
};

export type FormSettings = {
  submitLabel: string;
  successMessage: string;
  /** Who gets an email per submission; empty means the site admin email. */
  notifyEmail: string;
  /** Turning this off hides the form on the site and rejects submissions. */
  open: boolean;
  /** Have Claude flag spam and summarize each submission. */
  aiTriage: boolean;
};

export const DEFAULT_FORM_SETTINGS: FormSettings = {
  submitLabel: "Send",
  successMessage: "Thanks! We'll be in touch soon.",
  notifyEmail: "",
  open: true,
  aiTriage: true,
};

export const hasOptions = (type: FieldType) =>
  type === "select" || type === "radio" || type === "checkbox";

const MAX_FIELDS = 40;
const MAX_OPTIONS = 50;
const MAX_TEXT = 500;
const MAX_TEXTAREA = 10_000;

export function fieldKey(label: string) {
  return (
    label
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "field"
  );
}

export class FormDefinitionError extends Error {}

// Cleans fields coming from the builder, the REST API or the model: trims
// text, gives every field a unique key and drops empty choices.
export function normalizeFields(input: unknown): FormField[] {
  if (!Array.isArray(input))
    throw new FormDefinitionError("Fields must be a list.");
  if (input.length > MAX_FIELDS)
    throw new FormDefinitionError(
      `A form can have at most ${MAX_FIELDS} fields.`,
    );
  const used = new Set<string>();
  return input.map((raw, index) => {
    const f = (raw ?? {}) as Record<string, unknown>;
    const type = FIELD_TYPES.includes(f.type as FieldType)
      ? (f.type as FieldType)
      : "text";
    const label = String(f.label ?? "")
      .trim()
      .slice(0, 200);
    if (!label)
      throw new FormDefinitionError(`Field ${index + 1} needs a label.`);
    let key = fieldKey(String(f.key || label));
    for (let n = 2; used.has(key); n++)
      key = `${fieldKey(String(f.key || label))}_${n}`;
    used.add(key);
    const field: FormField = {
      key,
      type,
      label,
      required: f.required === true,
    };
    const placeholder = String(f.placeholder ?? "")
      .trim()
      .slice(0, 200);
    const help = String(f.help ?? "")
      .trim()
      .slice(0, 500);
    if (placeholder && !hasOptions(type)) field.placeholder = placeholder;
    if (help) field.help = help;
    if (hasOptions(type)) {
      const options = [
        ...new Set(
          (Array.isArray(f.options) ? f.options : [])
            .map((o) => String(o).trim().slice(0, 200))
            .filter(Boolean),
        ),
      ].slice(0, MAX_OPTIONS);
      if (options.length === 0)
        throw new FormDefinitionError(`“${label}” needs at least one choice.`);
      field.options = options;
    }
    return field;
  });
}

export function normalizeSettings(input: unknown): FormSettings {
  const s = (input ?? {}) as Record<string, unknown>;
  const text = (key: keyof FormSettings, max: number) =>
    String(s[key] ?? DEFAULT_FORM_SETTINGS[key])
      .trim()
      .slice(0, max);
  const notifyEmail = text("notifyEmail", 320);
  if (notifyEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notifyEmail))
    throw new FormDefinitionError("The notification email isn't valid.");
  return {
    submitLabel: text("submitLabel", 60) || DEFAULT_FORM_SETTINGS.submitLabel,
    successMessage:
      text("successMessage", 1000) || DEFAULT_FORM_SETTINGS.successMessage,
    notifyEmail,
    open: s.open === undefined ? true : s.open === true,
    aiTriage: s.aiTriage === undefined ? true : s.aiTriage === true,
  };
}

export type SubmissionData = Record<string, string | string[]>;

export type ValidationResult =
  | { ok: true; data: SubmissionData }
  | { ok: false; errors: Record<string, string> };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Validates submitted values against the form's fields. `get` returns every
// value sent for a key (checkbox groups send several).
export function validateSubmission(
  fields: FormField[],
  get: (key: string) => string[],
): ValidationResult {
  const data: SubmissionData = {};
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const values = get(field.key)
      .map((v) => v.trim())
      .filter(Boolean);
    if (values.length === 0) {
      if (field.required) errors[field.key] = "This field is required.";
      continue;
    }
    if (field.type === "checkbox") {
      const picked = values.filter((v) => field.options?.includes(v));
      if (picked.length !== values.length) {
        errors[field.key] = "Pick from the listed choices.";
        continue;
      }
      data[field.key] = [...new Set(picked)];
      continue;
    }
    const value = values[0];
    const max = field.type === "textarea" ? MAX_TEXTAREA : MAX_TEXT;
    let error: string | null = null;
    if (value.length > max) error = `Keep this under ${max} characters.`;
    else if (field.type === "email" && !EMAIL.test(value))
      error = "Enter a valid email address.";
    else if (field.type === "url" && !/^https?:\/\/\S+\.\S+/i.test(value))
      error = "Enter a full web address, starting with https://.";
    else if (field.type === "number" && !Number.isFinite(Number(value)))
      error = "Enter a number.";
    else if (
      field.type === "date" &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)))
    )
      error = "Enter a date.";
    else if (field.type === "tel" && !/^[+()\d\s.-]{5,30}$/.test(value))
      error = "Enter a phone number.";
    else if (
      (field.type === "select" || field.type === "radio") &&
      !field.options?.includes(value)
    )
      error = "Pick one of the listed choices.";
    if (error) errors[field.key] = error;
    else data[field.key] = value;
  }
  return Object.keys(errors).length
    ? { ok: false, errors }
    : { ok: true, data };
}

// A JSON Schema describing what the form accepts, published for agents.
export function formJsonSchema(fields: FormField[]) {
  const properties: Record<string, Record<string, unknown>> = {};
  for (const f of fields) {
    const base: Record<string, unknown> = { title: f.label };
    if (f.help) base.description = f.help;
    if (f.type === "checkbox")
      properties[f.key] = {
        ...base,
        type: "array",
        items: { type: "string", enum: f.options },
        uniqueItems: true,
      };
    else if (f.type === "select" || f.type === "radio")
      properties[f.key] = { ...base, type: "string", enum: f.options };
    else if (f.type === "number")
      properties[f.key] = { ...base, type: "number" };
    else
      properties[f.key] = {
        ...base,
        type: "string",
        ...(f.type === "email"
          ? { format: "email" }
          : f.type === "url"
            ? { format: "uri" }
            : f.type === "date"
              ? { format: "date" }
              : {}),
        maxLength: f.type === "textarea" ? MAX_TEXTAREA : MAX_TEXT,
      };
  }
  return {
    type: "object",
    properties,
    required: fields.filter((f) => f.required).map((f) => f.key),
    additionalProperties: false,
  };
}
