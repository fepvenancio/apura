import type {
  AuthUser,
  LoginResponse,
  Organization,
  SignupData,
  QueryResult,
  PaginatedResponse,
  SavedQuery,
  Report,
  UsageInfo,
  ConnectorStatus,
  Dashboard,
  DashboardWidget,
  Schedule,
  SchemaTable,
  TeamMember,
  Invitation,
  ProfileUpdate,
  PasswordChange,
  BillingInfo,
  OrgSettings,
  MfaSetupResponse,
  MfaConfirmResponse,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://api.apura.xyz";

/** Shape returned by the backend auth endpoints before normalization. */
interface RawAuthResponse {
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  user?: {
    userId?: string;
    id?: string;
    email?: string;
    name?: string;
    orgId?: string;
    role?: string;
  };
  org?: {
    id?: string;
    name?: string;
    slug?: string;
    plan?: string;
    maxQueriesPerMonth?: number;
    queriesLimit?: number;
    agentApiKey?: string;
    agentApiKeyPrefix?: string;
  };
}

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    const msg = typeof body === "string" ? body : `API error ${status}`;
    super(msg);
    this.status = status;
    this.body = body;
  }
}

export class MfaRequiredError extends Error {
  mfaToken: string;

  constructor(mfaToken: string) {
    super("MFA verification required");
    this.name = "MfaRequiredError";
    this.mfaToken = mfaToken;
  }
}

export class MfaSetupRequiredError extends Error {
  constructor() {
    super("MFA setup required by organization");
    this.name = "MfaSetupRequiredError";
  }
}

class ApiClient {
  private accessToken: string | null = null;

  setToken(token: string) {
    this.accessToken = token;
  }

  clearToken() {
    this.accessToken = null;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.accessToken)
      headers["Authorization"] = `Bearer ${this.accessToken}`;

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401) {
      await this.refreshToken();
      const retryRes = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
          ...headers,
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!retryRes.ok) {
        const errBody = await retryRes.json().catch(() => ({}));
        throw new ApiError(retryRes.status, errBody);
      }
      const retryJson = await retryRes.json();
      return retryJson.data !== undefined ? retryJson.data : retryJson;
    }

    if (!res.ok) {
      const errBody: Record<string, unknown> = await res.json().catch(() => ({}));
      const errObj = errBody?.error as Record<string, unknown> | undefined;
      const msg = (typeof errObj?.message === "string" ? errObj.message : null) || `API error ${res.status}`;
      throw new ApiError(res.status, msg);
    }
    const json = await res.json();
    return json.data !== undefined ? json.data : json;
  }

  // Normalize backend auth response to frontend LoginResponse shape
  private normalizeAuthResponse(raw: RawAuthResponse): LoginResponse {
    const user: AuthUser = {
      id: raw.user?.userId || raw.user?.id || "",
      email: raw.user?.email || "",
      name: raw.user?.name || raw.user?.email?.split("@")[0] || "",
      orgId: raw.user?.orgId || "",
      role: raw.user?.role || "viewer",
    };
    const org: Organization = {
      id: raw.org?.id || "",
      name: raw.org?.name || "",
      slug: raw.org?.slug || "",
      plan: raw.org?.plan || "trial",
      queriesLimit: raw.org?.maxQueriesPerMonth || raw.org?.queriesLimit || 0,
    };
    return {
      accessToken: raw.accessToken || "",
      refreshToken: raw.refreshToken || "",
      user,
      org,
    };
  }

  private persistAuth(result: LoginResponse) {
    this.accessToken = result.accessToken;
    if (typeof window !== "undefined") {
      localStorage.setItem("accessToken", result.accessToken);
      localStorage.setItem("refreshToken", result.refreshToken);
      localStorage.setItem("user", JSON.stringify(result.user));
      localStorage.setItem("org", JSON.stringify(result.org));
    }
  }

  // Auth
  async signup(data: SignupData): Promise<LoginResponse> {
    const raw = await this.request<RawAuthResponse>("POST", "/auth/signup", {
      email: data.email,
      password: data.password,
      name: data.name,
      organizationName: data.orgName,
      slug: data.slug,
    });
    const result = this.normalizeAuthResponse(raw);
    this.persistAuth(result);
    return result;
  }

  async login(email: string, password: string): Promise<LoginResponse & { mfaSetupRequired?: boolean }> {
    const raw = await this.request<RawAuthResponse & { mfaRequired?: boolean; mfaToken?: string; mfaSetupRequired?: boolean }>(
      "POST",
      "/auth/login",
      { email, password }
    );
    if (raw.mfaRequired && raw.mfaToken) {
      throw new MfaRequiredError(raw.mfaToken);
    }
    const result = this.normalizeAuthResponse(raw);
    this.persistAuth(result);
    if (raw.mfaSetupRequired) {
      return { ...result, mfaSetupRequired: true };
    }
    return result;
  }

  async refreshToken(): Promise<void> {
    if (typeof window === "undefined") return;
    const refreshToken = localStorage.getItem("refreshToken");
    if (!refreshToken) throw new ApiError(401, { message: "No refresh token" });

    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("user");
      localStorage.removeItem("org");
      throw new ApiError(401, { message: "Refresh failed" });
    }

    const json = await res.json();
    const inner = json.data || json;
    this.accessToken = inner.accessToken;
    localStorage.setItem("accessToken", inner.accessToken);
    if (inner.refreshToken) {
      localStorage.setItem("refreshToken", inner.refreshToken);
    }
  }

  // Queries
  async executeQuery(naturalLanguage: string): Promise<QueryResult> {
    return this.request<QueryResult>("POST", "/queries", { naturalLanguage });
  }

  async getQueryHistory(page = 1): Promise<PaginatedResponse<SavedQuery>> {
    return this.request<PaginatedResponse<SavedQuery>>(
      "GET",
      `/queries?page=${page}`
    );
  }

  async getQuery(id: string): Promise<QueryResult> {
    return this.request<QueryResult>("GET", `/queries/${id}`);
  }

  // Reports
  async saveReport(data: {
    name: string;
    queryId: string;
    chartConfig?: Record<string, unknown>;
    layoutConfig?: Record<string, unknown>;
  }): Promise<Report> {
    return this.request<Report>("POST", "/reports", data);
  }

  async getReports(): Promise<Report[]> {
    return this.request<Report[]>("GET", "/reports");
  }

  async getReport(id: string): Promise<Report> {
    return this.request<Report>("GET", `/reports/${id}`);
  }

  async runReport(id: string): Promise<QueryResult> {
    return this.request<QueryResult>("POST", `/reports/${id}/run`);
  }

  async deleteReport(id: string): Promise<void> {
    return this.request<void>("DELETE", `/reports/${id}`);
  }

  // Org
  async getOrg(): Promise<Organization> {
    return this.request<Organization>("GET", "/org");
  }

  async getUsage(): Promise<UsageInfo> {
    return this.request<UsageInfo>("GET", "/org/usage");
  }

  async getConnectorStatus(): Promise<ConnectorStatus> {
    return this.request<ConnectorStatus>("GET", "/connector/status");
  }

  // Dashboards
  async getDashboards(): Promise<Dashboard[]> {
    return this.request<Dashboard[]>("GET", "/dashboards");
  }

  async getDashboard(id: string): Promise<Dashboard> {
    return this.request<Dashboard>("GET", `/dashboards/${id}`);
  }

  async createDashboard(data: { name: string; description?: string }): Promise<Dashboard> {
    return this.request<Dashboard>("POST", "/dashboards", data);
  }

  async updateDashboard(id: string, data: Partial<Dashboard>): Promise<Dashboard> {
    return this.request<Dashboard>("PATCH", `/dashboards/${id}`, data);
  }

  async deleteDashboard(id: string): Promise<void> {
    return this.request<void>("DELETE", `/dashboards/${id}`);
  }

  async addWidget(dashboardId: string, data: { reportId: string; x: number; y: number; w: number; h: number }): Promise<DashboardWidget> {
    return this.request<DashboardWidget>("POST", `/dashboards/${dashboardId}/widgets`, data);
  }

  async removeWidget(dashboardId: string, widgetId: string): Promise<void> {
    return this.request<void>("DELETE", `/dashboards/${dashboardId}/widgets/${widgetId}`);
  }

  // Schedules
  async getSchedules(): Promise<Schedule[]> {
    return this.request<Schedule[]>("GET", "/schedules");
  }

  async createSchedule(data: {
    reportId: string;
    cron: string;
    timezone: string;
  }): Promise<Schedule> {
    return this.request<Schedule>("POST", "/schedules", data);
  }

  async updateSchedule(id: string, data: Partial<Schedule>): Promise<Schedule> {
    return this.request<Schedule>("PATCH", `/schedules/${id}`, data);
  }

  async deleteSchedule(id: string): Promise<void> {
    return this.request<void>("DELETE", `/schedules/${id}`);
  }

  async triggerSchedule(id: string): Promise<void> {
    return this.request<void>("POST", `/schedules/${id}/trigger`);
  }

  // Schema
  async getSchema(): Promise<SchemaTable[]> {
    return this.request<SchemaTable[]>("GET", "/schema/tables");
  }

  async getSchemaTable(name: string): Promise<SchemaTable> {
    return this.request<SchemaTable>("GET", `/schema/tables/${encodeURIComponent(name)}`);
  }

  async getSchemaCategories(): Promise<string[]> {
    return this.request<string[]>("GET", "/schema/categories");
  }

  // Team
  async getTeamMembers(): Promise<TeamMember[]> {
    return this.request<TeamMember[]>("GET", "/org/members");
  }

  async removeMember(id: string): Promise<void> {
    return this.request<void>("DELETE", `/org/members/${id}`);
  }

  async updateMemberRole(id: string, role: string): Promise<void> {
    return this.request<void>("PATCH", `/org/members/${id}`, { role });
  }

  async getInvitations(): Promise<Invitation[]> {
    return this.request<Invitation[]>("GET", "/org/invitations");
  }

  async sendInvitation(data: { email: string; role: string }): Promise<Invitation> {
    return this.request<Invitation>("POST", "/org/invitations", data);
  }

  async revokeInvitation(id: string): Promise<void> {
    return this.request<void>("DELETE", `/org/invitations/${id}`);
  }

  async acceptInvitation(token: string, data: { name: string; password: string }): Promise<LoginResponse> {
    const result = await this.request<LoginResponse>("POST", `/auth/accept-invite/${token}`, data);
    this.accessToken = result.accessToken;
    if (typeof window !== "undefined") {
      localStorage.setItem("accessToken", result.accessToken);
      localStorage.setItem("refreshToken", result.refreshToken);
      localStorage.setItem("user", JSON.stringify(result.user));
      localStorage.setItem("org", JSON.stringify(result.org));
    }
    return result;
  }

  // Profile
  async updateProfile(data: ProfileUpdate): Promise<void> {
    return this.request<void>("PATCH", "/auth/profile", data);
  }

  async changePassword(data: PasswordChange): Promise<void> {
    return this.request<void>("POST", "/auth/change-password", data);
  }

  async forgotPassword(email: string): Promise<void> {
    return this.request<void>("POST", "/auth/forgot-password", { email });
  }

  async resetPassword(token: string, password: string): Promise<void> {
    return this.request<void>("POST", "/auth/reset-password", { token, password });
  }

  async verifyEmail(token: string): Promise<void> {
    return this.request<void>("POST", "/auth/verify-email", { token });
  }

  // Billing
  async getBilling(): Promise<BillingInfo> {
    return this.request<BillingInfo>("GET", "/api/billing");
  }

  async createCheckout(priceId: string): Promise<{ url: string }> {
    return this.request<{ url: string }>("POST", "/api/billing/checkout", { priceId });
  }

  async createPortalSession(): Promise<{ url: string }> {
    return this.request<{ url: string }>("POST", "/api/billing/portal");
  }

  // Org settings
  async getOrgSettings(): Promise<OrgSettings> {
    return this.request<OrgSettings>("GET", "/org/settings");
  }

  async updateOrgSettings(data: Partial<OrgSettings>): Promise<OrgSettings> {
    return this.request<OrgSettings>("PATCH", "/org/settings", data);
  }

  // Report update
  async updateReport(id: string, data: Partial<Report>): Promise<Report> {
    return this.request<Report>("PATCH", `/reports/${id}`, data);
  }

  // MFA
  async setupMfa(): Promise<MfaSetupResponse> {
    return this.request<MfaSetupResponse>("POST", "/api/mfa/setup");
  }

  async confirmMfa(code: string): Promise<MfaConfirmResponse> {
    return this.request<MfaConfirmResponse>("POST", "/api/mfa/confirm", { code });
  }

  async verifyMfa(mfaToken: string, code: string): Promise<LoginResponse> {
    const raw = await this.request<RawAuthResponse>("POST", "/auth/mfa/verify", {
      mfaToken,
      code,
    });
    const result = this.normalizeAuthResponse(raw);
    this.persistAuth(result);
    return result;
  }

  async disableMfa(code: string): Promise<void> {
    return this.request<void>("POST", "/api/mfa/disable", { code });
  }

  async resetUserMfa(userId: string): Promise<void> {
    return this.request<void>("DELETE", `/api/mfa/reset/${userId}`);
  }

  async updateOrgMfaRequired(required: boolean): Promise<OrgSettings> {
    return this.request<OrgSettings>("PATCH", "/org/settings", {
      mfa_required: required ? 1 : 0,
    });
  }

  // GDPR
  async requestDataExport(): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>("POST", "/api/gdpr/export");
  }

  async requestAccountDeletion(): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>("DELETE", "/api/gdpr/erasure");
  }
}

export const api = new ApiClient();
