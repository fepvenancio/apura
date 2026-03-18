import type { Organization, SavedQuery, Report, Dashboard, DashboardWidget, Schedule } from '@apura/shared';
import type { User } from '../types';

/**
 * Tenant-scoped database access layer.
 *
 * ALL D1 queries go through this class to enforce org_id isolation.
 * Every query MUST include `WHERE org_id = ?` bound to the constructor's orgId.
 */
export class OrgDatabase {
  // Column allowlists for dynamic update methods — prevents SQL injection via column names
  private static readonly ORG_COLUMNS = new Set(['name', 'slug', 'plan', 'billing_email', 'country', 'timezone', 'max_users', 'max_queries_per_month', 'queries_this_month', 'queries_month_reset', 'stripe_customer_id', 'stripe_subscription_id', 'subscription_status', 'current_period_end', 'mfa_required', 'updated_at']);
  private static readonly USER_COLUMNS = new Set(['name', 'email', 'role', 'password_hash', 'language', 'last_login_at', 'email_verified', 'mfa_enabled', 'totp_secret', 'updated_at']);
  private static readonly QUERY_COLUMNS = new Set(['natural_language', 'generated_sql', 'explanation', 'status', 'error_message', 'row_count', 'execution_time_ms', 'ai_model', 'ai_tokens_used', 'result_preview', 'completed_at']);
  private static readonly REPORT_COLUMNS = new Set(['name', 'description', 'natural_language', 'sql_query', 'chart_config', 'layout_config', 'is_shared', 'last_run_at', 'updated_at']);
  private static readonly DASHBOARD_COLUMNS = new Set(['name', 'layout', 'is_shared', 'updated_at']);
  private static readonly WIDGET_COLUMNS = new Set(['report_id', 'position_x', 'position_y', 'width', 'height', 'config']);
  private static readonly SCHEDULE_COLUMNS = new Set(['cron_expression', 'timezone', 'output_format', 'recipients', 'subject_template', 'body_template', 'is_active', 'last_run_at', 'next_run_at']);

  constructor(
    private db: D1Database,
    private orgId: string,
  ) {}

  // ---------------------------------------------------------------------------
  // Organizations
  // ---------------------------------------------------------------------------

  async getOrg(): Promise<Organization | null> {
    return this.db
      .prepare(
        'SELECT id, name, slug, plan, primavera_version, max_users, max_queries_per_month, queries_this_month, billing_email, country, timezone, stripe_customer_id, stripe_subscription_id, subscription_status, current_period_end, created_at, updated_at FROM organizations WHERE id = ?'
      )
      .bind(this.orgId)
      .first<Organization>();
  }

  async updateOrg(updates: Partial<Organization>): Promise<void> {
    const fields: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if (key === 'id' || key === 'created_at') continue; // Never update these
      if (!OrgDatabase.ORG_COLUMNS.has(key)) continue; // Column allowlist
      fields.push(`${key} = ?`);
      values.push(value);
    }

    if (fields.length === 0) return;

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(this.orgId);

    await this.db
      .prepare(`UPDATE organizations SET ${fields.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();
  }

  async incrementQueryCount(): Promise<void> {
    await this.db
      .prepare('UPDATE organizations SET queries_this_month = queries_this_month + 1, updated_at = ? WHERE id = ?')
      .bind(new Date().toISOString(), this.orgId)
      .run();
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  async createQuery(query: Partial<SavedQuery>): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `INSERT INTO queries (id, org_id, user_id, natural_language, generated_sql, explanation, status, row_count, execution_time_ms, error_message, cached, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        this.orgId,
        query.user_id ?? null,
        query.natural_language ?? '',
        query.generated_sql ?? '',
        query.explanation ?? '',
        query.status ?? 'pending',
        query.row_count ?? null,
        query.execution_time_ms ?? null,
        query.error_message ?? null,
        query.cached ? 1 : 0,
        now,
        now,
      )
      .run();

    return id;
  }

  async getQuery(queryId: string): Promise<SavedQuery | null> {
    return this.db
      .prepare('SELECT * FROM queries WHERE id = ? AND org_id = ?')
      .bind(queryId, this.orgId)
      .first<SavedQuery>();
  }

  async listQueries(page: number = 1, pageSize: number = 20): Promise<{ items: SavedQuery[]; total: number }> {
    const offset = (page - 1) * pageSize;

    const countResult = await this.db
      .prepare('SELECT COUNT(*) as total FROM queries WHERE org_id = ?')
      .bind(this.orgId)
      .first<{ total: number }>();

    const { results } = await this.db
      .prepare('SELECT * FROM queries WHERE org_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
      .bind(this.orgId, pageSize, offset)
      .all<SavedQuery>();

    return {
      items: results ?? [],
      total: countResult?.total ?? 0,
    };
  }

  async updateQuery(queryId: string, updates: Partial<SavedQuery>): Promise<void> {
    const fields: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if (key === 'id' || key === 'org_id' || key === 'created_at') continue;
      if (!OrgDatabase.QUERY_COLUMNS.has(key)) continue; // Column allowlist
      fields.push(`${key} = ?`);
      values.push(value);
    }

    if (fields.length === 0) return;

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(queryId);
    values.push(this.orgId);

    await this.db
      .prepare(`UPDATE queries SET ${fields.join(', ')} WHERE id = ? AND org_id = ?`)
      .bind(...values)
      .run();
  }

  // ---------------------------------------------------------------------------
  // Reports
  // ---------------------------------------------------------------------------

  async createReport(report: Partial<Report>): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `INSERT INTO reports (id, org_id, user_id, name, description, query_id, chart_config, layout_config, is_public, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        this.orgId,
        report.user_id ?? null,
        report.name ?? '',
        report.description ?? null,
        report.query_id ?? null,
        report.chart_config ?? null,
        report.layout_config ?? null,
        report.is_public ? 1 : 0,
        now,
        now,
      )
      .run();

    return id;
  }

  async getReport(reportId: string): Promise<Report | null> {
    return this.db
      .prepare('SELECT * FROM reports WHERE id = ? AND org_id = ?')
      .bind(reportId, this.orgId)
      .first<Report>();
  }

  async listReports(): Promise<Report[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM reports WHERE org_id = ? ORDER BY created_at DESC')
      .bind(this.orgId)
      .all<Report>();

    return results ?? [];
  }

  async updateReport(reportId: string, updates: Partial<Report>): Promise<void> {
    const fields: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if (key === 'id' || key === 'org_id' || key === 'created_at') continue;
      if (!OrgDatabase.REPORT_COLUMNS.has(key)) continue; // Column allowlist
      fields.push(`${key} = ?`);
      values.push(value);
    }

    if (fields.length === 0) return;

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(reportId);
    values.push(this.orgId);

    await this.db
      .prepare(`UPDATE reports SET ${fields.join(', ')} WHERE id = ? AND org_id = ?`)
      .bind(...values)
      .run();
  }

  async deleteReport(reportId: string): Promise<void> {
    await this.db
      .prepare('DELETE FROM reports WHERE id = ? AND org_id = ?')
      .bind(reportId, this.orgId)
      .run();
  }

  // ---------------------------------------------------------------------------
  // Dashboards
  // ---------------------------------------------------------------------------

  async createDashboard(dashboard: Partial<Dashboard>): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `INSERT INTO dashboards (id, org_id, user_id, name, layout, is_shared, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        this.orgId,
        dashboard.user_id ?? null,
        dashboard.name ?? '',
        dashboard.layout ?? null,
        dashboard.is_shared ? 1 : 0,
        now,
        now,
      )
      .run();

    return id;
  }

  async getDashboard(dashboardId: string): Promise<Dashboard | null> {
    return this.db
      .prepare('SELECT * FROM dashboards WHERE id = ? AND org_id = ?')
      .bind(dashboardId, this.orgId)
      .first<Dashboard>();
  }

  async listDashboards(): Promise<Dashboard[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM dashboards WHERE org_id = ? ORDER BY created_at DESC')
      .bind(this.orgId)
      .all<Dashboard>();

    return results ?? [];
  }

  async updateDashboard(dashboardId: string, updates: Partial<Dashboard>): Promise<void> {
    const fields: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if (key === 'id' || key === 'org_id' || key === 'created_at') continue;
      if (!OrgDatabase.DASHBOARD_COLUMNS.has(key)) continue;
      fields.push(`${key} = ?`);
      values.push(value);
    }

    if (fields.length === 0) return;

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(dashboardId);
    values.push(this.orgId);

    await this.db
      .prepare(`UPDATE dashboards SET ${fields.join(', ')} WHERE id = ? AND org_id = ?`)
      .bind(...values)
      .run();
  }

  async deleteDashboard(dashboardId: string): Promise<void> {
    // Delete widgets first (cascade)
    await this.db
      .prepare('DELETE FROM dashboard_widgets WHERE dashboard_id = ?')
      .bind(dashboardId)
      .run();

    await this.db
      .prepare('DELETE FROM dashboards WHERE id = ? AND org_id = ?')
      .bind(dashboardId, this.orgId)
      .run();
  }

  // ---------------------------------------------------------------------------
  // Dashboard Widgets
  // ---------------------------------------------------------------------------

  async addWidget(widget: Partial<DashboardWidget>): Promise<string> {
    const id = crypto.randomUUID();

    await this.db
      .prepare(
        `INSERT INTO dashboard_widgets (id, dashboard_id, report_id, position_x, position_y, width, height, config)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        widget.dashboard_id ?? null,
        widget.report_id ?? null,
        widget.position_x ?? 0,
        widget.position_y ?? 0,
        widget.width ?? 6,
        widget.height ?? 4,
        widget.config ?? null,
      )
      .run();

    return id;
  }

  async getWidget(widgetId: string): Promise<DashboardWidget | null> {
    return this.db
      .prepare('SELECT * FROM dashboard_widgets WHERE id = ?')
      .bind(widgetId)
      .first<DashboardWidget>();
  }

  async listWidgets(dashboardId: string): Promise<DashboardWidget[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM dashboard_widgets WHERE dashboard_id = ? ORDER BY position_y, position_x')
      .bind(dashboardId)
      .all<DashboardWidget>();

    return results ?? [];
  }

  async updateWidget(widgetId: string, updates: Partial<DashboardWidget>): Promise<void> {
    const fields: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if (key === 'id' || key === 'dashboard_id') continue;
      if (!OrgDatabase.WIDGET_COLUMNS.has(key)) continue;
      fields.push(`${key} = ?`);
      values.push(value);
    }

    if (fields.length === 0) return;

    values.push(widgetId);

    await this.db
      .prepare(`UPDATE dashboard_widgets SET ${fields.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();
  }

  async deleteWidget(widgetId: string): Promise<void> {
    await this.db
      .prepare('DELETE FROM dashboard_widgets WHERE id = ?')
      .bind(widgetId)
      .run();
  }

  // ---------------------------------------------------------------------------
  // Schedules
  // ---------------------------------------------------------------------------

  async createSchedule(schedule: Partial<Schedule>): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `INSERT INTO schedules (id, org_id, report_id, created_by, cron_expression, timezone, output_format, recipients, subject_template, body_template, is_active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        this.orgId,
        schedule.report_id ?? null,
        schedule.created_by ?? null,
        schedule.cron_expression ?? '',
        schedule.timezone ?? 'Europe/Lisbon',
        schedule.output_format ?? 'pdf',
        schedule.recipients ?? '[]',
        schedule.subject_template ?? null,
        schedule.body_template ?? null,
        schedule.is_active ?? 1,
        now,
      )
      .run();

    return id;
  }

  async getSchedule(scheduleId: string): Promise<Schedule | null> {
    return this.db
      .prepare('SELECT * FROM schedules WHERE id = ? AND org_id = ?')
      .bind(scheduleId, this.orgId)
      .first<Schedule>();
  }

  async listSchedules(): Promise<Schedule[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM schedules WHERE org_id = ? ORDER BY created_at DESC')
      .bind(this.orgId)
      .all<Schedule>();

    return results ?? [];
  }

  async updateSchedule(scheduleId: string, updates: Partial<Schedule>): Promise<void> {
    const fields: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if (key === 'id' || key === 'org_id' || key === 'created_at' || key === 'created_by') continue;
      if (!OrgDatabase.SCHEDULE_COLUMNS.has(key)) continue;
      fields.push(`${key} = ?`);
      values.push(value);
    }

    if (fields.length === 0) return;

    values.push(scheduleId);
    values.push(this.orgId);

    await this.db
      .prepare(`UPDATE schedules SET ${fields.join(', ')} WHERE id = ? AND org_id = ?`)
      .bind(...values)
      .run();
  }

  async deleteSchedule(scheduleId: string): Promise<void> {
    // Delete schedule runs first
    await this.db
      .prepare('DELETE FROM schedule_runs WHERE schedule_id = ?')
      .bind(scheduleId)
      .run();

    await this.db
      .prepare('DELETE FROM schedules WHERE id = ? AND org_id = ?')
      .bind(scheduleId, this.orgId)
      .run();
  }

  // ---------------------------------------------------------------------------
  // Users
  // ---------------------------------------------------------------------------

  async getUser(userId: string): Promise<User | null> {
    return this.db
      .prepare('SELECT * FROM users WHERE id = ? AND org_id = ?')
      .bind(userId, this.orgId)
      .first<User>();
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return this.db
      .prepare('SELECT * FROM users WHERE email = ? AND org_id = ?')
      .bind(email, this.orgId)
      .first<User>();
  }

  /**
   * Find a user by email across ALL orgs (for login).
   * This is an exception to the org-scoped pattern — used only during authentication.
   */
  async getUserByEmailGlobal(email: string): Promise<(User & { org_id: string }) | null> {
    return this.db
      .prepare('SELECT * FROM users WHERE email = ?')
      .bind(email)
      .first<User & { org_id: string }>();
  }

  async listUsers(): Promise<User[]> {
    const { results } = await this.db
      .prepare('SELECT id, org_id, email, name, role, created_at, updated_at FROM users WHERE org_id = ? ORDER BY created_at')
      .bind(this.orgId)
      .all<User>();

    return results ?? [];
  }

  async createUser(user: Partial<User>): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `INSERT INTO users (id, org_id, email, name, password_hash, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        this.orgId,
        user.email ?? '',
        user.name ?? '',
        user.password_hash ?? '',
        user.role ?? 'viewer',
        now,
        now,
      )
      .run();

    return id;
  }

  async updateUser(userId: string, updates: Partial<User>): Promise<void> {
    const fields: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if (key === 'id' || key === 'org_id' || key === 'created_at') continue;
      if (!OrgDatabase.USER_COLUMNS.has(key)) continue; // Column allowlist
      fields.push(`${key} = ?`);
      values.push(value);
    }

    if (fields.length === 0) return;

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(userId);
    values.push(this.orgId);

    await this.db
      .prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ? AND org_id = ?`)
      .bind(...values)
      .run();
  }

  async deleteUser(userId: string): Promise<void> {
    await this.db
      .prepare('DELETE FROM users WHERE id = ? AND org_id = ?')
      .bind(userId, this.orgId)
      .run();
  }

  // ---------------------------------------------------------------------------
  // Audit
  // ---------------------------------------------------------------------------

  async logAudit(
    action: string,
    resourceType?: string,
    resourceId?: string,
    details?: unknown,
    ipAddress?: string,
  ): Promise<void> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `INSERT INTO audit_log (id, org_id, action, resource_type, resource_id, details, ip_address, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        this.orgId,
        action,
        resourceType ?? null,
        resourceId ?? null,
        details ? JSON.stringify(details) : null,
        ipAddress ?? null,
        now,
      )
      .run();
  }
}
