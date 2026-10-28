import { mergeAttributes, Node } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import type { DOMOutputSpec } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import {
  cleanSection,
  decodeSectionData,
  isSectionKind,
  sectionBody,
  sectionText,
} from "./sections";
import { isValidVideo, parseVideoUrl, videoEmbedSrc } from "./video-embed";

// An embedded form, rendered live on the site. It may only sit at the top
// level of a document, so the renderer can split the HTML around it.
export const FormEmbed = Node.create({
  name: "formEmbed",
  group: "embed",
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      formId: {
        default: null,
        parseHTML: (el) => Number(el.getAttribute("data-form")) || null,
        renderHTML: (attrs) => ({ "data-form": attrs.formId }),
      },
      // Only for showing a name in the editor; the site uses the live title
      title: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-title") ?? "",
        renderHTML: (attrs) => ({ "data-title": attrs.title }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-form]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes)];
  },
  // Keeps forms out of excerpts and search text
  renderText: () => "",
});

// A YouTube or Vimeo video. Only a provider and a checked id are stored;
// the iframe is built from them, so content can't point it anywhere else.
export const VideoEmbed = Node.create({
  name: "videoEmbed",
  group: "embed",
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      provider: { default: null, rendered: false },
      id: { default: null, rendered: false },
    };
  },
  parseHTML() {
    const fromUrl = (url: string | null) => {
      const video = url ? parseVideoUrl(url) : null;
      return video ?? false;
    };
    return [
      {
        tag: "figure[data-video]",
        getAttrs: (el) => {
          const provider = el.getAttribute("data-video");
          const id = el.getAttribute("data-id");
          return isValidVideo(provider, id) ? { provider, id } : false;
        },
      },
      { tag: "iframe[src]", getAttrs: (el) => fromUrl(el.getAttribute("src")) },
      // WordPress embed blocks keep the video's address as text
      {
        tag: "figure.wp-block-embed",
        getAttrs: (el) => fromUrl(el.textContent?.trim() ?? null),
      },
    ];
  },
  renderHTML({ node }) {
    const { provider, id } = node.attrs;
    if (!isValidVideo(provider, id)) return ["figure"];
    return [
      "figure",
      { class: "video-embed", "data-video": provider, "data-id": id },
      [
        "iframe",
        {
          src: videoEmbedSrc(provider, id),
          title: provider === "youtube" ? "YouTube video" : "Vimeo video",
          loading: "lazy",
          allow:
            "accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen",
          allowfullscreen: "true",
          referrerpolicy: "strict-origin-when-cross-origin",
          style: "aspect-ratio: 16 / 9; width: 100%; border: 0;",
        },
      ],
    ];
  },
  renderText: () => "",
});

// A designed page section (hero, features, FAQ…). Its content is data,
// checked by lib/sections on the way in and rendered from there, so the
// stored HTML can't carry anything the section types don't allow.
export const Section = Node.create({
  name: "section",
  group: "embed",
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      kind: {
        default: "cta",
        parseHTML: (el) => el.getAttribute("data-section"),
        rendered: false,
      },
      data: {
        default: {},
        parseHTML: (el) => {
          const kind = el.getAttribute("data-section");
          if (!isSectionKind(kind)) return {};
          try {
            return cleanSection(
              kind,
              decodeSectionData(el.getAttribute("data-content")),
            );
          } catch {
            return cleanSection(kind, {});
          }
        },
        rendered: false,
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: "section[data-section]",
        getAttrs: (el) =>
          isSectionKind(el.getAttribute("data-section")) ? null : false,
      },
    ];
  },
  renderHTML({ node }) {
    const kind = isSectionKind(node.attrs.kind) ? node.attrs.kind : "cta";
    const data = cleanSection(kind, node.attrs.data);
    return [
      "section",
      {
        class: `np-section np-section-${kind} not-prose`,
        "data-section": kind,
        // URL-encoded, so the stored HTML has no markup characters from
        // the content in it for later regex passes to trip over
        "data-content": encodeURIComponent(JSON.stringify(data)),
      },
      ...sectionBody(kind, data),
    ] as DOMOutputSpec;
  },
  renderText: ({ node }) =>
    isSectionKind(node.attrs.kind)
      ? sectionText(node.attrs.kind, node.attrs.data)
      : "",
});

const Document = Node.create({
  name: "doc",
  topNode: true,
  content: "(block | embed)+",
});

// Shared by the admin editor and the server-side renderer, so both agree on
// which nodes and marks a document may contain.
export const editorExtensions = [
  StarterKit.configure({
    document: false,
    heading: { levels: [2, 3, 4] },
    link: { openOnClick: false, autolink: true },
  }),
  Document,
  Image,
  FormEmbed,
  VideoEmbed,
  Section,
];
