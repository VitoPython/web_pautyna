"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import api from "@/lib/api";

const BlockEditor = dynamic(() => import("@/components/notion/BlockEditor"), { ssr: false });

interface PageItem {
  _id: string;
  title: string;
  icon: string;
  contact_id: string | null;
  updated_at: string;
}

interface ActivePage {
  id: string;
  title: string;
  icon: string;
  blocks: unknown;
}

export default function NotionPage() {
  const [pages, setPages] = useState<PageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState<ActivePage | null>(null);
  const [saving, setSaving] = useState(false);

  const loadPages = useCallback(async () => {
    try {
      const { data } = await api.get("/pages");
      setPages(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPages(); }, [loadPages]);

  const openPage = useCallback(async (id: string) => {
    const { data } = await api.get(`/pages/${id}`);
    setActivePage({
      id: data._id,
      title: data.title || "Без назви",
      icon: data.icon || "📝",
      blocks: data.blocks || null,
    });
  }, []);

  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activePageRef = useRef<ActivePage | null>(activePage);
  activePageRef.current = activePage;

  const handleSave = useCallback((content: unknown) => {
    const current = activePageRef.current;
    if (!current) return;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      setSaving(true);
      try {
        await api.patch(`/pages/${current.id}`, { blocks: content });
      } finally {
        setSaving(false);
      }
    }, 1500);
  }, []);

  const handleTitleChange = useCallback(async (newTitle: string) => {
    const current = activePageRef.current;
    if (!current) return;
    setActivePage((p) => (p ? { ...p, title: newTitle } : null));
    try {
      await api.patch(`/pages/${current.id}`, { title: newTitle });
    } catch {
      // silent
    }
  }, []);

  const createPage = useCallback(async () => {
    const { data } = await api.post("/pages", { title: "Нова сторінка", icon: "📝" });
    await loadPages();
    openPage(data.id);
  }, [loadPages, openPage]);

  // Full-screen editor view
  if (activePage) {
    return (
      <div className="flex flex-col h-full">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 h-14 border-b border-zinc-800 shrink-0">
          <button
            onClick={() => { setActivePage(null); loadPages(); }}
            className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors text-sm"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <polyline points="15,18 9,12 15,6" />
            </svg>
            <span>Всі сторінки</span>
          </button>
          {saving && (
            <span className="text-xs text-zinc-500 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-pulse" />
              Збереження
            </span>
          )}
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-auto">
          <div className="max-w-[720px] mx-auto pt-16 pb-24 px-8">
            <input
              type="text"
              value={activePage.title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Без назви"
              className="w-full text-[40px] leading-[1.2] font-bold text-white mb-6 tracking-tight bg-transparent border-none outline-none placeholder-zinc-700"
            />
            <BlockEditor
              initialContent={activePage.blocks}
              onChange={handleSave}
            />
          </div>
        </div>
      </div>
    );
  }

  // Pages list view
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Notion</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Ваші нотатки та сторінки</p>
        </div>
        <button
          onClick={createPage}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Нова сторінка
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : pages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 border border-dashed border-zinc-800 rounded-xl">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="w-12 h-12 text-zinc-700 mb-3">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14,2 14,8 20,8" />
          </svg>
          <p className="text-zinc-600 mb-3">Ще немає жодної сторінки</p>
          <button onClick={createPage} className="text-violet-400 hover:text-violet-300 text-sm">
            + Створити першу сторінку
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {pages.map((p) => (
            <button
              key={p._id}
              onClick={() => openPage(p._id)}
              className="flex items-center gap-3 p-4 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors text-left w-full group"
            >
              <span className="text-2xl">{p.icon || "📄"}</span>
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium truncate">{p.title || "Без назви"}</p>
                <p className="text-zinc-500 text-xs mt-0.5">
                  {p.contact_id ? "Контакт" : "Сторінка"}
                  {p.updated_at && ` · ${new Date(p.updated_at).toLocaleDateString("uk")}`}
                </p>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                className="w-4 h-4 text-zinc-700 group-hover:text-zinc-400 transition-colors shrink-0">
                <polyline points="9,18 15,12 9,6" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
