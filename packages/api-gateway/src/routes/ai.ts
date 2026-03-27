import { Hono } from 'hono';
import type { Env, AppVariables } from '../types';
import type { GenerateSqlRequest } from '../services/ai/types';
import { QueryOrchestrator, OrchestratorError } from '../services/ai/orchestrator';
import { classifyQuery } from '../services/ai/query-classifier';

const ai = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// ─── Generate SQL from natural language ─────────────────────────────────

ai.post('/generate', async (c) => {
  try {
    const body = await c.req.json<GenerateSqlRequest>();

    if (!body.naturalLanguage || !body.orgId) {
      return c.json(
        { error: 'Missing required fields: naturalLanguage, orgId' },
        400,
      );
    }

    const orchestrator = new QueryOrchestrator(c.env);
    const result = await orchestrator.processQuery(body);
    return c.json(result);
  } catch (err) {
    if (err instanceof OrchestratorError) {
      return c.json({ error: err.message }, err.statusCode as 400);
    }

    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('Generate error:', message);
    return c.json({ error: message }, 500);
  }
});

// ─── Classify a query (for UI suggestions) ──────────────────────────────

ai.post('/classify', async (c) => {
  try {
    const { naturalLanguage } = await c.req.json<{ naturalLanguage: string }>();

    if (!naturalLanguage) {
      return c.json({ error: 'Missing required field: naturalLanguage' }, 400);
    }

    const categories = classifyQuery(naturalLanguage);
    return c.json({ categories });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('Classify error:', message);
    return c.json({ error: message }, 500);
  }
});

export default ai;
