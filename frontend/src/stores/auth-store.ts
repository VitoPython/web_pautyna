import { create } from "zustand";
import api from "@/lib/api";

interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string;
  plan: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  updateProfile: (patch: Partial<Pick<User, "name" | "email" | "avatar_url">>) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (email, password) => {
    await api.post("/auth/login", { email, password });
    // Cookie is set by backend — now fetch user data
    const { data } = await api.get("/auth/me");
    set({ user: data, isAuthenticated: true });
  },

  register: async (name, email, password) => {
    await api.post("/auth/register", { name, email, password });
    const { data } = await api.get("/auth/me");
    set({ user: data, isAuthenticated: true });
  },

  logout: async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      set({ user: null, isAuthenticated: false });
      window.location.href = "/login";
    }
  },

  checkAuth: async () => {
    try {
      const { data } = await api.get("/auth/me");
      set({ user: data, isAuthenticated: true, isLoading: false });
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  updateProfile: async (patch) => {
    const { data } = await api.patch("/auth/me", patch);
    set({ user: data });
  },
}));
