import { create } from "zustand";
import { api, ApiError } from "@/lib/api";
import type { QueryResult, SavedQuery } from "@/lib/types";

interface QueryStore {
  currentQuery: string;
  isExecuting: boolean;
  result: QueryResult | null;
  error: string | null;
  history: SavedQuery[];
  historyPage: number;
  historyTotalPages: number;
  setCurrentQuery: (query: string) => void;
  executeQuery: (naturalLanguage: string) => Promise<void>;
  clearResult: () => void;
  loadHistory: (page?: number) => Promise<void>;
}

export const useQueryStore = create<QueryStore>((set) => ({
  currentQuery: "",
  isExecuting: false,
  result: null,
  error: null,
  history: [],
  historyPage: 1,
  historyTotalPages: 1,

  setCurrentQuery: (query: string) => set({ currentQuery: query }),

  executeQuery: async (naturalLanguage: string) => {
    set({ isExecuting: true, error: null, result: null, currentQuery: naturalLanguage });
    try {
      const result = await api.executeQuery(naturalLanguage);
      set({ result, isExecuting: false });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? (err.body as { message?: string })?.message || "Erro ao executar consulta"
          : "Erro inesperado ao executar consulta";
      set({ error: message, isExecuting: false });
    }
  },

  clearResult: () => set({ result: null, error: null, currentQuery: "" }),

  loadHistory: async (page = 1) => {
    try {
      const response = await api.getQueryHistory(page) as unknown as Record<string, unknown>;
      const items = (response?.items ?? response?.data ?? []) as SavedQuery[];
      set({
        history: Array.isArray(items) ? items : [],
        historyPage: (response?.page as number) ?? page,
        historyTotalPages: (response?.totalPages as number) ?? 1,
      });
    } catch {
      // Silently fail for history loading
    }
  },
}));
