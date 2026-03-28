"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSignUp } from "@clerk/nextjs";

/**
 * Accept invitation — redirects to Clerk's sign-up flow with the invitation token.
 * Clerk handles the full invitation acceptance (account creation + org membership).
 */
export function AcceptInviteClient() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const { isLoaded } = useSignUp();

  useEffect(() => {
    if (isLoaded && token) {
      // Redirect to Clerk sign-up with the invitation ticket
      router.replace(`/sign-up?__clerk_ticket=${token}`);
    }
  }, [isLoaded, token, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted">Redirecting...</p>
    </div>
  );
}
