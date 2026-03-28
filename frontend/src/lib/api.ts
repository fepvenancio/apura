import type {
  QueryResult,
  PaginatedResponse,
  SavedQuery,
  Report,
  UsageInfo,
  ConnectorStatus,
  Dashboard,
  DashboardWidget,
  Schedule,
  ScheduleRun,
  SchemaTable,
  TeamMember,
  Invitation,
  ProfileUpdate,
  BillingInfo,
  OrgSettings,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://apura-api.stela-app.workers.dev";

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

class ApiClient {
  private tokenGetter: (() => Promise<string | null>) | null = null;

  setTokenGetter(getter: (() => Promise<string | null>) | null) {
    this.tokenGetter = getter;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.tokenGetter) {
      const token = await this.tokenGetter();
      if (token) headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const errBody: Record<string, unknown> = await res.json().catch(() => ({}));
      const errObj = errBody?.error as Record<string, unknown> | undefined;
      const msg = (typeof errObj?.message === "string" ? errObj.message : null) || `API error ${res.status}`;
      throw new ApiError(res.status, msg);
    }
    const json = await res.json();
    return json.data !== undefined ? json.data : json;
  }

  // Queries
  async executeQuery(naturalLanguage: string): Promise<QueryResult> {
    return this.request<QueryResult>("POST", "/api/queries", { naturalLanguage });
  }

  async getQueryHistory(page = 1): Promise<PaginatedResponse<SavedQuery>> {
    return this.request<PaginatedResponse<SavedQuery>>(
      "GET",
      `/api/queries?page=${page}`
    );
  }

  async getQuery(id: string): Promise<QueryResult> {
    return this.request<QueryResult>("GET", `/api/queries/${id}`);
  }

  // Reports
  async saveReport(data: {
    name: string;
    queryId: string;
    chartConfig?: Record<string, unknown>;
    layoutConfig?: Record<string, unknown>;
  }): Promise<Report> {
    return this.request<Report>("POST", "/api/reports", data);
  }

  async getReports(): Promise<Report[]> {
    const res = await this.request<{ items: Report[] }>("GET", "/api/reports");
    return (res as unknown as { items?: Report[] })?.items ?? [];
  }

  async getReport(id: string): Promise<Report> {
    return this.request<Report>("GET", `/api/reports/${id}`);
  }

  async runReport(id: string): Promise<QueryResult> {
    return this.request<QueryResult>("POST", `/api/reports/${id}/run`);
  }

  async deleteReport(id: string): Promise<void> {
    return this.request<void>("DELETE", `/api/reports/${id}`);
  }

  async updateReport(id: string, data: Partial<Report>): Promise<Report> {
    return this.request<Report>("PATCH", `/api/reports/${id}`, data);
  }

  // Org
  async getOrg() {
    return this.request<OrgSettings>("GET", "/api/org");
  }

  async getUsage(): Promise<UsageInfo> {
    return this.request<UsageInfo>("GET", "/api/org/usage");
  }

  async getConnectorStatus(): Promise<ConnectorStatus> {
    return this.request<ConnectorStatus>("GET", "/api/org/connector-status");
  }

  async regenerateApiKey(): Promise<{ agentApiKey: string; agentApiKeyPrefix: string }> {
    return this.request<{ agentApiKey: string; agentApiKeyPrefix: string }>("POST", "/api/org/regenerate-api-key");
  }

  // Dashboards
  async getDashboards(): Promise<Dashboard[]> {
    const res = await this.request<{ items: Dashboard[] }>("GET", "/api/dashboards");
    return (res as unknown as { items?: Dashboard[] })?.items ?? [];
  }

  async getDashboard(id: string): Promise<Dashboard> {
    return this.request<Dashboard>("GET", `/api/dashboards/${id}`);
  }

  async createDashboard(data: { name: string; description?: string }): Promise<Dashboard> {
    return this.request<Dashboard>("POST", "/api/dashboards", data);
  }

  async updateDashboard(id: string, data: Partial<Dashboard>): Promise<Dashboard> {
    return this.request<Dashboard>("PATCH", `/api/dashboards/${id}`, data);
  }

  async deleteDashboard(id: string): Promise<void> {
    return this.request<void>("DELETE", `/api/dashboards/${id}`);
  }

  async addWidget(dashboardId: string, data: { reportId: string; x: number; y: number; w: number; h: number }): Promise<DashboardWidget> {
    return this.request<DashboardWidget>("POST", `/api/dashboards/${dashboardId}/widgets`, data);
  }

  async removeWidget(dashboardId: string, widgetId: string): Promise<void> {
    return this.request<void>("DELETE", `/api/dashboards/${dashboardId}/widgets/${widgetId}`);
  }

  // Schedules
  async getSchedules(): Promise<Schedule[]> {
    const res = await this.request<{ items: Schedule[] }>("GET", "/api/schedules");
    return (res as unknown as { items?: Schedule[] })?.items ?? [];
  }

  async createSchedule(data: {
    reportId: string;
    cronExpression: string;
    timezone: string;
    outputFormat?: string;
    recipients?: string[];
  }): Promise<Schedule> {
    return this.request<Schedule>("POST", "/api/schedules", data);
  }

  async updateSchedule(id: string, data: Partial<Schedule>): Promise<Schedule> {
    return this.request<Schedule>("PATCH", `/api/schedules/${id}`, data);
  }

  async deleteSchedule(id: string): Promise<void> {
    return this.request<void>("DELETE", `/api/schedules/${id}`);
  }

  async triggerSchedule(id: string): Promise<void> {
    return this.request<void>("POST", `/api/schedules/${id}/trigger`);
  }

  async getScheduleRuns(scheduleId: string): Promise<ScheduleRun[]> {
    const res = await this.request<{ items: ScheduleRun[] }>("GET", `/api/schedules/${scheduleId}/runs`);
    return (res as unknown as { items?: ScheduleRun[] })?.items ?? [];
  }

  downloadScheduleRun(scheduleId: string, runId: string): void {
    const url = `${API_BASE}/api/schedules/${scheduleId}/runs/${runId}/download`;
    window.open(url, "_blank");
  }

  // Schema
  async getSchema(): Promise<SchemaTable[]> {
    return this.request<SchemaTable[]>("GET", "/api/schema/tables");
  }

  async getSchemaTable(name: string): Promise<SchemaTable> {
    return this.request<SchemaTable>("GET", `/api/schema/tables/${encodeURIComponent(name)}`);
  }

  async getSchemaCategories(): Promise<string[]> {
    return this.request<string[]>("GET", "/api/schema/categories");
  }

  // Team
  async getTeamMembers(): Promise<TeamMember[]> {
    const res = await this.request<{ items: TeamMember[] }>("GET", "/api/org/users");
    return (res as unknown as { items?: TeamMember[] })?.items ?? (Array.isArray(res) ? res : []);
  }

  async removeMember(id: string): Promise<void> {
    return this.request<void>("DELETE", `/api/org/users/${id}`);
  }

  async updateMemberRole(id: string, role: string): Promise<void> {
    return this.request<void>("PUT", `/api/org/users/${id}`, { role });
  }

  async getInvitations(): Promise<Invitation[]> {
    const res = await this.request<Invitation[] | { items: Invitation[] }>("GET", "/api/org/invitations");
    if (Array.isArray(res)) return res;
    return (res as { items?: Invitation[] })?.items ?? [];
  }

  async sendInvitation(data: { email: string; role: string }): Promise<Invitation> {
    return this.request<Invitation>("POST", "/api/org/invitations", data);
  }

  async revokeInvitation(id: string): Promise<void> {
    return this.request<void>("DELETE", `/api/org/invitations/${id}`);
  }

  // Profile
  async updateProfile(data: ProfileUpdate): Promise<void> {
    return this.request<void>("PATCH", "/auth/profile", data);
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
    return this.request<OrgSettings>("GET", "/api/org");
  }

  async updateOrgSettings(data: Partial<OrgSettings>): Promise<OrgSettings> {
    return this.request<OrgSettings>("PUT", "/api/org", data);
  }

  async updateOrgMfaRequired(required: boolean): Promise<OrgSettings> {
    return this.request<OrgSettings>("PATCH", "/api/org/settings", {
      mfa_required: required ? 1 : 0,
    });
  }

  async resetUserMfa(userId: string): Promise<void> {
    return this.request<void>("DELETE", `/api/mfa/reset/${userId}`);
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
