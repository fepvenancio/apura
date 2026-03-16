/** Roles available within an organization. */
export type UserRole = 'owner' | 'admin' | 'analyst' | 'viewer';

/** Claims embedded in every access-token JWT. */
export interface JWTPayload {
  /** User ID (subject). */
  sub: string;
  /** Organization ID. */
  org: string;
  /** User role within the organization. */
  role: UserRole;
  /** Unique token identifier (used for revocation). */
  jti: string;
  /** Issued-at timestamp (epoch seconds). */
  iat: number;
  /** Expiration timestamp (epoch seconds). */
  exp: number;
}

/** Authenticated user context attached to every request. */
export interface AuthUser {
  userId: string;
  orgId: string;
  role: UserRole;
  email: string;
}

/** POST /auth/signup request body. */
export interface SignupRequest {
  email: string;
  password: string;
  name: string;
  organizationName: string;
  slug: string;
  country?: string;
  timezone?: string;
}

/** POST /auth/login request body. */
export interface LoginRequest {
  email: string;
  password: string;
}

/** POST /auth/login response body. */
export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
}

/** POST /auth/refresh request body. */
export interface RefreshRequest {
  refreshToken: string;
}
