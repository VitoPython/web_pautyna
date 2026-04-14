"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Editor, Range } from "@tiptap/core";

export interface SlashItem {
  title: string;
  description: string;
  icon: string;
  command: (editor: Editor, range: Range) => void;
}

interface SlashMenuProps {
  items: SlashItem[];
  command: (item: SlashItem) => void;
}

export const SlashMenu = forwardRef<unknown, SlashMenuProps>(({ items, command }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => setSelectedIndex(0), [items]);

  // Auto-scroll selected item into view
  useLayoutEffect(() => {
    const el = listRef.current?.querySelector<HTMLButtonElement>(`[data-idx="${selectedIndex}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === "ArrowUp") {
        setSelectedIndex((i) => (i + items.length - 1) % items.length);
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelectedIndex((i) => (i + 1) % items.length);
        return true;
      }
      if (event.key === "Enter") {
        if (items[selectedIndex]) command(items[selectedIndex]);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div className="tt-slash-menu">
        <div className="tt-slash-empty">Нічого не знайдено</div>
      </div>
    );
  }

  return (
    <div ref={listRef} className="tt-slash-menu">
      {items.map((item, idx) => (
        <button
          key={item.title}
          data-idx={idx}
          type="button"
          onClick={() => command(item)}
          onMouseEnter={() => setSelectedIndex(idx)}
          className={`tt-slash-item ${idx === selectedIndex ? "tt-slash-item-active" : ""}`}
        >
          <span className="tt-slash-icon">{item.icon}</span>
          <span className="tt-slash-text">
            <span className="tt-slash-title">{item.title}</span>
            <span className="tt-slash-desc">{item.description}</span>
          </span>
        </button>
      ))}
    </div>
  );
});

SlashMenu.displayName = "SlashMenu";
