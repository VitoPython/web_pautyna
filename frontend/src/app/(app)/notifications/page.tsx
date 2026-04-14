"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import { useUIStore } from "@/stores/ui-store";
import { useWebSocket } from "@/hooks/useWebSocket";

interface Notification {
  _id: string;
  type: string;
  title: string;
  body: string;
  platform?: string;
  contact_id?: string;
  read: boolean;
  created_at: string;
}

const PLATFORM_COLOR: Record<string, string> = {
  telegram: "bg-sky-500/15 text-sky-400",
  gmail: "bg-red-500/15 text-red-400",
  linkedin: "bg-blue-500/15 text-blue-400",
  instagram: "bg-pink-500/15 text-pink-400",
};

function formatTime(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) return d.toLocaleTimeString("uk", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("uk", { day: "2-digit", month: "2-digit" }) + " " +
    d.toLocaleTimeString("uk", { hour: "2-digit", minute: "2-digit" });
}

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const setUnreadNotifications = useUIStore((s) => s.setUnreadNotifications);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<Notification[]>("/notifications");
      setItems(data);
      setUnreadNotifications(data.filter((n) => !n.read).length);
    } finally {
      setLoading(false);
    }
  }, [setUnreadNotifications]);

  useEffect(() => { load(); }, [load]);

  useWebSocket((event) => {
    if (event.type === "new_message" || event.type === "notification") load();
  });

  const markRead = async (id: string) => {
    setItems((list) => list.map((n) => (n._id === id ? { ...n, read: true } : n)));
    try {
      await api.patch(`/notifications/${id}/read`);
    } finally {
      setUnreadNotifications(items.filter((n) => !n.read && n._id !== id).length);
    }
  };

  const markAllRead = async () => {
    setItems((list) => list.map((n) => ({ ...n, read: true })));
    setUnreadNotifications(0);
    try {
      await api.post("/notifications/read-all");
    } catch {
      load(); // resync on failure
    }
  };

  const unreadCount = items.filter((n) => !n.read).length;

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="flex items-center justify-between mb-6 max-w-3xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-white">Сповіщення</h1>
          <p className="text-zinc-500 text-sm mt-1">
            {unreadCount > 0 ? `${unreadCount} непрочитаних` : "Всі прочитані"}
          </p>
        </div>
        <button
          onClick={markAllRead}
          disabled={unreadCount === 0}
          className="px-4 py-2 text-zinc-400 hover:text-white text-sm transition-colors disabled:opacity-40"
        >
          Позначити всі як прочитані
        </button>
      </div>

      <div className="max-w-3xl mx-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center h-64 border border-dashed border-zinc-800 rounded-xl">
            <p className="text-zinc-600">Немає сповіщень</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((n) => {
              const platformCls = n.platform ? PLATFORM_COLOR[n.platform] : "";
              const content = (
                <div
                  className={`flex items-start gap-3 p-4 rounded-xl border transition-colors ${
                    n.read
                      ? "border-zinc-800/60 bg-zinc-900/30"
                      : "border-violet-500/30 bg-violet-500/5 hover:bg-violet-500/10"
                  }`}
                >
                  {!n.read && <span className="w-2 h-2 rounded-full bg-violet-400 mt-2 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className={`text-sm truncate ${n.read ? "text-zinc-400" : "text-white font-semibold"}`}>
                        {n.title}
                      </p>
                      {n.platform && platformCls && (
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${platformCls}`}>
                          {n.platform}
                        </span>
                      )}
                    </div>
                    {n.body && (
                      <p className="text-xs text-zinc-500 line-clamp-2">{n.body}</p>
                    )}
                    <p className="text-[10px] text-zinc-600 mt-1">{formatTime(n.created_at)}</p>
                  </div>
                </div>
              );

              const wrapperProps = {
                key: n._id,
                onClick: () => { if (!n.read) markRead(n._id); },
              };

              if (n.type === "new_message" && n.contact_id) {
                return (
                  <Link href="/inbox" {...wrapperProps} className="block">
                    {content}
                  </Link>
                );
              }
              return (
                <button {...wrapperProps} className="text-left w-full">
                  {content}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
