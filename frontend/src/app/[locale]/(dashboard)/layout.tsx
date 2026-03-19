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
  const router = useRouter();
  const locale = useLocale();
  const { isAuthenticated, isLoading, loadFromStorage } = useAuthStore();
  const checkStatus = useConnectorStore((s) => s.checkStatus);
  const startPolling = useConnectorStore((s) => s.startPolling);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    loadFromStorage();
    setMounted(true);
  }, [loadFromStorage]);

  useEffect(() => {
    if (mounted && !isLoading && !isAuthenticated) {
      router.push(`/${locale}/login`);
    }
  }, [mounted, isLoading, isAuthenticated, router, locale]);

  useEffect(() => {
    if (isAuthenticated) {
      checkStatus();
      const stop = startPolling();
      return stop;
    }
  }, [isAuthenticated, checkStatus, startPolling]);

  if (!mounted || isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
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
