"use client";

import { useCallback, useEffect } from "react";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import { useWebSocket } from "@/hooks/useWebSocket";

interface Chat { unread_count: number }
interface Notification { read: boolean }

export default function UnreadBadgesLoader() {
  const isAuthed = useAuthStore((s) => !!s.user);
  const setUnreadMessages = useUIStore((s) => s.setUnreadMessages);
  const setUnreadNotifications = useUIStore((s) => s.setUnreadNotifications);

  const refresh = useCallback(async () => {
    try {
      const [chats, notifs] = await Promise.all([
        api.get<Chat[]>("/messages/chats"),
        api.get<Notification[]>("/notifications"),
      ]);
      setUnreadMessages(chats.data.reduce((s, c) => s + (c.unread_count || 0), 0));
      setUnreadNotifications(notifs.data.filter((n) => !n.read).length);
    } catch {
      // silent — user may be unauthenticated or offline
    }
  }, [setUnreadMessages, setUnreadNotifications]);

  useEffect(() => {
    if (!isAuthed) return;
    refresh();
    // Polling fallback for when WS events can't reach us (local dev
    // without public URL). Once ngrok/production webhook is wired, the
    // WS handler below will fire within a second and this is just a
    // safety net for when the socket is down.
    const t = setInterval(() => { refresh(); }, 15000);
    return () => clearInterval(t);
  }, [isAuthed, refresh]);

  useWebSocket((event) => {
    if (event.type === "new_message" || event.type === "notification") refresh();
  }, isAuthed);

  return null;
}
