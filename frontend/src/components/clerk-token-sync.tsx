"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect } from "react";
import { api } from "@/lib/api";

export function ClerkTokenSync() {
  const { getToken, isSignedIn } = useAuth();

  useEffect(() => {
    if (isSignedIn) {
      api.setTokenGetter(() => getToken());
    } else {
      api.setTokenGetter(null);
    }
    return () => api.setTokenGetter(null);
  }, [getToken, isSignedIn]);

  return null;
}
