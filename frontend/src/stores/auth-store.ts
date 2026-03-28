"use client";

import { useAuth, useUser, useOrganization, useClerk } from "@clerk/nextjs";
import type { AuthUser, Organization } from "@/lib/types";

interface AuthStoreState {
  user: AuthUser | null;
  org: Organization | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  logout: () => void;
}

export function useAuthStore(): AuthStoreState {
  const { isSignedIn, isLoaded: authLoaded, orgId, orgRole } = useAuth();
  const { user: clerkUser, isLoaded: userLoaded } = useUser();
  const { organization, isLoaded: orgLoaded } = useOrganization();
  const { signOut } = useClerk();

  const isLoading = !authLoaded || !userLoaded || !orgLoaded;

  const user: AuthUser | null =
    isSignedIn && clerkUser
      ? {
          id: clerkUser.id,
          email: clerkUser.emailAddresses[0]?.emailAddress ?? "",
          name:
            [clerkUser.firstName, clerkUser.lastName]
              .filter(Boolean)
              .join(" ") || clerkUser.emailAddresses[0]?.emailAddress?.split("@")[0] || "",
          orgId: orgId ?? "",
          role: orgRole?.replace("org:", "") ?? "member",
          language:
            (clerkUser.unsafeMetadata?.language as string) ?? "pt",
        }
      : null;

  const org: Organization | null =
    isSignedIn && organization
      ? {
          id: organization.id,
          name: organization.name,
          slug: organization.slug ?? "",
          plan: (organization.publicMetadata?.plan as string) ?? "trial",
          queriesLimit:
            (organization.publicMetadata?.queriesLimit as number) ?? 0,
        }
      : null;

  const logout = () => {
    signOut();
  };

  return {
    user,
    org,
    isAuthenticated: !!isSignedIn,
    isLoading,
    logout,
  };
}
