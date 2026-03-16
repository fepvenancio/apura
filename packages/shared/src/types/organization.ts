/** Available subscription plans. */
export type PlanType = 'trial' | 'starter' | 'professional' | 'business' | 'enterprise';

/** Organization record as stored in D1. */
export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: PlanType;
  primavera_version: string;
  agent_api_key: string;
  max_users: number;
  max_queries_per_month: number;
  queries_this_month: number;
  billing_email: string;
  country: string;
  timezone: string;
  created_at: string;
  updated_at: string;
}

/** Numeric limits enforced per plan tier. */
export interface PlanLimits {
  /** Maximum natural-language queries per month. */
  maxQueries: number;
  /** Maximum team members. */
  maxUsers: number;
  /** Maximum Primavera connectors (on-prem agents). */
  maxConnectors: number;
  /** Maximum saved reports. */
  maxReports: number;
  /** Maximum dashboards. */
  maxDashboards: number;
  /** Maximum scheduled report runs. */
  maxSchedules: number;
  /** Cost per query above the monthly quota (USD). */
  overagePerQuery: number;
  /** AI model(s) available for query generation. */
  aiModel: 'haiku' | 'sonnet' | 'both';
}

/** Plan limits keyed by plan type. */
export const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  trial: {
    maxQueries: 100,
    maxUsers: 2,
    maxConnectors: 1,
    maxReports: 5,
    maxDashboards: 1,
    maxSchedules: 0,
    overagePerQuery: 0,
    aiModel: 'haiku',
  },
  starter: {
    maxQueries: 200,
    maxUsers: 3,
    maxConnectors: 1,
    maxReports: 10,
    maxDashboards: 1,
    maxSchedules: 0,
    overagePerQuery: 0.15,
    aiModel: 'haiku',
  },
  professional: {
    maxQueries: 1000,
    maxUsers: 10,
    maxConnectors: 1,
    maxReports: 50,
    maxDashboards: 5,
    maxSchedules: 5,
    overagePerQuery: 0.10,
    aiModel: 'both',
  },
  business: {
    maxQueries: 5000,
    maxUsers: 25,
    maxConnectors: 3,
    maxReports: 999999,
    maxDashboards: 999999,
    maxSchedules: 25,
    overagePerQuery: 0.06,
    aiModel: 'sonnet',
  },
  enterprise: {
    maxQueries: 20000,
    maxUsers: 999999,
    maxConnectors: 10,
    maxReports: 999999,
    maxDashboards: 999999,
    maxSchedules: 999999,
    overagePerQuery: 0.04,
    aiModel: 'sonnet',
  },
};
