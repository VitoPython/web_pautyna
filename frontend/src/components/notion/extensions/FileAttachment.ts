import { Node, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fileAttachment: {
      setFile: (options: { src: string; name: string; size?: number }) => ReturnType;
    };
  }
}

export const FileAttachment = Node.create({
  name: "fileAttachment",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      name: { default: "file" },
      size: { default: 0 },
    };
  },

  parseHTML() {
    return [{ tag: "a[data-file-attachment]" }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const size = node.attrs.size;
    const sizeText = size ? formatSize(size) : "";
    return [
      "a",
      mergeAttributes(HTMLAttributes, {
        "data-file-attachment": "true",
        href: node.attrs.src,
        target: "_blank",
        rel: "noopener noreferrer",
        class: "tt-file-attachment",
      }),
      [
        "span",
        { class: "tt-file-icon" },
        "📎",
      ],
      [
        "span",
        { class: "tt-file-info" },
        ["span", { class: "tt-file-name" }, node.attrs.name],
        ["span", { class: "tt-file-size" }, sizeText],
      ],
    ];
  },

  addCommands() {
    return {
      setFile:
        (options) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: options,
          }),
    };
  },
});

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
