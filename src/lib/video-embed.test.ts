import { describe, expect, it } from "vitest";
import { htmlToDoc, renderContent } from "./content";
import { docToMarkdown } from "./markdown";
import { parseVideoUrl, videoEmbedSrc } from "./video-embed";

describe("parseVideoUrl", () => {
  it("understands the usual YouTube and Vimeo addresses", () => {
    const yt = { provider: "youtube", id: "dQw4w9WgXcQ" };
    expect(
      parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10"),
    ).toEqual(yt);
    expect(parseVideoUrl("https://youtu.be/dQw4w9WgXcQ")).toEqual(yt);
    expect(parseVideoUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toEqual(
      yt,
    );
    expect(
      parseVideoUrl("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"),
    ).toEqual(yt);
    expect(parseVideoUrl("https://vimeo.com/76979871")).toEqual({
      provider: "vimeo",
      id: "76979871",
    });
    expect(
      parseVideoUrl("https://player.vimeo.com/video/76979871?h=x"),
    ).toEqual({ provider: "vimeo", id: "76979871" });
  });

  it("rejects everything else", () => {
    expect(
      parseVideoUrl("https://evil.example/watch?v=dQw4w9WgXcQ"),
    ).toBeNull();
    expect(parseVideoUrl('https://youtube.com/watch?v=bad"id')).toBeNull();
    expect(parseVideoUrl("not a url")).toBeNull();
  });
});

describe("video embeds in content", () => {
  it("round-trips and renders a privacy-friendly iframe", () => {
    const doc = htmlToDoc(
      '<p>Watch:</p><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>',
    );
    expect(doc.content?.[1]).toMatchObject({
      type: "videoEmbed",
      attrs: { provider: "youtube", id: "dQw4w9WgXcQ" },
    });
    const { html } = renderContent(doc);
    expect(html).toContain(`src="${videoEmbedSrc("youtube", "dQw4w9WgXcQ")}"`);
    expect(
      docToMarkdown(doc, { absolute: (u) => u, formUrl: () => "" }),
    ).toContain("[Video](https://www.youtube.com/watch?v=dQw4w9WgXcQ)");
  });

  it("drops iframes from anywhere else", () => {
    const doc = htmlToDoc(
      '<iframe src="https://evil.example/x"></iframe><p>ok</p>',
    );
    expect(JSON.stringify(doc)).not.toContain("evil");
  });
});
