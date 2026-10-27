import { mergeAttributes, Node } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import StarterKit from "@tiptap/starter-kit";

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
];
