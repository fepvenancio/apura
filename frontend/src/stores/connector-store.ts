import { create } from "zustand";
import { api } from "@/lib/api";

interface ConnectorStore {
  status: "connected" | "disconnected" | "checking";
  lastChecked: Date | null;
  agentApiKey: string | null;
  lastHeartbeat: string | null;
  checkStatus: () => Promise<void>;
  startPolling: () => () => void;
}

export const useConnectorStore = create<ConnectorStore>((set) => ({
  status: "checking",
  lastChecked: null,
  agentApiKey: null,
  lastHeartbeat: null,

  checkStatus: async () => {
    set({ status: "checking" });
    try {
      const result = await api.getConnectorStatus();
      set({
        status: result.status === "connected" ? "connected" : "disconnected",
        lastChecked: new Date(),
        agentApiKey: result.agentApiKey || null,
        lastHeartbeat: result.lastHeartbeat || null,
      });
    } catch {
      set({ status: "disconnected", lastChecked: new Date() });
    }
  },

  startPolling: () => {
    const interval = setInterval(() => {
      useConnectorStore.getState().checkStatus();
    }, 30000);
    return () => clearInterval(interval);
  },
}));
