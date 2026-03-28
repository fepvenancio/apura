"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { useConnectorStore } from "@/stores/connector-store";
import { Sidebar } from "@/components/layout/sidebar";
import { Spinner } from "@/components/ui/spinner";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isSignedIn, isLoaded } = useAuth();
  const checkStatus = useConnectorStore((s) => s.checkStatus);
  const startPolling = useConnectorStore((s) => s.startPolling);

  useEffect(() => {
    if (isSignedIn) {
      checkStatus();
      const stop = startPolling();
      return stop;
    }
  }, [isSignedIn, checkStatus, startPolling]);

  if (!isLoaded) {
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
