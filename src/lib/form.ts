import { z } from "zod";

export type FormState = { error?: string; message?: string } | null;

export function formError(error: unknown): FormState {
  if (error instanceof z.ZodError) {
    return { error: error.issues.map((i) => i.message).join(" ") };
  }
  if (error instanceof Error) return { error: error.message };
  return { error: "Something went wrong. Please try again." };
}

export function str(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export function optionalId(formData: FormData, key: string) {
  const n = Number(formData.get(key));
  return Number.isInteger(n) && n > 0 ? n : null;
}

export const email = z.email("Please enter a valid email address.");
export const password = z
  .string()
  .min(8, "The password must be at least 8 characters long.");
