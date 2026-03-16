import type {
  LoginResponse,
  SignupData,
  QueryResult,
  PaginatedResponse,
  SavedQuery,
  Report,
  Organization,
  UsageInfo,
  ConnectorStatus,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://api.apura.xyz";

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`API error ${status}`);
    this.status = status;
    this.body = body;
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
      if (!retryRes.ok) throw new ApiError(retryRes.status, await retryRes.json());
      return retryRes.json();
    }

    if (!res.ok) throw new ApiError(res.status, await res.json());
    return res.json();
  }

  // Auth
  async signup(data: SignupData): Promise<LoginResponse> {
    const result = await this.request<LoginResponse>("POST", "/auth/signup", data);
    this.accessToken = result.accessToken;
    if (typeof window !== "undefined") {
      localStorage.setItem("accessToken", result.accessToken);
      localStorage.setItem("refreshToken", result.refreshToken);
      localStorage.setItem("user", JSON.stringify(result.user));
      localStorage.setItem("org", JSON.stringify(result.org));
    }
    return result;
  }

  async login(email: string, password: string): Promise<LoginResponse> {
    const result = await this.request<LoginResponse>("POST", "/auth/login", {
      email,
      password,
    });
    this.accessToken = result.accessToken;
    if (typeof window !== "undefined") {
      localStorage.setItem("accessToken", result.accessToken);
      localStorage.setItem("refreshToken", result.refreshToken);
      localStorage.setItem("user", JSON.stringify(result.user));
      localStorage.setItem("org", JSON.stringify(result.org));
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

    const data = await res.json();
    this.accessToken = data.accessToken;
    localStorage.setItem("accessToken", data.accessToken);
    if (data.refreshToken) {
      localStorage.setItem("refreshToken", data.refreshToken);
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
}

export const api = new ApiClient();
