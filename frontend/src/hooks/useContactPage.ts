"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/api";

interface ContactPage {
  id: string;
  title: string;
  icon: string;
  blocks: unknown; // TipTap JSON
}

export function useContactPage(contactId: string | null) {
  const [page, setPage] = useState<ContactPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!contactId) {
      setPage(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const { data: contact } = await api.get(`/contacts/${contactId}`);
        const pageId = contact.note_page_id;

        if (pageId) {
          const { data } = await api.get(`/pages/${pageId}`);
          if (!cancelled) {
            setPage({
              id: data._id,
              title: data.title || contact.name,
              icon: data.icon || "📝",
              blocks: data.blocks || null,
            });
          }
        } else {
          const { data } = await api.post("/pages", {
            contact_id: contactId,
            title: contact.name,
            icon: "📝",
          });
          if (!cancelled) {
            setPage({
              id: data.id,
              title: contact.name,
              icon: "📝",
              blocks: null,
            });
          }
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [contactId]);

  const pageRef = useRef(page);
  pageRef.current = page;

  const saveBlocks = useCallback((content: unknown) => {
    const current = pageRef.current;
    if (!current) return;

    if (saveTimeout.current) clearTimeout(saveTimeout.current);

    saveTimeout.current = setTimeout(async () => {
      setSaving(true);
      try {
        await api.patch(`/pages/${current.id}`, { blocks: content });
      } catch {
        // silent
      } finally {
        setSaving(false);
      }
    }, 1500);
  }, []);

  return { page, loading, saving, saveBlocks };
}
