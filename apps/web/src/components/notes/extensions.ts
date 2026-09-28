import { Node, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Placeholder } from "@tiptap/extensions";

/**
 * Editor schema = the server allowlist (docs/08_notes, review D-28/D-29): StarterKit nodes/marks,
 * task lists, the inline atom `noteLink` (backlinks) and `image` referencing an attachment id.
 * Images never take arbitrary URLs; links are limited to http(s)/mailto.
 */
export const NoteLink = Node.create({
  name: "noteLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      targetType: { default: "note" },
      targetId: { default: null },
      label: { default: "" },
    };
  },
  parseHTML() {
    return [
      {
        tag: "span[data-note-link]",
        getAttrs: (el) => ({
          targetType: (el as HTMLElement).dataset.targetType,
          targetId: (el as HTMLElement).dataset.targetId,
          label: (el as HTMLElement).textContent ?? "",
        }),
      },
    ];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(
        {
          "data-note-link": "",
          "data-target-type": node.attrs.targetType,
          "data-target-id": node.attrs.targetId,
          class: "note-link",
          role: "link",
          tabindex: "0",
        },
        { title: `${node.attrs.label} 열기` },
        Object.fromEntries(
          Object.entries(HTMLAttributes).filter(([k]) => !["targetType", "targetId", "label"].includes(k)),
        ),
      ),
      `@${node.attrs.label}`,
    ];
  },
  renderText({ node }) {
    return String(node.attrs.label ?? "");
  },
});

export const AttachmentImage = Node.create({
  name: "image",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { attachmentId: { default: null }, alt: { default: "" } };
  },
  parseHTML() {
    return [
      {
        tag: "img[data-attachment-id]",
        getAttrs: (el) => ({
          attachmentId: (el as HTMLElement).dataset.attachmentId,
          alt: (el as HTMLImageElement).alt,
        }),
      },
    ];
  },
  renderHTML({ node }) {
    return [
      "img",
      {
        src: `/api/v1/attachments/${encodeURIComponent(String(node.attrs.attachmentId))}`,
        alt: node.attrs.alt ?? "",
        "data-attachment-id": node.attrs.attachmentId,
        class: "my-2 max-h-[480px] rounded-lg border border-line",
        loading: "lazy",
      },
    ];
  },
});

export function noteExtensions(placeholder = "내용을 적어 보세요…") {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: {
        openOnClick: false,
        autolink: true,
        protocols: ["http", "https", "mailto"],
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
      },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder }),
    NoteLink,
    AttachmentImage,
  ];
}
