import { create } from "zustand";

const SOUND_KEY = "pavutyna.soundEnabled";

// Read initial sound preference from localStorage (client-side only).
const initialSound = (() => {
  if (typeof window === "undefined") return true;
  const v = window.localStorage.getItem(SOUND_KEY);
  return v === null ? true : v === "1";
})();

interface UIState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  unreadNotifications: number;
  unreadMessages: number;
  setUnreadNotifications: (count: number) => void;
  setUnreadMessages: (count: number) => void;
  soundEnabled: boolean;
  toggleSound: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  unreadNotifications: 0,
  unreadMessages: 0,
  setUnreadNotifications: (count) => set({ unreadNotifications: count }),
  setUnreadMessages: (count) => set({ unreadMessages: count }),
  soundEnabled: initialSound,
  toggleSound: () =>
    set((s) => {
      const next = !s.soundEnabled;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(SOUND_KEY, next ? "1" : "0");
      }
      return { soundEnabled: next };
    }),
}));
