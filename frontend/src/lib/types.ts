export interface AuthUser {
  id: string;
  email: string;
  name: string;
  orgId: string;
  role: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  queriesLimit: number;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
  org: Organization;
}

export interface SignupData {
  email: string;
  password: string;
  name: string;
  orgName: string;
  slug: string;
}

export interface QueryColumn {
  name: string;
  type: string;
}

export interface QueryResult {
  id: string;
  naturalLanguage: string;
  sql: string;
  explanation: string;
  columns: QueryColumn[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs: number;
  createdAt: string;
}

export interface SavedQuery {
  id: string;
  naturalLanguage: string;
  sql: string;
  rowCount: number;
  executionTimeMs: number;
  createdAt: string;
  status: "success" | "error";
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface Report {
  id: string;
  name: string;
  description?: string;
  queryId: string;
  chartConfig?: Record<string, unknown>;
  layoutConfig?: Record<string, unknown>;
  lastRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UsageInfo {
  queriesUsed: number;
  queriesLimit: number;
  plan: string;
}

export interface ConnectorStatus {
  status: "connected" | "disconnected";
  lastHeartbeat?: string;
  agentApiKey?: string;
}

// Dashboards
export interface DashboardWidget {
  id: string;
  reportId: string;
  reportName: string;
  x: number;
  y: number;
  w: number;
  h: number;
  chartConfig?: Record<string, unknown>;
}

export interface Dashboard {
  id: string;
  name: string;
  description?: string;
  widgets: DashboardWidget[];
  shared: boolean;
  createdAt: string;
  updatedAt: string;
}

// Schedules
export interface Schedule {
  id: string;
  reportId: string;
  reportName: string;
  cron: string;
  timezone: string;
  enabled: boolean;
  nextRunAt?: string;
  lastRunAt?: string;
  lastRunStatus?: "success" | "error";
  createdAt: string;
  updatedAt: string;
}

// Schema
export interface SchemaColumn {
  name: string;
  type: string;
  nullable: boolean;
  description?: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  referencesTable?: string;
  referencesColumn?: string;
}

export interface SchemaTable {
  name: string;
  category: string;
  description?: string;
  rowCount?: number;
  columns: SchemaColumn[];
}

// Team / Invitations
export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "member" | "viewer";
  joinedAt: string;
}

export interface Invitation {
  id: string;
  email: string;
  role: "admin" | "member" | "viewer";
  status: "pending" | "accepted" | "expired";
  createdAt: string;
  expiresAt: string;
}

// Profile
export interface ProfileUpdate {
  name?: string;
  language?: string;
}

export interface PasswordChange {
  currentPassword: string;
  newPassword: string;
}

// Billing
export interface BillingInfo {
  plan: string;
  queriesUsed: number;
  queriesLimit: number;
  membersUsed: number;
  membersLimit: number;
  billingEmail: string;
  currentPeriodEnd: string;
  subscriptionStatus: string | null; // 'trialing' | 'active' | 'past_due' | 'canceling' | 'canceled'
}

// Org settings
export interface OrgSettings {
  name: string;
  billingEmail: string;
  timezone: string;
  country: string;
}

// MFA
export interface MfaSetupResponse {
  qrCodeDataUrl: string;
  secret: string;
}

export interface MfaConfirmResponse {
  backupCodes: string[];
}

export interface MfaLoginResponse {
  mfaRequired: true;
  mfaToken: string;
}
