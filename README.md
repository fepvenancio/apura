# Apura

AI-powered reporting platform for Primavera ERP databases.

**Website:** [apura.xyz](https://apura.xyz)

## What is Apura?

Apura connects to your Primavera ERP SQL Server database via a secure local agent and lets you generate reports using natural language. Ask questions like:

- "Top 10 clientes por faturacao em 2024?"
- "Total de vendas por mes no ultimo ano"
- "Funcionarios por departamento e custo total"

The AI understands the Primavera database schema and generates optimized SQL queries automatically.

## Architecture

- **Frontend:** Next.js on Cloudflare Pages
- **Backend:** Cloudflare Workers + Durable Objects
- **AI:** Claude API (text-to-SQL)
- **Connector:** .NET 8 Windows Service (on-premise)
- **Database:** Cloudflare D1

## Project Structure

```
apura/
├── packages/
│   ├── api-gateway/          # Main API worker
│   ├── ai-orchestrator/      # AI/Claude worker
│   ├── query-executor/       # Query routing worker
│   ├── report-worker/        # PDF/CSV generation
│   ├── email-worker/         # Email sending
│   ├── cron-worker/          # Scheduled triggers
│   └── shared/               # Shared types, utils
├── frontend/                 # Next.js app
├── connector/                # .NET Windows Service
├── migrations/               # D1 migration files
└── docs/                     # Documentation
```

See [PLAN.md](PLAN.md) for the complete project plan.
