import { Extension, Editor, Range } from "@tiptap/core";
import Suggestion, { SuggestionOptions } from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import tippy, { Instance } from "tippy.js";
import { SlashMenu, SlashItem } from "../SlashMenu";

const ITEMS: SlashItem[] = [
  {
    title: "Заголовок 1",
    description: "Великий заголовок",
    icon: "H₁",
    command: (editor, range) => editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run(),
  },
  {
    title: "Заголовок 2",
    description: "Середній заголовок",
    icon: "H₂",
    command: (editor, range) => editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run(),
  },
  {
    title: "Заголовок 3",
    description: "Малий заголовок",
    icon: "H₃",
    command: (editor, range) => editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run(),
  },
  {
    title: "Текст",
    description: "Звичайний параграф",
    icon: "¶",
    command: (editor, range) => editor.chain().focus().deleteRange(range).setNode("paragraph").run(),
  },
  {
    title: "Список",
    description: "Маркований список",
    icon: "•",
    command: (editor, range) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: "Нумерований список",
    description: "Список з цифрами",
    icon: "1.",
    command: (editor, range) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: "Задача",
    description: "Чекліст",
    icon: "☑",
    command: (editor, range) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    title: "Цитата",
    description: "Виділена цитата",
    icon: "❝",
    command: (editor, range) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    title: "Код",
    description: "Блок коду",
    icon: "</>",
    command: (editor, range) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: "Роздільник",
    description: "Горизонтальна лінія",
    icon: "―",
    command: (editor, range) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    title: "Таблиця",
    description: "3x3 таблиця",
    icon: "▦",
    command: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
  {
    title: "Зображення",
    description: "Завантажити фото",
    icon: "🖼",
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).run();
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const url = await uploadFile(file);
        editor.chain().focus().setImage({ src: url }).run();
      };
      input.click();
    },
  },
  {
    title: "Відео",
    description: "Завантажити відео",
    icon: "▶",
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).run();
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "video/*";
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const url = await uploadFile(file);
        editor.chain().focus().setVideo({ src: url }).run();
      };
      input.click();
    },
  },
  {
    title: "Файл",
    description: "Завантажити будь-який файл",
    icon: "📎",
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).run();
      const input = document.createElement("input");
      input.type = "file";
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const url = await uploadFile(file);
        editor.chain().focus().setFile({ src: url, name: file.name, size: file.size }).run();
      };
      input.click();
    },
  },
];

async function uploadFile(file: File): Promise<string> {
  const { default: api } = await import("@/lib/api");
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post("/uploads", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data.url;
}

export const SlashExtension = Extension.create({
  name: "slash",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        startOfLine: false,
        command: ({ editor, range, props }: {
          editor: Editor;
          range: Range;
          props: SlashItem;
        }) => {
          props.command(editor, range);
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      } as SuggestionOptions),
    ];
  },
});

export function buildSlashSuggestion() {
  return {
    items: ({ query }: { query: string }) => {
      const q = query.toLowerCase();
      return ITEMS.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q)
      ).slice(0, 12);
    },

    render: () => {
      let component: ReactRenderer;
      let popup: Instance[];

      return {
        onStart: (props: {
          editor: Editor;
          clientRect?: (() => DOMRect | null) | null;
          range: Range;
          query: string;
        }) => {
          component = new ReactRenderer(SlashMenu, {
            props,
            editor: props.editor,
          });

          if (!props.clientRect) return;

          popup = tippy("body", {
            getReferenceClientRect: () => {
              const rect = props.clientRect?.();
              return rect || new DOMRect();
            },
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "bottom-start",
            theme: "notion-slash",
          });
        },

        onUpdate: (props: {
          editor: Editor;
          clientRect?: (() => DOMRect | null) | null;
        }) => {
          component?.updateProps(props);
          if (!props.clientRect) return;
          popup?.[0]?.setProps({
            getReferenceClientRect: () => {
              const rect = props.clientRect?.();
              return rect || new DOMRect();
            },
          });
        },

        onKeyDown: (props: { event: KeyboardEvent }) => {
          if (props.event.key === "Escape") {
            popup?.[0]?.hide();
            return true;
          }
          return (component?.ref as { onKeyDown?: (p: unknown) => boolean } | null)?.onKeyDown?.(props) ?? false;
        },

        onExit: () => {
          popup?.[0]?.destroy();
          component?.destroy();
        },
      };
    },
  };
}
