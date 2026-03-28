/**
 * auth-store.ts — Migrated to Clerk
 * Compatibility shim. Prefer Clerk hooks directly in new code.
 */
'use client'

import { useAuth, useUser, useOrganization } from '@clerk/nextjs'

/** @deprecated Prefer Clerk hooks directly (useAuth, useUser, useOrganization) */
export function useAuthStore() {
  const { isSignedIn, isLoaded: authLoaded, userId, orgId, orgRole, getToken } = useAuth()
  const { user, isLoaded: userLoaded } = useUser()
  const { organization } = useOrganization()

  return {
    isAuthenticated: isSignedIn ?? false,
    isLoading: !authLoaded || !userLoaded,
    userId: userId ?? null,
    user: user
      ? {
          id: userId ?? '',
          email: user.primaryEmailAddress?.emailAddress ?? '',
          name: user.fullName ?? user.firstName ?? '',
          imageUrl: user.imageUrl,
        }
      : null,
    organization: organization
      ? {
          id: orgId ?? '',
          name: organization.name,
          role: (orgRole ?? 'viewer').replace('org:', '') as 'owner' | 'admin' | 'analyst' | 'viewer',
          slug: organization.slug,
        }
      : null,
    getToken: () => getToken(),
    login: () => console.warn('Deprecated: use Clerk <SignIn /> component'),
    logout: () => console.warn('Deprecated: use <SignOutButton />'),
    clearError: () => {},
    error: null as string | null,
  }
}

export { useAuth, useUser, useOrganization } from '@clerk/nextjs'
