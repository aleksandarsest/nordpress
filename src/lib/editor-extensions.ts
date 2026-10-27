import Image from "@tiptap/extension-image";
import StarterKit from "@tiptap/starter-kit";

// Shared by the admin editor and the server-side renderer, so both agree on
// which nodes and marks a document may contain.
export const editorExtensions = [
  StarterKit.configure({
    heading: { levels: [2, 3, 4] },
    link: { openOnClick: false, autolink: true },
  }),
  Image,
];
