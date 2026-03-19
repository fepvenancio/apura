import { Hono } from 'hono';
import type { Env, AppVariables } from '../types';
import { requireRole } from '../middleware/auth';
import { rateLimitMiddleware } from '../middleware/rate-limit';
import { OrgDatabase } from '../services/org-db';

const dashboards = new Hono<{ Bindings: Env; Variables: AppVariables }>();

dashboards.use('*', rateLimitMiddleware);

// ---------------------------------------------------------------------------
// POST /api/dashboards — Create dashboard
// ---------------------------------------------------------------------------
dashboards.post('/', requireRole('owner', 'admin', 'analyst'), async (c) => {
  const userId = c.get('userId');
  const orgId = c.get('orgId');
  const orgDb = new OrgDatabase(c.env.DB, orgId);

  const body = await c.req.json<{
    name: string;
    layout?: string;
    isShared?: boolean;
  }>();

  if (!body.name) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'name is required' } }, 400);
  }

  const id = await orgDb.createDashboard({
    user_id: userId,
    name: body.name,
    layout: body.layout ?? null,
    is_shared: body.isShared ?? false,
  });

  await orgDb.logAudit('dashboard.create', 'dashboard', id, { name: body.name }, c.req.header('CF-Connecting-IP'));

  const dashboard = await orgDb.getDashboard(id);
  return c.json({ success: true, data: dashboard }, 201);
});

// ---------------------------------------------------------------------------
// GET /api/dashboards — List dashboards
// ---------------------------------------------------------------------------
dashboards.get('/', async (c) => {
  const orgId = c.get('orgId');
  const orgDb = new OrgDatabase(c.env.DB, orgId);

  const items = await orgDb.listDashboards();
  return c.json({ success: true, data: { items, total: items.length } });
});

// ---------------------------------------------------------------------------
// GET /api/dashboards/:id — Get dashboard with widgets
// ---------------------------------------------------------------------------
dashboards.get('/:id', async (c) => {
  const orgId = c.get('orgId');
  const dashboardId = c.req.param('id');
  const orgDb = new OrgDatabase(c.env.DB, orgId);

  const dashboard = await orgDb.getDashboard(dashboardId);
  if (!dashboard) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Dashboard not found' } }, 404);
  }

  const widgets = await orgDb.listWidgets(dashboardId);

  return c.json({ success: true, data: { ...dashboard, widgets } });
});

// ---------------------------------------------------------------------------
// PUT /api/dashboards/:id — Update dashboard
// ---------------------------------------------------------------------------
dashboards.put('/:id', requireRole('owner', 'admin', 'analyst'), async (c) => {
  const orgId = c.get('orgId');
  const dashboardId = c.req.param('id');
  const orgDb = new OrgDatabase(c.env.DB, orgId);

  const existing = await orgDb.getDashboard(dashboardId);
  if (!existing) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Dashboard not found' } }, 404);
  }

  const body = await c.req.json<{
    name?: string;
    layout?: string;
    isShared?: boolean;
  }>();

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.layout !== undefined) updates.layout = body.layout;
  if (body.isShared !== undefined) updates.is_shared = body.isShared ? 1 : 0;

  await orgDb.updateDashboard(dashboardId, updates);
  await orgDb.logAudit('dashboard.update', 'dashboard', dashboardId, updates, c.req.header('CF-Connecting-IP'));

  const updated = await orgDb.getDashboard(dashboardId);
  return c.json({ success: true, data: updated });
});

// ---------------------------------------------------------------------------
// DELETE /api/dashboards/:id — Delete dashboard + widgets
// ---------------------------------------------------------------------------
dashboards.delete('/:id', requireRole('owner', 'admin'), async (c) => {
  const orgId = c.get('orgId');
  const dashboardId = c.req.param('id');
  const orgDb = new OrgDatabase(c.env.DB, orgId);

  const existing = await orgDb.getDashboard(dashboardId);
  if (!existing) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Dashboard not found' } }, 404);
  }

  await orgDb.deleteDashboard(dashboardId);
  await orgDb.logAudit('dashboard.delete', 'dashboard', dashboardId, { name: existing.name }, c.req.header('CF-Connecting-IP'));

  return c.json({ success: true, data: { deleted: true } });
});

// ---------------------------------------------------------------------------
// POST /api/dashboards/:id/widgets — Add widget
// ---------------------------------------------------------------------------
dashboards.post('/:id/widgets', requireRole('owner', 'admin', 'analyst'), async (c) => {
  const orgId = c.get('orgId');
  const dashboardId = c.req.param('id');
  const orgDb = new OrgDatabase(c.env.DB, orgId);

  const dashboard = await orgDb.getDashboard(dashboardId);
  if (!dashboard) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Dashboard not found' } }, 404);
  }

  const body = await c.req.json<{
    reportId: string;
    positionX?: number;
    positionY?: number;
    width?: number;
    height?: number;
  }>();

  if (!body.reportId) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'reportId is required' } }, 400);
  }

  const report = await orgDb.getReport(body.reportId);
  if (!report) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Report not found' } }, 404);
  }

  const widgetId = await orgDb.addWidget({
    dashboard_id: dashboardId,
    report_id: body.reportId,
    position_x: body.positionX ?? 0,
    position_y: body.positionY ?? 0,
    width: body.width ?? 6,
    height: body.height ?? 4,
  });

  const widget = await orgDb.getWidget(widgetId, dashboardId);
  return c.json({ success: true, data: widget }, 201);
});

// ---------------------------------------------------------------------------
// PUT /api/dashboards/:id/widgets/:widgetId — Update widget
// ---------------------------------------------------------------------------
dashboards.put('/:id/widgets/:widgetId', requireRole('owner', 'admin', 'analyst'), async (c) => {
  const orgId = c.get('orgId');
  const dashboardId = c.req.param('id');
  const widgetId = c.req.param('widgetId');
  const orgDb = new OrgDatabase(c.env.DB, orgId);

  const dashboard = await orgDb.getDashboard(dashboardId);
  if (!dashboard) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Dashboard not found' } }, 404);
  }

  const existing = await orgDb.getWidget(widgetId, dashboardId);
  if (!existing) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Widget not found' } }, 404);
  }

  const body = await c.req.json<{
    positionX?: number;
    positionY?: number;
    width?: number;
    height?: number;
  }>();

  const updates: Record<string, unknown> = {};
  if (body.positionX !== undefined) updates.position_x = body.positionX;
  if (body.positionY !== undefined) updates.position_y = body.positionY;
  if (body.width !== undefined) updates.width = body.width;
  if (body.height !== undefined) updates.height = body.height;

  await orgDb.updateWidget(widgetId, dashboardId, updates);

  const updated = await orgDb.getWidget(widgetId, dashboardId);
  return c.json({ success: true, data: updated });
});

// ---------------------------------------------------------------------------
// DELETE /api/dashboards/:id/widgets/:widgetId — Remove widget
// ---------------------------------------------------------------------------
dashboards.delete('/:id/widgets/:widgetId', requireRole('owner', 'admin'), async (c) => {
  const orgId = c.get('orgId');
  const dashboardId = c.req.param('id');
  const widgetId = c.req.param('widgetId');
  const orgDb = new OrgDatabase(c.env.DB, orgId);

  const dashboard = await orgDb.getDashboard(dashboardId);
  if (!dashboard) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Dashboard not found' } }, 404);
  }

  const existing = await orgDb.getWidget(widgetId, dashboardId);
  if (!existing) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Widget not found' } }, 404);
  }

  await orgDb.deleteWidget(widgetId, dashboardId);
  return c.json({ success: true, data: { deleted: true } });
});

export default dashboards;
