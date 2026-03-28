import { Hono } from 'hono'
import { Webhook } from 'svix'

type Env = {
  DB: D1Database
  CLERK_WEBHOOK_SECRET: string
}

const webhooks = new Hono<{ Bindings: Env }>()

webhooks.post('/clerk', async (c) => {
  const webhookSecret = c.env.CLERK_WEBHOOK_SECRET
  if (!webhookSecret) {
    return c.json({ error: 'Webhook secret not configured' }, 500)
  }

  const svixId = c.req.header('svix-id')
  const svixTimestamp = c.req.header('svix-timestamp')
  const svixSignature = c.req.header('svix-signature')

  if (!svixId || !svixTimestamp || !svixSignature) {
    return c.json({ error: 'Missing Svix headers' }, 400)
  }

  const body = await c.req.text()

  let payload: WebhookEvent
  try {
    const wh = new Webhook(webhookSecret)
    payload = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as WebhookEvent
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return c.json({ error: 'Invalid webhook signature' }, 400)
  }

  const { type, data } = payload

  try {
    switch (type) {
      case 'user.created':
      case 'user.updated': {
        const user = data as UserData
        const email = user.email_addresses?.[0]?.email_address ?? ''
        const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || email
        await c.env.DB.prepare(
          `INSERT INTO users (clerk_id, email, name, created_at, updated_at)
           VALUES (?, ?, ?, datetime('now'), datetime('now'))
           ON CONFLICT(clerk_id) DO UPDATE SET
             email = excluded.email,
             name = excluded.name,
             updated_at = datetime('now')`
        ).bind(user.id, email, name).run()
        break
      }
      case 'user.deleted': {
        const user = data as { id: string }
        await c.env.DB.prepare(
          `UPDATE users SET deleted_at = datetime('now') WHERE clerk_id = ?`
        ).bind(user.id).run()
        break
      }
      case 'organization.created':
      case 'organization.updated': {
        const org = data as OrgData
        await c.env.DB.prepare(
          `INSERT INTO organizations (clerk_org_id, name, slug, created_at, updated_at)
           VALUES (?, ?, ?, datetime('now'), datetime('now'))
           ON CONFLICT(clerk_org_id) DO UPDATE SET
             name = excluded.name,
             slug = excluded.slug,
             updated_at = datetime('now')`
        ).bind(org.id, org.name, org.slug ?? null).run()
        break
      }
      case 'organization.deleted': {
        const org = data as { id: string }
        await c.env.DB.prepare(
          `UPDATE organizations SET deleted_at = datetime('now') WHERE clerk_org_id = ?`
        ).bind(org.id).run()
        break
      }
      default:
        console.log('Unhandled webhook event:', type)
    }
  } catch (err) {
    console.error('Error processing webhook:', type, err)
    return c.json({ error: 'Internal error' }, 500)
  }

  return c.json({ success: true })
})

interface WebhookEvent { type: string; data: unknown }
interface UserData {
  id: string
  email_addresses: Array<{ email_address: string }>
  first_name: string | null
  last_name: string | null
}
interface OrgData { id: string; name: string; slug: string | null }

export { webhooks }
