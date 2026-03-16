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
