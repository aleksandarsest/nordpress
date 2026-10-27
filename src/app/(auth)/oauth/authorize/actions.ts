"use server";

import { redirect } from "next/navigation";
import {
  deniedRedirect,
  issueCode,
  validateAuthorizeRequest,
} from "@/lib/oauth";
import { getViewer } from "@/lib/session";

// The request is re-validated here: hidden fields come back from the browser.
async function load(formData: FormData) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const params = new URLSearchParams(String(formData.get("request") ?? ""));
  const { request } = await validateAuthorizeRequest(params);
  return { viewer, request };
}

export async function approveAction(formData: FormData) {
  const { viewer, request } = await load(formData);
  redirect(await issueCode(viewer, request));
}

export async function denyAction(formData: FormData) {
  const { request } = await load(formData);
  redirect(deniedRedirect(request));
}
