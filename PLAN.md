# Apura.xyz — Complete Project Plan

> AI-powered reporting platform for Primavera ERP databases
> Domain: apura.xyz | Repo: fepvenancio/apura

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Security Architecture](#3-security-architecture)
4. [Database Schema (Primavera Master)](#4-primavera-master-schema)
5. [Cloud Infrastructure (Cloudflare)](#5-cloud-infrastructure)
6. [API Design](#6-api-design)
7. [Frontend (Next.js)](#7-frontend)
8. [AI Orchestration (Text-to-SQL)](#8-ai-orchestration)
9. [.NET Connector](#9-net-connector)
10. [Pricing & Business Model](#10-pricing--business-model)
11. [Implementation Phases](#11-implementation-phases)

---

## 1. Overview

**Problem:** Primavera ERP users (Portugal, Spain, Angola, Mozambique) have their business data locked in on-premise SQL Server databases with cryptic table names. Generating reports requires deep SQL knowledge or expensive consultants.

**Solution:** A web platform where users connect their SQL Server via a local agent, then ask questions in natural language. AI generates SQL, executes it via the agent, and returns charts/tables/PDFs.

**Key Advantage:** Primavera has a **fixed, standardized schema** across all customers. The AI can be an expert on one schema and work for every customer.

**Target Users:**
- 99% Windows / Windows Server / SQL Server admins
- Market: Portugal, Spain, Portuguese-speaking countries (Angola, Mozambique, Brazil)
- Users of Primavera V9/V10/Evolution ERP

---

## 2. Architecture

```
                                    ┌──────────────────────────────┐
                                    │       apura.xyz              │
                                    │   Cloudflare Pages (Next.js) │
                                    └──────────┬───────────────────┘
                                               │ HTTPS
                                               ▼
┌─────────────────────┐  WSS (mTLS)  ┌─────────────────────────────┐
│ Customer Premises    │◄────────────►│  Cloudflare Workers + DO     │
│                      │              │                              │
│ ┌──────────────────┐ │              │  ┌────────────────────────┐  │
│ │ SQL Server       │ │              │  │ Durable Object (per    │  │
│ │ (Primavera ERP)  │◄┤              │  │ tenant WebSocket state)│  │
│ └──────────────────┘ │              │  └────────────────────────┘  │
│        ▲             │              │                              │
│        │ ADO.NET     │              │  ┌────────────────────────┐  │
│ ┌──────────────────┐ │              │  │ AI Orchestrator        │  │
│ │ Apura Connector  │─┼──────────────┤  │ (Claude API)           │  │
│ │ (.NET 8 Service) │ │              │  └────────────────────────┘  │
│ └──────────────────┘ │              │                              │
└─────────────────────┘              │  D1 | KV | R2 | Queues      │
                                     └──────────────────────────────┘
```

**Tech Stack:**
| Component | Technology | Why |
|-----------|-----------|-----|
| Frontend | Next.js 14+ on Cloudflare Pages | SSR, App Router, Cloudflare-native |
| UI | Tailwind CSS + shadcn/ui | Clean B2B look |
| Charts | Apache ECharts | Best i18n, business chart variety |
| Backend API | Cloudflare Workers (Hono.js) | Edge, serverless, same dashboard |
| WebSocket State | Durable Objects | Per-tenant persistent WebSocket |
| Database | Cloudflare D1 (SQLite) | Users, reports, schedules, schema |
| Cache | Cloudflare KV | Query results, sessions, schema cache |
| File Storage | Cloudflare R2 | Reports (PDF/CSV), connector binaries |
| Async Jobs | Cloudflare Queues | Report generation, email sending |
| Email | Resend API | Transactional + scheduled reports |
| AI | Claude API (Anthropic) | Text-to-SQL generation |
| Connector | .NET 8 Windows Service | On-prem SQL Server bridge |
| Installer | WiX v5 MSI | Enterprise-standard Windows installer |

---

## 3. Security Architecture

### 3.1 Connector-to-Cloud (Tunnel Security)

**Three-layer authentication:**

| Layer | Mechanism | Validates |
|-------|-----------|-----------|
| 1 | mTLS client certificate | Device identity |
| 2 | JWT bearer token (EdDSA/Ed25519, 15-min expiry) | Session identity |
| 3 | Challenge-response on WSS open | Liveness / anti-replay |

- **Transport:** WSS (TLS 1.3) exclusively
- **Certificate pinning:** Pin Cloudflare intermediate CA SPKI hashes (not leaf)
- **Reconnection:** Full re-authentication on every reconnect (no session resumption)
- **Concurrent connections:** Max 1 per connector_id (prevents hijacking)

### 3.2 SQL Safety (Three Independent Barriers)

```
User question → AI generates SQL
    ↓
[Barrier 1] Cloud-side AST parser (node-sql-parser, TypeScript)
    ↓
[Barrier 2] Connector-side AST parser (TSql.ScriptDom, .NET)
    ↓
[Barrier 3] SQL Server permissions (db_datareader only, DENY all writes)
```

**Whitelist approach (not blocklist):**
- ALLOWED: SELECT, JOIN, WHERE, GROUP BY, HAVING, ORDER BY, aggregates, CTEs, UNION, TOP/OFFSET
- BLOCKED: Everything else (INSERT, UPDATE, DELETE, DROP, EXEC, OPENROWSET, WAITFOR, semicolons, variables, dynamic SQL)
- Table allowlisting: queries can only reference customer-approved tables
- Query limits: max 4,000 chars, max 8 JOINs, max 3 subquery depth, max 10,000 rows, 30s timeout

### 3.3 Multi-Tenancy Isolation

- JWT-embedded `tenant_id` (never from client input)
- Every D1 query includes `WHERE org_id = ?` via OrgScopedDB wrapper
- Each tenant gets its own Durable Object instance
- KV/R2 keys prefixed with `org_id`
- Automated cross-tenant penetration tests in CI

### 3.4 Web Platform Auth

- JWT access tokens (15-min) + refresh tokens (7-day, rotation)
- HttpOnly/Secure/SameSite=Strict cookies
- MFA enforced for admin roles
- RBAC: Owner > Admin > Analyst > Viewer

### 3.5 Data Privacy (GDPR)

- SQL credentials: LOCAL ONLY (Windows DPAPI, never leaves customer server)
- Query results: TRANSIT only (not stored unless user saves report)
- Schema metadata: stored encrypted in cloud (needed for AI)
- EU data residency via Cloudflare Data Localization Suite
- DPA with every customer, CNPD registration
- Right to erasure endpoint, auto-purge audit logs (2yr retention)

### 3.6 Connector Security

- Credentials: Windows DPAPI (tied to machine + service account)
- Binary signing: Authenticode (EV cert) + Ed25519 detached signature (air-gapped key)
- Auto-update: triple verification (SHA-256 + Authenticode + Ed25519)
- Runs as dedicated `NT SERVICE\ApuraConnector` account (never LocalSystem)
- SQL Server: dedicated login with Resource Governor (CPU 30%, Memory 20%)

### 3.7 Top Threats

| # | Threat | Mitigation |
|---|--------|------------|
| T1 | SQL injection via AI | 3-layer defense (cloud AST + connector AST + SQL Server perms) |
| T2 | Cross-tenant data access | JWT tenant_id, DO isolation, DB row filtering, CI pen tests |
| T3 | Connector binary compromise | Authenticode, Ed25519, ACLs, behavior anomaly detection |
| T4 | API key leak | SHA-256 hashed in DB, IP allowlists, `apura_live_` prefix for GitHub scanning |
| T5 | MITM on tunnel | TLS 1.3 + cert pinning + mTLS + channel binding |
| T6 | DoS via expensive queries | Complexity limits, timeouts, Resource Governor, rate limiting |
| T7 | Credential theft from connector | DPAPI, prefer Windows Auth, ACLs |
| T8 | LLM prompt injection | AST validation catches any malicious SQL output |
| T9 | Session hijacking | Short tokens, HttpOnly cookies, refresh rotation, MFA |
| T10 | Supply chain attack on auto-update | Triple verification with air-gapped signing key |

---

## 4. Primavera Master Schema

**Database investigated:** PRIFIXUS (1,705 tables, 180 views, 901 stored procedures)
**Data period:** 2015-2025 | **Currency:** AKZ (Angolan Kwanza) | **Country:** Angola

### 4.1 Sales (Vendas)

| Table | Rows | Purpose |
|-------|------|---------|
| **CabecDoc** | 3,759 | Sales document headers (invoices, credit notes, quotations) |
| **LinhasDoc** | 11,109 | Sales document line items |
| **CabecDocStatus** | 3,759 | Document status (voided, closed, printed) |
| **Clientes** | 172 | Customer master |
| **DocumentosVenda** | 19 | Sales document type definitions |

**Key CabecDoc columns:** `Filial`, `Serie`, `TipoDoc`, `NumDoc`, `Entidade`, `Nome`, `Data`, `DataVencimento`, `TotalMerc`, `TotalIva`, `TotalDesc`, `TotalDocumento`, `Moeda`, `Cambio`, `CondPag`, `ModoPag`

**Document types:** FA(Invoice/2,623), FP(Pro-forma/533), PR(Proposal/372), AV(Standing Order/94), NE(Delivery Note/69), NC(Credit Note/56)

**Key LinhasDoc columns:** `IdCabecDoc`(FK), `Artigo`, `Descricao`, `Quantidade`, `PrecUnit`, `PrecoLiquido`, `TaxaIva`, `Armazem`, `TotalIliquido`, `TotalIva`, `Vendedor`

### 4.2 Purchases (Compras)

| Table | Rows | Purpose |
|-------|------|---------|
| **CabecCompras** | 2,024 | Purchase document headers |
| **LinhasCompras** | 4,740 | Purchase line items |
| **Fornecedores** | 125 | Supplier master |
| **DocumentosCompra** | 12 | Purchase document type definitions |

**Document types:** VFA(Supplier Invoice/1,441), VVD(Cash Sale/192), ECF(Purchase Order/150), FRA(Self-billing/140), VNC(Credit Note/95)

### 4.3 Accounting (Contabilidade)

| Table | Rows | Purpose |
|-------|------|---------|
| **Movimentos** | 64,451 | Posted accounting journal entries |
| **CabecMovCBL** | 15,384 | Accounting document headers |
| **PlanoContas** | 29,329 | Chart of accounts |
| **AcumuladosContas** | 58,642 | Monthly account balances (Mes01CR-Mes15CR, Mes01DB-Mes15DB) |
| **CblRascunhosMovimentos** | 954 | Draft/unposted entries |
| **Diarios** | 25 | Journal definitions |
| **DocumentosCBL** | 62 | Accounting document types |
| **LigacaoContabilidade** | 4,205 | Module-to-accounting integration rules |

**Key Movimentos columns:** `Ano`, `Mes`, `Dia`, `Diario`, `Conta`, `Descricao`, `Valor`, `Natureza`(D/C), `Entidade`, `Moeda`, `Fluxo`, `Projecto`

### 4.4 HR / Payroll (Recursos Humanos)

| Table | Rows | Purpose |
|-------|------|---------|
| **Funcionarios** | 53 | Employee master |
| **MovimentosFuncionarios** | 8,326 | Payroll movements per processing run |
| **FuncRecibos** | 1,689 | Pay slips (with PDF) |
| **FuncCCusto** | 6,601 | Employee cost center allocation |
| **CadastroFaltas** | 6,320 | Absence records |
| **Categorias** | 813 | Job categories |
| **CategoriasEscaloes** | 811 | Pay scales |
| **Remuneracoes** | 54 | Remuneration type definitions |
| **Descontos** | 26 | Deduction type definitions |
| **Departamentos** | 9 | Departments |

**Key Funcionarios columns:** `Codigo`, `Nome`, `DataNascimento`, `DataAdmissao`, `DataDemissao`, `Situacao`, `Categoria`, `CodDepartamento`, `Vencimento`, `VencimentoMensal`, `NumContri`, `CodIRS`, `CodSegSocial`, `Moeda`, `TipoContrato`

### 4.5 Inventory / Products (Stocks)

| Table | Rows | Purpose |
|-------|------|---------|
| **Artigo** | 437 | Product/item master |
| **ArtigoMoeda** | 870 | Prices by currency (PVP1-PVP6) |
| **ArtigoFornecedor** | 326 | Supplier-product links |
| **Familias** | 12 | Product families |
| **SubFamilias** | 48 | Product sub-families |
| **Unidades** | 16 | Units of measure |

**Key Artigo columns:** `Artigo`, `Descricao`, `UnidadeBase`, `UnidadeVenda`, `Iva`, `Familia`, `SubFamilia`, `STKActual`, `STKMinimo`, `STKMaximo`, `PCMedio`, `PCUltimo`, `Fornecedor`, `TipoArtigo`, `Marca`

### 4.6 Treasury / Banking (Tesouraria)

| Table | Rows | Purpose |
|-------|------|---------|
| **CabecTesouraria** | 6,662 | Treasury document headers |
| **LinhasTesouraria** | 7,670 | Treasury document lines |
| **MovimentosBancos** | 7,670 | Bank movements with reconciliation |
| **ContasBancarias** | 16 | Bank accounts |

### 4.7 Current Accounts (Contas Correntes)

| Table | Rows | Purpose |
|-------|------|---------|
| **Pendentes** | 2,611 | Outstanding amounts (unpaid) |
| **CabLiq** | 3,551 | Settlement headers |
| **LinhasLiq** | 10,669 | Settlement lines |
| **BasContasCorrentes** | 9,142 | All current account movements |

### 4.8 Fixed Assets (Activos)

| Table | Rows | Purpose |
|-------|------|---------|
| **Fichas** | 38 | Asset records |
| **Classificacoes** | 1,062 | Asset classifications |
| **FichasCriteriosDepreciacao** | 3,974 | Depreciation parameters |
| **Processamentos** | 2,500 | Depreciation processing |
| **TaxasAmort** | 452 | Depreciation rates |

### 4.9 Construction / Projects (Obras)

| Table | Rows | Purpose |
|-------|------|---------|
| **COP_Obras** | — | Construction projects |
| **COP_Precos_Estrutura** | 24 | Cost structures |
| **COP_Indicadores** | 87 | Project KPIs |

### 4.10 Maintenance / Helpdesk (STP)

| Table | Rows | Purpose |
|-------|------|---------|
| **STP_Intervencoes** | 2,190 | Service interventions |
| **STP_Processos** | 208 | Service processes |
| **STP_Objectos** | 186 | Service objects |
| **STP_Contratos** | 185 | Service contracts |

### 4.11 Tax / Reporting (SAFT)

| Table | Rows | Purpose |
|-------|------|---------|
| **SAFT_Exportacoes** | 110 | SAFT-AO export history |
| **ResumoIva** | 8,970 | VAT summaries |
| **AcumuladosIVA** | 1,470 | VAT accumulated totals |
| **Modelo22** | 368 | Corporate tax return |

### 4.12 Key Views (Pre-built for Reporting)

| View | Purpose |
|------|---------|
| V_CabecDoc | Enriched sales headers |
| V_CabecCompras | Enriched purchase headers |
| V_LinhasDoc | Enriched sales lines |
| V_Movimentos | Accounting movements with lookups |
| V_MovimentosFuncionarios | Payroll with enrichment |
| V_INV_ValoresActuaisStock | Current stock values |
| V_INV_ResumoArtigo | Product summary |
| V_BAS_ContasCorrentesPendentes | Outstanding balances |
| V_COP_Obras_Dashboard | Project dashboard |
| CBL_ValoresReaisCCColunas | Cost center actuals by month |
| CBL_OrcamentosColunas | Budget by month |

### 4.13 Cross-Module FK Map

```
CabecDoc.Id ← LinhasDoc.IdCabecDoc
CabecDoc.Id ← CabecDocStatus.IdCabecDoc
CabecDoc.TipoDoc → DocumentosVenda.Documento
CabecDoc.Entidade → Clientes.Cliente
CabecDoc.IdCabecTesouraria → CabecTesouraria.Id
CabecDoc.IdCabecMovCbl → CabecMovCBL.Id
CabecDoc.ObraID → COP_Obras.ID

CabecCompras.Id ← LinhasCompras.IdCabecCompras
CabecCompras.Entidade → Fornecedores.Fornecedor

LinhasDoc.Artigo → Artigo.Artigo
Artigo.Familia → Familias.Familia
Artigo.Fornecedor → Fornecedores.Fornecedor

Movimentos.IdCabec → CabecMovCBL.Id
Movimentos.Conta → PlanoContas.Conta

Funcionarios.Codigo ← MovimentosFuncionarios.Funcionario
Funcionarios.Codigo ← FuncRecibos.CodFunc
Funcionarios.CodDepartamento → Departamentos.Departamento
```

---

## 5. Cloud Infrastructure

### 5.1 Cloudflare Workers

| Worker | Route | Purpose |
|--------|-------|---------|
| `api-gateway` | `api.apura.xyz/*` | Main API, auth, routing |
| `ws-gateway` | `ws.apura.xyz/*` | WebSocket upgrade, DO routing |
| `ai-orchestrator` | internal (service binding) | Claude API, prompt construction |
| `query-executor` | internal (service binding) | Routes SQL through DO to agent |
| `report-worker` | internal (service binding) | PDF/CSV generation |
| `email-worker` | internal (service binding) | Email via Resend |
| `cron-worker` | cron trigger (every minute) | Scheduled report execution |

Worker-to-worker via **Service Bindings** (zero-latency, no HTTP overhead).

### 5.2 D1 Schema

```sql
-- Organizations (tenants)
CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'trial',
  primavera_version TEXT,
  agent_api_key TEXT NOT NULL UNIQUE,
  max_users INTEGER NOT NULL DEFAULT 5,
  max_queries_per_month INTEGER NOT NULL DEFAULT 500,
  queries_this_month INTEGER NOT NULL DEFAULT 0,
  billing_email TEXT,
  country TEXT DEFAULT 'PT',
  timezone TEXT DEFAULT 'Europe/Lisbon',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Users
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer', -- owner, admin, analyst, viewer
  language TEXT DEFAULT 'pt',
  last_login_at TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Schema dictionary (per org, synced from connector)
CREATE TABLE schema_tables (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  table_name TEXT NOT NULL,
  table_description TEXT,
  table_category TEXT, -- vendas, compras, financeiro, stocks, rh, tesouraria, activos
  row_count_approx INTEGER,
  UNIQUE(org_id, table_name)
);

CREATE TABLE schema_columns (
  id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL REFERENCES schema_tables(id),
  org_id TEXT NOT NULL,
  column_name TEXT NOT NULL,
  data_type TEXT NOT NULL,
  is_primary_key INTEGER DEFAULT 0,
  is_foreign_key INTEGER DEFAULT 0,
  fk_references TEXT,
  column_description TEXT,
  UNIQUE(table_id, column_name)
);

-- Master schema (curated Primavera knowledge, global)
CREATE TABLE master_schema (
  id TEXT PRIMARY KEY,
  primavera_version TEXT NOT NULL,
  table_name TEXT NOT NULL,
  column_name TEXT,
  description_pt TEXT,
  description_en TEXT,
  category TEXT,
  common_joins TEXT, -- JSON
  UNIQUE(primavera_version, table_name, column_name)
);

-- Queries
CREATE TABLE queries (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  natural_language TEXT NOT NULL,
  generated_sql TEXT,
  explanation TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  row_count INTEGER,
  execution_time_ms INTEGER,
  ai_tokens_used INTEGER,
  result_preview TEXT, -- JSON: first 50 rows
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

-- Saved reports
CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  natural_language TEXT,
  sql_query TEXT NOT NULL,
  chart_config TEXT,  -- JSON
  layout_config TEXT, -- JSON
  is_shared INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Dashboards
CREATE TABLE dashboards (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  layout TEXT, -- JSON grid
  is_shared INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE dashboard_widgets (
  id TEXT PRIMARY KEY,
  dashboard_id TEXT NOT NULL REFERENCES dashboards(id),
  report_id TEXT NOT NULL REFERENCES reports(id),
  position_x INTEGER NOT NULL DEFAULT 0,
  position_y INTEGER NOT NULL DEFAULT 0,
  width INTEGER NOT NULL DEFAULT 6,
  height INTEGER NOT NULL DEFAULT 4
);

-- Schedules
CREATE TABLE schedules (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  report_id TEXT NOT NULL REFERENCES reports(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  cron_expression TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Europe/Lisbon',
  output_format TEXT NOT NULL DEFAULT 'pdf',
  recipients TEXT NOT NULL, -- JSON array of emails
  is_active INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  next_run_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Few-shot examples for AI
CREATE TABLE few_shot_examples (
  id TEXT PRIMARY KEY,
  org_id TEXT,           -- NULL = global
  primavera_version TEXT,
  category TEXT,
  natural_language_pt TEXT NOT NULL,
  natural_language_en TEXT,
  sql_query TEXT NOT NULL,
  tables_used TEXT, -- JSON array
  is_verified INTEGER NOT NULL DEFAULT 0
);

-- Audit log
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  user_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  details TEXT, -- JSON
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 5.3 KV Cache Strategy

| Key Pattern | TTL | Purpose |
|-------------|-----|---------|
| `session:{jti}` | 24h | JWT session validation |
| `schema:{org_id}:tables` | 1h | Schema for AI context |
| `connector:{org_id}:status` | 30s | Dashboard status |
| `query_result:{query_id}` | 15min | Result caching |
| `rate:{org_id}:queries` | monthly reset | Quota tracking |

### 5.4 R2 Storage

```
/reports/{org_id}/{report_id}/{run_id}.pdf
/reports/{org_id}/{report_id}/{run_id}.csv
/exports/{org_id}/{query_id}.csv
/agent-binaries/apura-connector-{version}-win-x64.zip
```

### 5.5 Queues

| Queue | Producer | Consumer |
|-------|----------|----------|
| `report-generation` | cron-worker, api | report-worker |
| `email-outbound` | report-worker | email-worker |
| `schema-sync` | ws-gateway | ai-orchestrator |
| `audit-log` | all workers | api-gateway |

---

### 5.6 Default Reports (Auto-created on First Sync)

Every new organization gets 5 pre-built reports that auto-execute when the connector first syncs:

| # | Name | Category | Chart | SQL Summary |
|---|------|----------|-------|-------------|
| 1 | **Vendas Mensais** | vendas | Line chart | Monthly `SUM(TotalDocumento)` from CabecDoc last 12 months |
| 2 | **Top 20 Clientes** | vendas | Horizontal bar | Top 20 customers by total invoiced (FA+VD) this year |
| 3 | **Saldos Pendentes** | contas_correntes | Stacked bar | Receivables aging buckets (0-30, 30-60, 60-90, 90+ days) from Pendentes |
| 4 | **Receitas vs Despesas** | financeiro | Dual bar+line | Monthly revenue (class 7) vs expenses (class 6) from AcumuladosContas |
| 5 | **Quadro de Pessoal** | rh | Bar + KPI | Headcount + total salary by department from Funcionarios |

**Flow:** Connector connects → schema sync → auto-execute 5 default report SQLs → cache results → home dashboard populated with real data on first visit.

Templates stored in `docs/schema/default-reports.json` and seeded into each org's `reports` table on creation.

---

## 6. API Design

### Auth
```
POST /auth/signup          Create org + owner
POST /auth/login           Email/password → {accessToken, refreshToken}
POST /auth/refresh         Refresh → new access token
POST /auth/forgot          Password reset email
POST /auth/reset           Reset with token
POST /auth/verify-email    Verify email
```

### Organization
```
GET    /org                       Org details
PUT    /org                       Update settings
GET    /org/usage                 Query usage, plan limits
GET    /org/connector-status      Agent connection status
```

### Team
```
GET    /org/users                 List members
PUT    /org/users/:id             Update role
DELETE /org/users/:id             Remove user
POST   /org/invitations           Send invite
POST   /org/invitations/:token/accept   Accept invite
```

### Schema
```
GET    /schema/tables             List tables with categories
GET    /schema/tables/:name       Table detail with columns
POST   /schema/sync               Trigger re-sync from agent
GET    /schema/categories          List categories
```

### Queries
```
POST   /queries                   Execute natural language query
GET    /queries                   Query history (paginated)
GET    /queries/:id               Query detail + results
POST   /queries/:id/rerun         Re-execute
GET    /queries/:id/export/:fmt   Export CSV/XLSX
```

### Reports
```
POST   /reports                   Save query as report
GET    /reports                   List reports
GET    /reports/:id               Report detail
PUT    /reports/:id               Update config
DELETE /reports/:id               Delete
POST   /reports/:id/run           Execute now
```

### Dashboards
```
POST   /dashboards                Create
GET    /dashboards                List
GET    /dashboards/:id            Get with widget data
PUT    /dashboards/:id            Update layout
POST   /dashboards/:id/widgets    Add widget
```

### Schedules
```
POST   /schedules                 Create
GET    /schedules                 List
PUT    /schedules/:id             Update
DELETE /schedules/:id             Delete
POST   /schedules/:id/trigger     Manual trigger
```

### Agent (mTLS + JWT auth)
```
POST   /agent/register            First-time registration
GET    /agent/config              Get configuration
WSS    ws.apura.xyz/agent/connect WebSocket tunnel
```

---

## 7. Frontend

### Page Structure

```
app/
├── (auth)/
│   ├── login/
│   ├── signup/
│   ├── forgot-password/
│   └── accept-invite/[token]/
│
├── (dashboard)/                   ← Authenticated, sidebar layout
│   ├── page.tsx                   ← Home (recent queries, quick stats)
│   ├── query/page.tsx             ← CORE: Natural language query interface
│   ├── history/page.tsx           ← Query history
│   ├── reports/
│   │   ├── page.tsx               ← Report list
│   │   └── [id]/page.tsx          ← Report viewer/editor
│   ├── dashboards/
│   │   ├── page.tsx               ← Dashboard list
│   │   └── [id]/page.tsx          ← Dashboard viewer (drag-drop grid)
│   ├── schedules/page.tsx         ← Schedule management
│   ├── schema/page.tsx            ← Schema explorer
│   └── settings/
│       ├── page.tsx               ← Org settings
│       ├── team/page.tsx          ← User management
│       ├── connector/page.tsx     ← Agent setup, status, API key
│       ├── billing/page.tsx       ← Plan, usage
│       └── profile/page.tsx       ← User profile
│
├── (public)/
│   ├── page.tsx                   ← Landing page
│   ├── pricing/page.tsx
│   └── docs/page.tsx              ← Setup docs
```

### Query Interface (Core Product Page)

```
┌──────────────────────────────────────────────────────┐
│ ┌──────────────────────────────────────────────────┐ │
│ │ Faça uma pergunta sobre os seus dados...         │ │
│ │ "Top 10 clientes por faturação em 2025?"         │ │
│ └──────────────────────────────────────────────────┘ │
│ [Perguntar]  [Sugestões ▼]                           │
│                                                       │
│ ┌─ Resultado ───────────────────────────────────────┐ │
│ │ 📊 Tabela │ 📈 Gráfico │ 🔍 SQL │ 💡 Explicação │ │
│ │ ────────────────────────────────────────────────── │ │
│ │ Cliente    │ Faturação │ Qtd Docs │               │ │
│ │ ACME Lda   │ €245,000  │ 142      │               │ │
│ │ Beta SA    │ €198,500  │ 98       │               │ │
│ └───────────────────────────────────────────────────┘ │
│ [💾 Guardar Relatório]  [📥 Exportar CSV]            │
└──────────────────────────────────────────────────────┘
```

**Tabs:** Table (TanStack Table) | Chart (ECharts auto-suggested) | SQL (syntax highlighted) | Explanation (AI plain language)

### Tech Details
- **State:** Zustand
- **Forms:** React Hook Form + Zod
- **i18n:** next-intl (PT, ES, EN)
- **Tables:** TanStack Table v8
- **Real-time:** Connector status polling (30s)

---

## 8. AI Orchestration

### Text-to-SQL Pipeline

```
1. User asks question in Portuguese/English
2. Classify query category (vendas, compras, financeiro, stocks, rh)
3. Select relevant 15-20 tables from schema (not all 1,705!)
4. Fetch few-shot examples matching category
5. Build prompt: system prompt + schema + examples + question
6. Call Claude API → get SQL + explanation
7. Validate SQL (cloud AST parser)
8. Send to connector → execute → return results
9. If error: retry once with error context
```

### Context Window Management

Primavera has 1,705 tables. Strategy:
1. **Category filter:** Tables tagged by module. Query classified into 1-2 categories.
2. **Relevance scoring:** Name similarity, past usage frequency, few-shot inclusion.
3. **Tiered inclusion:** Top ~15 tables with full columns; remaining category tables as name+description only.
4. **Token budget:** ~4,000 tokens schema, ~1,000 tokens examples.

### System Prompt (Core)

```
You are a SQL Server expert for Primavera ERP databases.

RULES:
- Generate ONLY SELECT statements. Never INSERT/UPDATE/DELETE/DROP/ALTER.
- Always use TOP or pagination (default TOP 1000).
- Use WITH (NOLOCK) on all tables.
- Use Portuguese aliases matching the user's language.
- Handle NULLs. Qualify columns with table aliases on JOINs.
- Date filtering: DATEADD, DATEDIFF, GETDATE().

RESPONSE FORMAT:
{"sql": "SELECT ...", "explanation": "Plain language explanation"}
```

### Error Recovery

If SQL fails at the connector, retry once with error context injected into the prompt. If it fails again, show user-friendly error with option to rephrase.

---

## 9. .NET Connector

### Technology

- **.NET 8 LTS**, self-contained single-file deployment
- **Microsoft.Data.SqlClient** — SQL Server (all auth modes)
- **Microsoft.TSql.ScriptDom** — T-SQL AST parsing
- **Microsoft.Extensions.Hosting.WindowsServices** — Windows Service
- **Serilog** + EventLog + rolling file
- **MessagePack** — binary serialization for large results
- **WiX v5** — MSI installer

### Project Structure

```
ApuraConnector.sln
├── src/
│   ├── ApuraConnector.Service/          ← Windows Service entry point
│   ├── ApuraConnector.Core/             ← Models, validation, serialization
│   │   ├── Models/                      ← MessageEnvelope, QueryRequest, etc.
│   │   ├── Validation/                  ← SqlValidator, DangerousConstructVisitor
│   │   └── Serialization/              ← JSON + MessagePack
│   ├── ApuraConnector.Infrastructure/   ← I/O implementations
│   │   ├── Database/                    ← SqlServerConnection, QueryExecutor
│   │   ├── Tunnel/                      ← CloudTunnelService, MessageDispatcher
│   │   ├── Security/                    ← CredentialStore (DPAPI)
│   │   └── Updates/                     ← AutoUpdateService
│   └── ApuraConnector.Setup/           ← First-run config wizard (Spectre.Console)
├── installer/                           ← WiX v5 MSI
└── test/
```

### Message Protocol (Hybrid JSON + MessagePack)

**Cloud → Connector:**
```json
{"v":1, "id":"msg_q001", "type":"query.execute", "payload":{"sql":"SELECT...", "timeout_seconds":60, "max_rows":10000}}
{"v":1, "id":"msg_h001", "type":"health.ping"}
{"v":1, "id":"msg_c001", "type":"query.cancel", "payload":{"query_id":"msg_q001"}}
{"v":1, "id":"msg_s001", "type":"schema.discover"}
```

**Connector → Cloud:**
```json
{"v":1, "id":"msg_q001", "type":"query.result", "payload":{"status":"ok", "columns":[...], "row_count":42, "execution_ms":123}}
{"v":1, "id":"msg_q001", "type":"error", "payload":{"code":"QUERY_VALIDATION_FAILED", "message":"Only SELECT allowed"}}
{"v":1, "id":"msg_h001", "type":"health.pong", "payload":{"uptime_seconds":86400, "sql_server_connected":true, "version":"1.2.3"}}
```

Large results (>1000 rows): streamed as `query.result.start` → N binary MessagePack batches → `query.result.end`.

### Key Behaviors

- **Reconnection:** Exponential backoff (1s → 2s → 4s → ... max 2min) with jitter
- **Concurrency:** Max 5 concurrent queries via `SemaphoreSlim`
- **Memory:** `CommandBehavior.SequentialAccess`, 1000-row batches, GC memory pressure check
- **Health:** SQL `SELECT 1` every 30s, local HTTP health endpoint on `localhost:19850`
- **Logging:** Windows Event Log + rolling files (30 days retention)

---

## 10. Pricing & Business Model

> Full details in [docs/PRICING_MODEL.md](docs/PRICING_MODEL.md)

### Pricing Tiers

| | **Starter** | **Professional** | **Business** | **Enterprise** |
|--|------------|-----------------|-------------|---------------|
| **Price** | **€29/month** | **€79/month** | **€199/month** | **€399/month** |
| **Annual** (20% off) | €23/month | €63/month | €159/month | €319/month |
| Queries included | 200 | 1,000 | 5,000 | 20,000 |
| Users | 3 | 10 | 25 | Unlimited |
| Connectors (DBs) | 1 | 1 | 3 | 10 |
| AI Model | Haiku | Haiku + Sonnet | Sonnet | Sonnet + Priority |
| Scheduled reports | — | 5 | 25 | Unlimited |
| Overage per query | €0.15 | €0.10 | €0.06 | €0.04 |

### Unit Economics

| Metric | Value |
|--------|-------|
| Blended cost per query (with caching + smart routing) | ~€0.005 |
| Gross margin (typical) | 88-97% per tier |
| Breakeven | 3 Starter customers or 1 Professional |
| Fixed costs | ~€61/month (Cloudflare $5 + Resend $20 + code signing amortized) |

### Revenue Targets

| Milestone | Customers | MRR | ARR |
|-----------|-----------|-----|-----|
| Launch (Q1) | 15 | €825 | €10K |
| Growth (Q2) | 40 | €2,245 | €27K |
| Scale (Q4) | 150 | €11,238 | €135K |
| Year 2 | 500 | €45,000 | €540K |

### Billing: Stripe (EUR, IVA/VAT compliance, metered usage for overage)
### Free Trial: 14 days, Professional plan, 100 queries, no credit card

---

## 11. Implementation Phases

### Phase 0 — Billing & Stripe Setup (during Phase 2)
- [ ] Stripe account setup (EUR, Portuguese entity)
- [ ] Product + price configuration (4 tiers + annual variants)
- [ ] Metered usage component for overage billing
- [ ] Stripe Checkout integration
- [ ] Webhook handler in Workers (subscription events → D1)
- [ ] Query counter in D1 + quota enforcement in API gateway
- [ ] Usage dashboard component in frontend
- [ ] IVA/VAT handling via Stripe Tax

### Phase 1 — Proof of Concept (2-3 weeks)
**Goal:** Validate the text-to-SQL pipeline end-to-end against PRIFIXUS.

- [ ] Set up monorepo structure (turborepo)
- [ ] Build AI orchestrator as a standalone script
  - Master schema dictionary for top 30 tables
  - 20-30 few-shot examples across all modules
  - Claude API integration
  - SQL validation (node-sql-parser)
- [ ] Test against PRIFIXUS Docker container
  - Sales: "Top 10 customers by revenue in 2024"
  - HR: "Total payroll cost by department"
  - Accounting: "P&L for fiscal year 2024"
  - Inventory: "Products below minimum stock"
- [ ] Basic Next.js frontend with query interface
- [ ] Deploy frontend to Cloudflare Pages

### Phase 2 — Core Infrastructure (3-4 weeks)
**Goal:** Cloud backend + basic connector working.

- [ ] Cloudflare Workers API (auth, queries, reports)
- [ ] D1 database + migrations
- [ ] Durable Object for WebSocket state
- [ ] .NET Connector MVP (WSS + SQL execution + SQL validation)
- [ ] End-to-end: browser → cloud → connector → SQL Server → response
- [ ] User auth (signup, login, JWT)
- [ ] Multi-tenancy isolation

### Phase 3 — Security Hardening (2-3 weeks)
**Goal:** Production-ready security.

- [ ] mTLS on connector tunnel
- [ ] Connector-side TSql.ScriptDom validation
- [ ] DPAPI credential storage
- [ ] SQL Server least-privilege setup (automated)
- [ ] Rate limiting (Cloudflare rules + app-level)
- [ ] Audit logging
- [ ] RBAC enforcement

### Phase 4 — Reports & Automation (2-3 weeks)
**Goal:** Save, schedule, and email reports.

- [ ] Report CRUD (save query as report)
- [ ] Chart configuration (ECharts)
- [ ] Dashboard builder (drag-drop grid)
- [ ] Scheduled reports (cron-worker)
- [ ] PDF/CSV generation (report-worker)
- [ ] Email delivery (Resend)

### Phase 5 — Polish & Launch (2-3 weeks)
**Goal:** Production launch on apura.xyz.

- [ ] MSI installer (WiX v5)
- [ ] Auto-update mechanism (triple verification)
- [ ] Landing page + pricing page
- [ ] Setup documentation (Portuguese)
- [ ] Onboarding wizard in web UI
- [ ] Billing integration (Stripe)
- [ ] GDPR compliance (DPA template, privacy policy)
- [ ] Beta testing with 3-5 real Primavera customers

### Phase 6 — Growth (Ongoing)
- [ ] Schema explorer in web UI
- [ ] More few-shot examples (continuous improvement)
- [ ] SSO (SAML/OIDC) for enterprise
- [ ] Query suggestions / auto-complete
- [ ] Anomaly detection on connector behavior
- [ ] Mobile-responsive dashboard
- [ ] API for third-party integrations
