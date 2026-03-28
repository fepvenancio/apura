"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { useAuth, useSignUp } from "@clerk/nextjs";
import { Spinner } from "@/components/ui/spinner";

export function AcceptInviteClient() {
  const params = useParams();
  const token = params.token as string;
  const { isSignedIn } = useAuth();
  const { signUp } = useSignUp();

  useEffect(() => {
    if (isSignedIn) {
      // Already signed in — go to dashboard
      window.location.href = "/pt/home";
      return;
    }
    // Redirect to Clerk sign-up with invitation token as metadata
    if (signUp) {
      window.location.href = `/sign-up?redirect_url=/pt/home&__clerk_ticket=${token}`;
    }
  }, [isSignedIn, signUp, token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Spinner size="lg" />
    </div>
  );
}
