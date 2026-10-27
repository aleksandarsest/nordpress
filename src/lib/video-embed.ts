// Video embeds: only YouTube and Vimeo, stored as a provider and a checked
// id, so the iframe address is always built here, never taken from content.
// Pure.

export type VideoProvider = "youtube" | "vimeo";

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{6,12}$/;

export function parseVideoUrl(
  input: string,
): { provider: VideoProvider; id: string } | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.slice(1);
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id =
      url.searchParams.get("v") ??
      url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/)?.[1] ??
      null;
  }
  if (id && YOUTUBE_ID.test(id)) return { provider: "youtube", id };
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const vid = url.pathname.match(/(?:^|\/)(\d{6,12})(?:\/|$)/)?.[1];
    if (vid && VIMEO_ID.test(vid)) return { provider: "vimeo", id: vid };
  }
  return null;
}

export function isValidVideo(provider: unknown, id: unknown) {
  return (
    (provider === "youtube" && typeof id === "string" && YOUTUBE_ID.test(id)) ||
    (provider === "vimeo" && typeof id === "string" && VIMEO_ID.test(id))
  );
}

/** The iframe address: privacy-friendly variants of both players. */
export function videoEmbedSrc(provider: VideoProvider, id: string) {
  return provider === "youtube"
    ? `https://www.youtube-nocookie.com/embed/${id}`
    : `https://player.vimeo.com/video/${id}?dnt=1`;
}

/** A normal page for the video, for feeds and Markdown. */
export function videoPageUrl(provider: VideoProvider, id: string) {
  return provider === "youtube"
    ? `https://www.youtube.com/watch?v=${id}`
    : `https://vimeo.com/${id}`;
}
