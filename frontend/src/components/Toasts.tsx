"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { useWebSocket } from "@/hooks/useWebSocket";

interface Toast {
  id: number;
  title: string;
  body: string;
  platform: string;
  href: string;
}

const PLATFORM_DOT: Record<string, string> = {
  telegram: "bg-sky-400",
  gmail: "bg-red-400",
  linkedin: "bg-blue-400",
  instagram: "bg-pink-400",
};

let toastId = 0;

export default function Toasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pathname = usePathname();
  const isAuthed = useAuthStore((s) => !!s.user);

  useWebSocket((event) => {
    if (event.type !== "new_message") return;
    // Skip if user is already looking at inbox — page handles its own UI update.
    if (pathname.startsWith("/inbox")) return;

    const payload = event.payload as {
      contact_name?: string;
      content?: string;
      subject?: string;
      platform?: string;
    };
    const id = ++toastId;
    const toast: Toast = {
      id,
      title: payload.contact_name || "Нове повідомлення",
      body: payload.subject ? `${payload.subject}: ${payload.content || ""}` : (payload.content || ""),
      platform: payload.platform || "",
      href: "/inbox",
    };
    setToasts((list) => [...list, toast]);
    window.setTimeout(() => {
      setToasts((list) => list.filter((t) => t.id !== id));
    }, 6000);
  }, isAuthed);

  // Clean up when user logs out
  useEffect(() => {
    if (!isAuthed) setToasts([]);
  }, [isAuthed]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))}
          className="flex items-start gap-3 p-3 bg-zinc-900 border border-violet-500/40 rounded-lg shadow-lg hover:border-violet-500 transition-colors animate-in slide-in-from-right"
        >
          <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${PLATFORM_DOT[t.platform] || "bg-violet-400"}`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white font-medium truncate">{t.title}</p>
            {t.body && <p className="text-xs text-zinc-400 line-clamp-2 mt-0.5">{t.body}</p>}
          </div>
        </Link>
      ))}
    </div>
  );
}
