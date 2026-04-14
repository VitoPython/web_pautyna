"use client";

import { memo, useCallback, useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { StarterKit } from "@tiptap/starter-kit";
import { Image } from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extensions";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Link } from "@tiptap/extension-link";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";

import { Video } from "./extensions/Video";
import { FileAttachment } from "./extensions/FileAttachment";
import { SlashExtension, buildSlashSuggestion } from "./extensions/slashExtension";
import api from "@/lib/api";

export interface BlockEditorProps {
  initialContent?: unknown; // TipTap JSON
  onChange?: (content: unknown) => void;
  editable?: boolean;
}

async function uploadFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post("/uploads", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data.url;
}

function BlockEditorInner({ initialContent, onChange, editable = true }: BlockEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === "heading") return "Заголовок";
          return "Натисніть '/' для команд...";
        },
      }),
      Image.configure({
        HTMLAttributes: { class: "tt-image" },
      }),
      Video,
      FileAttachment,
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "tt-link" },
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      SlashExtension.configure({
        suggestion: buildSlashSuggestion(),
      }),
    ],
    content: initialContent || "",
    editable,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChangeRef.current?.(editor.getJSON());
    },
    editorProps: {
      attributes: {
        class: "tt-editor",
      },
      handleDrop: (view, event) => {
        const files = Array.from(event.dataTransfer?.files || []);
        if (files.length === 0) return false;

        event.preventDefault();
        files.forEach(async (file) => {
          const url = await uploadFile(file);
          const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
          const pos = coords?.pos || view.state.selection.from;

          if (file.type.startsWith("image/")) {
            editor?.chain().focus().insertContentAt(pos, { type: "image", attrs: { src: url } }).run();
          } else if (file.type.startsWith("video/")) {
            editor?.chain().focus().insertContentAt(pos, { type: "video", attrs: { src: url } }).run();
          } else {
            editor?.chain().focus().insertContentAt(pos, {
              type: "fileAttachment",
              attrs: { src: url, name: file.name, size: file.size },
            }).run();
          }
        });
        return true;
      },
      handlePaste: (view, event) => {
        const files = Array.from(event.clipboardData?.files || []);
        if (files.length === 0) return false;

        event.preventDefault();
        files.forEach(async (file) => {
          const url = await uploadFile(file);
          if (file.type.startsWith("image/")) {
            editor?.chain().focus().setImage({ src: url }).run();
          } else if (file.type.startsWith("video/")) {
            editor?.chain().focus().setVideo({ src: url }).run();
          }
        });
        return true;
      },
    },
  });

  // Sync initialContent only on first load or when contactId/pageId changes
  const lastContentRef = useRef<unknown>(null);
  useEffect(() => {
    if (!editor) return;
    if (initialContent && initialContent !== lastContentRef.current) {
      lastContentRef.current = initialContent;
      const current = editor.getJSON();
      // Only update if content is actually different
      if (JSON.stringify(current) !== JSON.stringify(initialContent)) {
        editor.commands.setContent(initialContent as never, { emitUpdate: false });
      }
    }
  }, [editor, initialContent]);

  const setLink = useCallback(() => {
    const url = window.prompt("URL:");
    if (url === null) return;
    if (url === "") {
      editor?.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor?.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="tt-wrapper">
      <BubbleMenu
        editor={editor}
        options={{ placement: "top" }}
        shouldShow={({ editor, from, to }) => {
          if (from === to) return false;
          if (editor.isActive("image") || editor.isActive("video") || editor.isActive("fileAttachment")) return false;
          return true;
        }}
      >
        <div className="tt-bubble">
          <BubbleBtn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>B</BubbleBtn>
          <BubbleBtn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} style={{ fontStyle: "italic" }}>I</BubbleBtn>
          <BubbleBtn active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} style={{ textDecoration: "line-through" }}>S</BubbleBtn>
          <BubbleBtn active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}>&lt;/&gt;</BubbleBtn>
          <div className="tt-bubble-sep" />
          <BubbleBtn active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H₁</BubbleBtn>
          <BubbleBtn active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H₂</BubbleBtn>
          <BubbleBtn active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H₃</BubbleBtn>
          <div className="tt-bubble-sep" />
          <BubbleBtn active={editor.isActive("link")} onClick={setLink}>🔗</BubbleBtn>
          <BubbleBtn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>•</BubbleBtn>
          <BubbleBtn active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>❝</BubbleBtn>
        </div>
      </BubbleMenu>

      <EditorContent editor={editor} />
    </div>
  );
}

function BubbleBtn({
  children,
  active,
  onClick,
  style,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`tt-bubble-btn ${active ? "tt-bubble-btn-active" : ""}`}
      style={style}
    >
      {children}
    </button>
  );
}

const BlockEditor = memo(BlockEditorInner, (prev, next) => {
  // Only re-mount editor if content identity truly changed
  return prev.initialContent === next.initialContent && prev.editable === next.editable;
});

export default BlockEditor;
