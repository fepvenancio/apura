import { create } from "zustand";
import { api } from "@/lib/api";
import type { AuthUser, Organization, SignupData } from "@/lib/types";

interface AuthStore {
  user: AuthUser | null;
  org: Organization | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (data: SignupData) => Promise<void>;
  logout: () => void;
  loadFromStorage: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  org: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (email: string, password: string) => {
    const result = await api.login(email, password);
    set({
      user: result.user,
      org: result.org,
      isAuthenticated: true,
    });
  },

  signup: async (data: SignupData) => {
    const result = await api.signup(data);
    set({
      user: result.user,
      org: result.org,
      isAuthenticated: true,
    });
  },

  logout: () => {
    api.clearToken();
    if (typeof window !== "undefined") {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("user");
      localStorage.removeItem("org");
    }
    set({
      user: null,
      org: null,
      isAuthenticated: false,
    });
  },

  loadFromStorage: () => {
    if (typeof window === "undefined") {
      set({ isLoading: false });
      return;
    }

    const token = localStorage.getItem("accessToken");
    const userJson = localStorage.getItem("user");
    const orgJson = localStorage.getItem("org");

    if (token && userJson && orgJson) {
      try {
        const user = JSON.parse(userJson) as AuthUser;
        const org = JSON.parse(orgJson) as Organization;
        api.setToken(token);
        set({
          user,
          org,
          isAuthenticated: true,
          isLoading: false,
        });
      } catch {
        set({ isLoading: false });
      }
    } else {
      set({ isLoading: false });
    }
  },
}));
