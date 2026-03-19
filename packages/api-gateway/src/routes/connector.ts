import { Hono } from 'hono';
import type { Env, AppVariables } from '../types';

const connector = new Hono<{ Bindings: Env; Variables: AppVariables }>();

/**
 * GET / - Returns the latest connector version info.
 * This endpoint is public (no auth required) so connectors can check for updates.
 */
connector.get('/version', (c) => {
  const baseUrl = new URL(c.req.url);
  const downloadUrl = `${baseUrl.protocol}//${baseUrl.host}/connector/download/ApuraConnector-1.0.0.msi`;
  return c.json({
    latestVersion: '1.0.0',
    downloadUrl,
    releaseNotes: 'Initial release',
    checksum: null,
    minVersion: '0.1.0',
  });
});

/**
 * GET /download/:filename - Serves the connector MSI from R2.
 * Public endpoint so customers can download the installer.
 */
connector.get('/download/:filename', async (c) => {
  const filename = c.req.param('filename');

  if (!filename.endsWith('.msi')) {
    return c.json({ error: 'Invalid file type' }, 400);
  }

  const object = await c.env.REPORTS_BUCKET.get(`connector/${filename}`);

  if (!object) {
    return c.json({ error: 'File not found' }, 404);
  }

  return new Response(object.body, {
    headers: {
      'Content-Type': 'application/x-msi',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(object.size),
      'Cache-Control': 'public, max-age=3600',
    },
  });
});

export default connector;
