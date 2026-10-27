"use client";

import { useActionState } from "react";
import type { PublicForm } from "@/lib/forms";
import type { FormField } from "@/lib/forms/fields";
import { submitFormAction } from "../actions";

const control =
  "w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export function SiteForm({
  form,
  postId,
}: {
  form: PublicForm;
  postId: number | null;
}) {
  const [state, action, pending] = useActionState(submitFormAction, null);

  if (state?.ok) {
    return (
      <div
        role="status"
        className="not-prose my-8 rounded-xl border bg-muted/40 p-6 text-sm"
      >
        {state.message}
      </div>
    );
  }

  return (
    <form
      // Remount after each failed attempt so fields show what was sent
      key={state?.attempt ?? 0}
      action={action}
      aria-label={form.title}
      className="not-prose my-8 grid gap-4 rounded-xl border p-6 text-sm"
    >
      <input type="hidden" name="_form_id" value={form.id} />
      {postId && <input type="hidden" name="_post_id" value={postId} />}
      <div aria-hidden className="absolute -left-[9999px]">
        <label>
          Leave this empty
          <input name="_hp" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {state?.error && (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-destructive"
        >
          {state.error}
        </p>
      )}

      {form.fields.map((field) => (
        <Field
          key={field.key}
          formId={form.id}
          field={field}
          values={state?.values?.[field.key] ?? []}
          error={state?.fieldErrors?.[field.key]}
        />
      ))}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-lg bg-primary px-5 font-medium text-primary-foreground disabled:opacity-50"
        >
          {pending ? "Sending…" : form.settings.submitLabel}
        </button>
      </div>
    </form>
  );
}

function Field({
  formId,
  field,
  values,
  error,
}: {
  formId: number;
  field: FormField;
  values: string[];
  error?: string;
}) {
  const id = `form-${formId}-${field.key}`;
  const describedBy =
    [field.help && `${id}-help`, error && `${id}-error`]
      .filter(Boolean)
      .join(" ") || undefined;
  const common = {
    id,
    name: field.key,
    required: field.required,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
  };
  const label = (
    <>
      {field.label}
      {field.required && (
        <span aria-hidden className="text-destructive">
          {" "}
          *
        </span>
      )}
    </>
  );
  const footer = (
    <>
      {field.help && (
        <span id={`${id}-help`} className="text-muted-foreground text-xs">
          {field.help}
        </span>
      )}
      {error && (
        <span id={`${id}-error`} className="text-destructive text-xs">
          {error}
        </span>
      )}
    </>
  );

  if (field.type === "radio" || field.type === "checkbox") {
    return (
      <fieldset className="grid gap-1.5" aria-describedby={describedBy}>
        <legend className="mb-1 font-medium">{label}</legend>
        {field.options?.map((option, i) => (
          <label key={option} className="flex items-center gap-2">
            <input
              type={field.type}
              name={field.key}
              value={option}
              defaultChecked={values.includes(option)}
              // A required checkbox group is checked on the server instead
              required={field.type === "radio" && field.required && i === 0}
              className="size-4"
            />
            {option}
          </label>
        ))}
        {footer}
      </fieldset>
    );
  }

  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      {field.type === "textarea" ? (
        <textarea
          {...common}
          rows={5}
          maxLength={10_000}
          placeholder={field.placeholder}
          defaultValue={values[0]}
          className={`${control} py-2`}
        />
      ) : field.type === "select" ? (
        <select
          {...common}
          defaultValue={values[0] ?? ""}
          className={`${control} h-10`}
        >
          <option value="" disabled={field.required}>
            Choose…
          </option>
          {field.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          {...common}
          type={field.type}
          maxLength={field.type === "number" ? undefined : 500}
          step={field.type === "number" ? "any" : undefined}
          placeholder={field.placeholder}
          defaultValue={values[0]}
          autoComplete={
            field.type === "email"
              ? "email"
              : field.type === "tel"
                ? "tel"
                : undefined
          }
          className={`${control} h-10`}
        />
      )}
      {footer}
    </div>
  );
}
