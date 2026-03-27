# Apura - Development Guide

## Project Overview

AI-powered reporting platform for Primavera ERP. Users connect on-premise SQL Server databases via a Windows service connector and generate reports using natural language (Claude text-to-SQL).

## Architecture (3-worker model)

- **Frontend:** Next.js 15 + Tailwind (Cloudflare Pages at `apura.xyz`)
- **API Gateway (`apura-api`):** Hono on Cloudflare Workers (`api.apura.xyz`) — auth, REST API, queue producer
- **Worker (`apura-worker`):** Queue consumer — AI orchestration (Claude text-to-SQL), report generation (CSV/HTML), email delivery (Resend), scheduled tasks
- **WebSocket Gateway (`apura-ws`):** Cloudflare Durable Objects (`ws.apura.xyz`) — connector tunnel
- **Connector:** .NET 8 Windows Service + WiX MSI installer (on-premise)
- **Database:** Cloudflare D1 (SQLite)
- **Storage:** Cloudflare R2 (`apura-reports` bucket)
- **Monorepo:** npm workspaces + Turborepo

## Key Commands

```bash
# Frontend
cd frontend && npm run dev

# Workers (all)
npm run dev          # turbo dev
npm run build        # turbo build
npm run deploy       # turbo deploy

# Single worker deploy
cd packages/api-gateway && npx wrangler deploy
cd packages/worker && npx wrangler deploy
cd packages/ws-gateway && npx wrangler deploy

# Connector (.NET)
cd connector
dotnet restore ApuraConnector.sln
dotnet publish src/ApuraConnector.Service/ApuraConnector.Service.csproj -c Release -r win-x64 --self-contained true -o publish/
dotnet build src/ApuraConnector.Installer/ApuraConnector.Installer.wixproj -c Release
# MSI output: src/ApuraConnector.Installer/bin/Release/ApuraConnector.Installer.msi

# Upload MSI to R2
CLOUDFLARE_ACCOUNT_ID=616231e4ffa88bb203ec4cbedeab4a8e npx wrangler r2 object put apura-reports/connector/ApuraConnector-1.0.0.msi --file connector/src/ApuraConnector.Installer/bin/Release/ApuraConnector.Installer.msi --content-type "application/x-msi" --remote

# D1 Migrations
bash deploy/migrate.sh
```

## Working URLs

- **API (workers.dev):** https://apura-api.stela-app.workers.dev
- **Version check:** https://apura-api.stela-app.workers.dev/connector/version
- **MSI download:** https://apura-api.stela-app.workers.dev/connector/download/ApuraConnector-1.0.0.msi

## Cloudflare Account

- **Account ID:** `616231e4ffa88bb203ec4cbedeab4a8e`
- **Zone:** `apura.xyz` (zone ID: `8ccabbd0c17b96192c2d02af33cd2d06`)
- **Workers.dev subdomain:** `stela-app`

## Worker Secrets

```bash
# api-gateway
cd packages/api-gateway
npx wrangler secret put INTERNAL_SECRET   # shared secret for worker-to-worker auth
npx wrangler secret put JWT_SECRET        # JWT signing key for user auth

# worker (queue consumer)
cd packages/worker
npx wrangler secret put RESEND_API_KEY    # email delivery
npx wrangler secret put INTERNAL_SECRET   # worker-to-worker auth
```

## Queue Flow

```
api-gateway → REPORT_QUEUE → worker (report-generation consumer)
api-gateway → EMAIL_QUEUE  → worker (email-outbound consumer)
worker (report done) → EMAIL_QUEUE → worker (email-outbound consumer)
```

---

## Build & Test Status (2026-03-19)

- Connector MSI builds and installs correctly (304KB)
- Setup utility included in MSI for first-time configuration
- Service starts in "waiting for setup" mode if unconfigured (no more crashes)
- WebSocket tunnel tested: stable 40+ second connections to Apura cloud
- SQL Server connection tested with real PRIFIXUS database (Primavera ERP)
- MSI hosted on R2 and downloadable via API

## NEXT STEPS (pending)

### 1. Fix `api.apura.xyz` TLS block (Cloudflare Dashboard)

The custom domain `api.apura.xyz` returns `ERR_SSL_TLSV1_ALERT_ACCESS_DENIED`. The worker is deployed and works fine via `apura-api.stela-app.workers.dev`. The issue is a zone-level security setting blocking TLS connections.

**Go to Cloudflare Dashboard → `apura.xyz` zone:**

- [ ] **Security → Bots** → Disable "Bot Fight Mode" / "Super Bot Fight Mode" (most likely cause — blocks API traffic at TLS level on free plans)
- [ ] **Security → Settings** → Ensure "Under Attack Mode" is OFF
- [ ] **Security → WAF** → Remove any custom rules blocking `api.apura.xyz`
- [ ] **SSL/TLS → Overview** → Set encryption mode to "Full" or "Full (Strict)"
- [ ] Verify: `curl https://api.apura.xyz/connector/version` returns JSON

### 2. Deploy All Workers

```bash
npm run deploy    # deploys api-gateway, worker, ws-gateway via turbo
```

The worker needs secrets set first (see Worker Secrets section above).

### 3. Deploy Frontend

```bash
cd frontend
npm run build
npx wrangler pages deploy out --project-name apura-web
```

### 4. MSI Code Signing (optional but recommended)

The MSI currently isn't code-signed, so Windows SmartScreen will flag it. To fix:

- Purchase a code signing certificate (e.g., DigiCert, Sectigo, SSL.com ~$200-400/year)
- Sign with: `signtool sign /f cert.pfx /p password /tr http://timestamp.digicert.com /td sha256 ApuraConnector.Installer.msi`
- Re-upload signed MSI to R2

### 5. Set up `releases.apura.xyz` (optional)

Currently MSI is served via the API download route. To set up a dedicated download domain:

- Create a Worker or R2 custom domain for `releases.apura.xyz`
- Update the `/connector/version` endpoint `downloadUrl` to point there
