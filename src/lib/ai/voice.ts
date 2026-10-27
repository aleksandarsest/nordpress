import type { SiteSettings } from "../options";

// The site's own description and style guide, written by an administrator
// under Settings → AI and given to every AI feature that writes for the site.
export function siteGuidance(settings: SiteSettings): string {
  const parts = [
    settings.siteAbout.trim() &&
      `<about_the_site>\n${settings.siteAbout.trim()}\n</about_the_site>`,
    settings.brandVoice.trim() &&
      `<voice_and_style_guide>\n${settings.brandVoice.trim()}\n</voice_and_style_guide>`,
  ].filter(Boolean);
  if (parts.length === 0) return "";
  return `The site owner describes the site and how its writing should sound below. Follow the style guide in everything you write for the site, unless the user explicitly asks otherwise.\n\n${parts.join("\n\n")}`;
}

// A system prompt with the site guidance as a second block, so the fixed
// first block stays identical (and cacheable) across sites and edits.
export function withGuidance(base: string, settings: SiteSettings) {
  const guidance = siteGuidance(settings);
  return [
    { type: "text" as const, text: base },
    ...(guidance ? [{ type: "text" as const, text: guidance }] : []),
  ];
}
