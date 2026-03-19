"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useAuthStore } from "@/stores/auth-store";
import { useConnectorStore } from "@/stores/connector-store";
import { Sidebar } from "@/components/layout/sidebar";
import { Spinner } from "@/components/ui/spinner";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = useLocale();
  const router = useRouter();
  const { isAuthenticated, loadFromStorage } = useAuthStore();
  const checkStatus = useConnectorStore((s) => s.checkStatus);
  const startPolling = useConnectorStore((s) => s.startPolling);
  const [ready, setReady] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    // Check localStorage directly — don't rely on Zustand timing
    const token = localStorage.getItem("accessToken");
    const user = localStorage.getItem("user");
    const org = localStorage.getItem("org");

    if (!token || !user || !org) {
      // No auth data — redirect to login
      setRedirecting(true);
      router.push(`/${locale}/login`);
      return;
    }

    // Auth data exists — load into Zustand store
    loadFromStorage();
    setReady(true);
  }, [loadFromStorage, locale, router]);

  useEffect(() => {
    if (isAuthenticated) {
      checkStatus();
      const stop = startPolling();
      return stop;
    }
  }, [isAuthenticated, checkStatus, startPolling]);

  if (redirecting || !ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 ml-60">
        {children}
      </main>
    </div>
  );
}
