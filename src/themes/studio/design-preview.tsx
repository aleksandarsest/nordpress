"use client";

import { useEffect } from "react";
import { designAttributes, designSchema, designVars } from "@/lib/design";

// When the site is shown inside Appearance → Design, the editor sends each
// change here and the page restyles at once, before anything is saved. Only
// messages from this same site are accepted, and they only change styles.
export function DesignPreview() {
  useEffect(() => {
    if (window.parent === window) return;
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "nordpress:design") return;
      const parsed = designSchema.safeParse(event.data.design);
      const root = document.querySelector<HTMLElement>(".studio");
      if (!parsed.success || !root) return;
      for (const [key, value] of Object.entries(designVars(parsed.data)))
        root.style.setProperty(key, value);
      for (const [key, value] of Object.entries(designAttributes(parsed.data)))
        root.setAttribute(key, value);
    }
    window.addEventListener("message", onMessage);
    // Tell the editor the page is ready for the current draft
    window.parent.postMessage(
      { type: "nordpress:preview-ready" },
      window.location.origin,
    );
    return () => window.removeEventListener("message", onMessage);
  }, []);
  return null;
}
