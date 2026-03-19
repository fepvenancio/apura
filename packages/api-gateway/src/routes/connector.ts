import { Hono } from 'hono';
import type { Env, AppVariables } from '../types';

const connector = new Hono<{ Bindings: Env; Variables: AppVariables }>();

/**
 * GET / - Returns the latest connector version info.
 * This endpoint is public (no auth required) so connectors can check for updates.
 */
connector.get('/version', (c) => {
  return c.json({
    latestVersion: '1.0.0',
    downloadUrl: 'https://releases.apura.xyz/connector/ApuraConnector-1.0.0.msi',
    releaseNotes: 'Initial release',
    checksum: null,
    minVersion: '0.1.0',
  });
});

export default connector;
