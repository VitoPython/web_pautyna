"use client";

import { useUIStore } from "@/stores/ui-store";

export default function MobileTopBar() {
  const setMobileOpen = useUIStore((s) => s.setMobileSidebarOpen);
  const unreadNotifications = useUIStore((s) => s.unreadNotifications);
  const unreadMessages = useUIStore((s) => s.unreadMessages);
  const totalBadge = unreadNotifications + unreadMessages;

  return (
    <div className="md:hidden flex items-center h-12 px-3 bg-zinc-950 border-b border-zinc-800 shrink-0">
      <button
        onClick={() => setMobileOpen(true)}
        className="text-zinc-300 hover:text-white p-1.5 rounded-md relative"
        aria-label="Меню"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
        {totalBadge > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-violet-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1">
            {totalBadge > 99 ? "99+" : totalBadge}
          </span>
        )}
      </button>
      <div className="flex items-center gap-2 ml-3">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5 text-violet-400">
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="12" r="6" strokeDasharray="2 2" />
          <circle cx="12" cy="12" r="10" strokeDasharray="3 3" />
        </svg>
        <span className="font-semibold text-white">Павутина</span>
      </div>
    </div>
  );
}
