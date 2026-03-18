import { create } from "zustand";
import { api, MfaRequiredError } from "@/lib/api";
import type { AuthUser, Organization, SignupData } from "@/lib/types";

interface AuthStore {
  user: AuthUser | null;
  org: Organization | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  pendingMfaToken: string | null;
  mfaRequired: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (data: SignupData) => Promise<void>;
  logout: () => void;
  loadFromStorage: () => void;
  verifyMfa: (code: string) => Promise<void>;
  clearMfaPending: () => void;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  org: null,
  isAuthenticated: false,
  isLoading: true,
  pendingMfaToken: null,
  mfaRequired: false,

  login: async (email: string, password: string) => {
    try {
      const result = await api.login(email, password);
      set({
        user: result.user,
        org: result.org,
        isAuthenticated: true,
        pendingMfaToken: null,
        mfaRequired: false,
      });
    } catch (error) {
      if (error instanceof MfaRequiredError) {
        set({
          pendingMfaToken: error.mfaToken,
          mfaRequired: true,
        });
        throw error;
      }
      throw error;
    }
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

  verifyMfa: async (code: string) => {
    const { pendingMfaToken } = get();
    if (!pendingMfaToken) throw new Error("No pending MFA token");
    const result = await api.verifyMfa(pendingMfaToken, code);
    set({
      user: result.user,
      org: result.org,
      isAuthenticated: true,
      pendingMfaToken: null,
      mfaRequired: false,
    });
  },

  clearMfaPending: () => {
    set({ pendingMfaToken: null, mfaRequired: false });
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
