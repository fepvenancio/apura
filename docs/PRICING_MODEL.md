# Apura — Cost Analysis & Pricing Model

> Last updated: 2026-03-16

---

## 1. Our Infrastructure Costs (What We Pay)

### 1.1 Cloudflare (Base: $5/month for Workers Paid Plan)

| Service | Free Included | Paid Included | Overage Cost |
|---------|---------------|---------------|--------------|
| **Workers Requests** | 100K/day | 10M/month | $0.30/million |
| **Workers CPU** | 10ms/invocation | 30M CPU-ms/month | $0.02/million CPU-ms |
| **D1 Rows Read** | 5M/day | 25B/month | $0.001/million rows |
| **D1 Rows Written** | 100K/day | 50M/month | $1.00/million rows |
| **D1 Storage** | 5 GB | 5 GB | $0.75/GB-month |
| **KV Reads** | 100K/day | 10M/month | $0.50/million |
| **KV Writes** | 1K/day | 1M/month | $5.00/million |
| **KV Storage** | 1 GB | 1 GB | $0.50/GB-month |
| **R2 Storage** | 10 GB | 10 GB | $0.015/GB-month |
| **R2 Class A (writes)** | 1M/month | 1M/month | $4.50/million |
| **R2 Class B (reads)** | 10M/month | 10M/month | $0.36/million |
| **Durable Objects Requests** | 100K/day | 1M/month | $0.15/million |
| **DO Duration** | 13K GB-s/day | 400K GB-s/month | $12.50/million GB-s |
| **DO Storage (SQLite)** | 5 GB | 5 GB | $0.20/GB-month |
| **Queues** | 10K ops/day | included | — |
| **Pages** | unlimited | unlimited | Free |

### 1.2 Claude API (AI Cost — Our Biggest Variable Cost)

| Model | Input (/1M tokens) | Output (/1M tokens) | Cached Input | Batch (50% off) |
|-------|--------------------|--------------------|-------------|-----------------|
| **Haiku 4.5** | $1.00 | $5.00 | $0.10/1M (90% off) | $0.50 in / $2.50 out |
| **Sonnet 4.6** | $3.00 | $15.00 | $0.30/1M (90% off) | $1.50 in / $7.50 out |
| **Opus 4.6** | $5.00 | $25.00 | $0.50/1M (90% off) | $2.50 in / $12.50 out |

**Prompt caching is critical:** Our system prompt + master schema (~4,000 tokens) is identical across queries for the same org. With 5-min cache (1.25x write), cache reads cost only 10% of base. After 1 cache read, it pays off.

### 1.3 Email (Resend)

| Plan | Cost | Emails |
|------|------|--------|
| Free | $0 | 3,000/month |
| Pro | $20/month | 50,000/month |
| Scale | $90/month | 100,000/month |

### 1.4 Other Fixed Costs

| Item | Cost | Frequency |
|------|------|-----------|
| Domain (apura.xyz) | ~$10 | Annual |
| EV Code Signing Certificate | ~$400 | Annual |
| Cloudflare Workers Paid Plan | $5 | Monthly |
| Resend Pro | $20 | Monthly |
| **Total Fixed** | **~$25/month + ~$410/year** | — |

---

## 2. Per-Query Cost Breakdown (The Unit Economics)

Each user query triggers this chain:

```
Browser → API Gateway → AI Orchestrator → Claude API → Query Executor → Durable Object → Connector → SQL Server → back
```

### 2.1 Cost Per Query — Standard (Claude Sonnet 4.6)

| Component | Tokens / Operations | Cost |
|-----------|-------------------|------|
| **Claude API (first query, no cache)** | 5,100 input + 400 output | $0.0153 + $0.006 = **$0.0213** |
| **Claude API (cached schema, 90% off on ~4,000 tokens)** | 4,000 cached + 1,100 fresh + 400 output | $0.0004 + $0.0033 + $0.006 = **$0.0097** |
| Workers requests (5 hops) | 5 requests | **$0.0000015** |
| D1 reads (schema, query record, etc.) | ~20 rows | **$0.00000002** |
| D1 write (save query) | 1 row | **$0.000001** |
| KV reads (cache checks) | 3 reads | **$0.00000015** |
| DO message (WebSocket relay) | 2 messages | **$0.000000015** |
| **TOTAL (first query, no cache)** | | **~$0.021** |
| **TOTAL (subsequent, cached)** | | **~$0.010** |

### 2.2 Cost Per Query — Budget (Claude Haiku 4.5)

| Component | Tokens / Operations | Cost |
|-----------|-------------------|------|
| **Claude Haiku (first query)** | 5,100 input + 400 output | $0.0051 + $0.002 = **$0.0071** |
| **Claude Haiku (cached)** | 4,000 cached + 1,100 fresh + 400 output | $0.0004 + $0.0011 + $0.002 = **$0.0035** |
| Infra (Workers + D1 + KV + DO) | same as above | **~$0.000002** |
| **TOTAL (first query)** | | **~$0.007** |
| **TOTAL (cached)** | | **~$0.004** |

### 2.3 Smart Routing Strategy (Recommended)

Not all queries need Sonnet. Use a **two-tier approach:**

| Query Complexity | Model | Example | Cost (cached) |
|-----------------|-------|---------|---------------|
| **Simple** (60% of queries) | Haiku 4.5 | "Total sales this month", "How many employees?" | ~$0.004 |
| **Complex** (40% of queries) | Sonnet 4.6 | "Monthly trend with YoY comparison by product family" | ~$0.010 |
| **Weighted average** | | | **~$0.006** |

Classification step (Haiku, ~200 tokens): adds ~$0.0003 — negligible.

### 2.4 Additional Cost Optimizations

| Optimization | Savings | How |
|-------------|---------|-----|
| **Prompt caching** | 50-60% on input tokens | Schema + system prompt cached for 5 min |
| **Query result caching** | 100% (no AI call) | Same query within 15 min served from KV |
| **Query templates** | 100% (no AI call) | Popular queries become parameterized SQL templates |
| **Batch API** | 50% on all tokens | For scheduled reports (not real-time, 24h delivery OK) |

**Realistic blended cost per query with optimizations: ~$0.005 ($0.50 per 100 queries)**

---

## 3. Monthly Cost Scenarios (What We Pay at Scale)

### 3.1 Per-Customer Monthly Cost

| Customer Size | Queries/month | AI Cost (blended) | Infra Cost | Email | Total Our Cost |
|--------------|--------------|-------------------|------------|-------|---------------|
| **Small** (1-3 users) | 100 | $0.50 | ~$0.01 | ~$0.05 | **~$0.56** |
| **Medium** (5-10 users) | 500 | $2.50 | ~$0.05 | ~$0.25 | **~$2.80** |
| **Large** (10-25 users) | 2,000 | $10.00 | ~$0.20 | ~$1.00 | **~$11.20** |
| **Enterprise** (25+ users) | 10,000 | $50.00 | ~$1.00 | ~$5.00 | **~$56.00** |

### 3.2 Platform-Level Monthly Cost (at different scale)

| Scale | Customers | Total Queries | AI Cost | Cloudflare | Resend | Total | Fixed |
|-------|-----------|--------------|---------|------------|--------|-------|-------|
| **Launch** (10 customers) | 10 | 3,000 | $15 | $5 | $0 (free) | **$20** | $25 |
| **Growth** (50 customers) | 50 | 20,000 | $100 | $5 | $20 | **$125** | $25 |
| **Scale** (200 customers) | 200 | 100,000 | $500 | $10 | $20 | **$530** | $25 |
| **Mature** (1,000 customers) | 1,000 | 500,000 | $2,500 | $50 | $90 | **$2,640** | $25 |

---

## 4. Pricing Model (What We Charge)

### 4.1 Strategy: Monthly Subscription + Query Quota + Overage

**Why this model:**
- B2B customers (especially Portuguese SMBs) want **predictable monthly costs**
- Pure per-query pricing feels risky to buyers ("what if someone runs 10,000 queries?")
- Subscription creates recurring revenue + stickiness
- Overage provides upside capture without punishing normal use
- Aligns with Primavera's own subscription model (familiar to buyers)

### 4.2 Pricing Tiers

| | **Starter** | **Professional** | **Business** | **Enterprise** |
|--|------------|-----------------|-------------|---------------|
| **Price** | **€29/month** | **€79/month** | **€199/month** | **€399/month** |
| **Annual** (20% off) | €23/month | €63/month | €159/month | €319/month |
| Included queries | 200 | 1,000 | 5,000 | 20,000 |
| Users | 3 | 10 | 25 | Unlimited |
| Connectors | 1 | 1 | 3 | 10 |
| Saved reports | 10 | 50 | Unlimited | Unlimited |
| Dashboards | 1 | 5 | Unlimited | Unlimited |
| Scheduled reports | — | 5 | 25 | Unlimited |
| Email recipients | — | 10 | 50 | Unlimited |
| Export (CSV/PDF) | CSV only | CSV + PDF | CSV + PDF + XLSX | All + API |
| AI Model | Haiku | Haiku + Sonnet | Sonnet | Sonnet + Priority |
| Support | Email | Email (24h) | Priority (4h) | Dedicated + Onboarding |
| SSO / SAML | — | — | — | Yes |
| Audit log | 30 days | 90 days | 1 year | 2 years |
| Data residency (EU) | Shared | Shared | Dedicated | Dedicated |
| **Overage per query** | **€0.15** | **€0.10** | **€0.06** | **€0.04** |

### 4.3 Free Trial

- **14-day free trial** on Professional plan (no credit card required)
- 100 queries included during trial
- Converts to Starter if no upgrade after trial
- Shows "X queries remaining" prominently to drive urgency

### 4.4 Why These Prices Work (Portuguese/Iberian Market)

**Context:**
- Primavera has 55,000+ customers, mostly SMBs
- A custom report from a Primavera consultant costs **€500-2,000**
- Power BI Pro costs **€9.40/user/month** but requires SQL knowledge
- Primavera's own BI modules cost **€50-150/user/month**

**Value proposition:**
- Starter at €29/month < cost of ONE consultant report
- Professional at €79/month = 1-2 Power BI licenses but NO SQL knowledge needed
- Business at €199/month replaces a part-time analyst

**Competitive positioning:** Cheaper than hiring, faster than consultants, simpler than Power BI.

---

## 5. Unit Economics & Margins

### 5.1 Per-Tier Gross Margin (Monthly, Typical Usage)

| Tier | Revenue | Typical Queries | Our AI Cost | Our Infra | Our Total Cost | **Gross Margin** |
|------|---------|----------------|-------------|-----------|---------------|-----------------|
| **Starter** | €29 | ~150 | €0.75 | €0.10 | €0.85 | **97%** |
| **Professional** | €79 | ~700 | €4.20 | €0.50 | €4.70 | **94%** |
| **Business** | €199 | ~3,500 | €21.00 | €2.00 | €23.00 | **88%** |
| **Enterprise** | €399 | ~15,000 | €90.00 | €8.00 | €98.00 | **75%** |

### 5.2 At Maximum Query Usage (Worst Case)

| Tier | Revenue | Max Queries | Our AI Cost | **Gross Margin** |
|------|---------|------------|-------------|-----------------|
| **Starter** | €29 | 200 | €1.00 | **96%** |
| **Professional** | €79 | 1,000 | €6.00 | **92%** |
| **Business** | €199 | 5,000 | €30.00 | **85%** |
| **Enterprise** | €399 | 20,000 | €120.00 | **70%** |

Even at maximum usage, every tier is profitable. The margins are excellent because:
1. AI costs are dominated by **input tokens**, which we **cache aggressively** (90% savings)
2. Cloudflare infrastructure costs are essentially **negligible** at our scale
3. Smart routing sends 60% of queries to Haiku (~3x cheaper)

### 5.3 Overage Revenue (Pure Profit Engine)

| Tier | Overage Rate | Our Cost Per Query | **Overage Margin** |
|------|-------------|-------------------|-------------------|
| Starter | €0.15 | ~€0.006 | **96%** |
| Professional | €0.10 | ~€0.006 | **94%** |
| Business | €0.06 | ~€0.005 | **92%** |
| Enterprise | €0.04 | ~€0.005 | **87%** |

### 5.4 Breakeven Analysis

| Fixed Costs (Monthly) | Amount |
|----------------------|--------|
| Cloudflare base | €5 |
| Resend | €20 |
| Code signing (amortized) | €35 |
| Domain (amortized) | €1 |
| **Total Fixed** | **~€61/month** |

**Breakeven: 3 Starter customers or 1 Professional customer.**

---

## 6. Revenue Projections

### 6.1 Year 1 (Conservative)

| Quarter | Customers | Mix (S/P/B/E) | MRR | AI Costs | Infra | **Net Margin** |
|---------|-----------|---------------|-----|----------|-------|---------------|
| Q1 | 15 | 10/4/1/0 | €825 | €45 | €25 | €755 (91%) |
| Q2 | 40 | 25/10/4/1 | €2,245 | €150 | €40 | €2,055 (92%) |
| Q3 | 80 | 45/22/10/3 | €5,367 | €420 | €60 | €4,887 (91%) |
| Q4 | 150 | 80/42/20/8 | €11,238 | €950 | €100 | €10,188 (91%) |

**Year 1 Total Revenue: ~€235K | Year 1 Net: ~€215K**

### 6.2 Year 2 (Growth)

| Metric | Value |
|--------|-------|
| Customers | 500 |
| MRR (Q4) | ~€45K |
| ARR | ~€540K |
| Gross Margin | ~88% |

### 6.3 Addressable Market

- Primavera has **55,000+ customers**
- Even **1% penetration** = 550 customers × ~€100 avg MRR = **€55K MRR = €660K ARR**
- At **5% penetration** = 2,750 customers = **€275K MRR = €3.3M ARR**

---

## 7. Billing Implementation

### 7.1 Payment Provider: Stripe

- Supports EUR natively
- Subscription billing with metered usage (overage)
- Portuguese tax compliance (IVA/VAT handling)
- Stripe Checkout for onboarding
- Stripe Customer Portal for self-service plan management
- Webhook integration with Cloudflare Workers

### 7.2 Billing Architecture

```
Stripe Checkout → Subscribe → Webhook → D1 (update org plan)
                                            ↓
                              Every query → increment counter in D1
                                            ↓
                              End of billing period → Stripe Usage Record API
                                            ↓
                              Stripe invoices overage automatically
```

### 7.3 Query Counting

```sql
-- In D1, track per-org usage
UPDATE organizations
SET queries_this_month = queries_this_month + 1
WHERE id = ?;

-- Check quota before executing
SELECT queries_this_month, max_queries_per_month
FROM organizations WHERE id = ?;
-- If over: check if overage enabled, else return 402 with upgrade prompt
```

### 7.4 Usage Dashboard (Frontend)

Show users in real-time:
- Queries used vs. included (progress bar)
- Estimated overage cost this month
- Historical usage by day/week
- Usage by user (for admins)
- "Upgrade" CTA when approaching limit

### 7.5 IVA/VAT Handling

- Portuguese companies: charge 23% IVA
- EU companies with valid VAT ID: reverse charge (0%)
- Non-EU: no IVA
- Stripe Tax handles this automatically
- Invoice must include: NIF, company name, IVA number, tax breakdown

---

## 8. Pricing Page Design

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Planos simples e transparentes                    │
│         Comece gratuitamente. Atualize quando precisar.             │
│                                                                      │
│  [Mensal]  [Anual - Poupe 20%]                                      │
│                                                                      │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │ Starter  │  │ Professional │  │  Business    │  │ Enterprise │  │
│  │          │  │  ⭐ Popular  │  │              │  │            │  │
│  │ €29/mês  │  │  €79/mês     │  │  €199/mês   │  │  €399/mês  │  │
│  │          │  │              │  │              │  │            │  │
│  │ 200      │  │ 1,000       │  │ 5,000       │  │ 20,000    │  │
│  │ consultas│  │ consultas    │  │ consultas   │  │ consultas  │  │
│  │          │  │              │  │              │  │            │  │
│  │ 3 users  │  │ 10 users     │  │ 25 users    │  │ Ilimitado  │  │
│  │ 1 DB     │  │ 1 DB         │  │ 3 DBs       │  │ 10 DBs     │  │
│  │          │  │              │  │              │  │            │  │
│  │[Começar] │  │[Experimentar]│  │[Começar]    │  │[Contactar] │  │
│  └──────────┘  └──────────────┘  └──────────────┘  └────────────┘  │
│                                                                      │
│  Todas os planos incluem: Segurança SSL · RGPD · Suporte PT        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 9. Cost Reduction Roadmap

| Phase | Optimization | Expected Savings |
|-------|-------------|-----------------|
| **Launch** | Prompt caching (5-min) | 50-60% on AI input tokens |
| **Month 2** | Smart routing (Haiku for simple queries) | 40% on AI costs |
| **Month 3** | Query result caching (15-min KV) | 15-20% fewer AI calls |
| **Month 6** | Popular query templates (no AI needed) | 10-15% fewer AI calls |
| **Month 9** | Batch API for scheduled reports | 50% on scheduled report AI costs |
| **Month 12** | Fine-tuned small model for simple queries | 80% cost reduction on simple queries |
| **Year 2** | Negotiate volume discount with Anthropic | 20-30% across the board |

**Projected blended cost per query over time:**
- Launch: ~$0.010
- Month 6: ~$0.006
- Month 12: ~$0.004
- Year 2: ~$0.003

---

## 10. Key Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Pricing model | Subscription + quota + overage | Predictable for buyers, captures upside |
| Currency | EUR | Target market is Iberia + PALOP |
| Billing provider | Stripe | EUR-native, IVA handling, metered billing |
| Default AI model | Haiku for Starter, Sonnet for Pro+ | Cost vs quality tradeoff by tier |
| Free trial | 14 days, 100 queries, no CC | Low friction, high conversion |
| Annual discount | 20% | Standard B2B SaaS practice |
| Connector count per tier | 1/1/3/10 | Most SMBs have 1 DB; enterprise may have multiple companies |
| Overage pricing | €0.15 → €0.04 (tiered) | Encourages upgrades, pure margin |
