import { z } from 'zod';
import { dashboardPeriodSchema, type DashboardPeriod } from './contracts.js';

/** Page-wide snapshots: directory filters/pagination do not change these counts. */
export const adminSummaryPageSchema = z.enum([
  'attention','intake','inbox','automations','residents','workspace','knowledge','reports',
  'team', 'onboarding', 'leads', 'properties', 'contacts', 'applications', 'calendar', 'tasks',
  'imports', 'integrations', 'analytics', 'ai', 'profile', 'settings',
]);
export type AdminSummaryPage = z.infer<typeof adminSummaryPageSchema>;
export const adminSummaryQuerySchema = z.object({
  page: adminSummaryPageSchema,
  period: dashboardPeriodSchema.default('month'),
}).strict();
export interface AdminSummaryMetric {
  key: string;
  label: string;
  value: number | string | null;
  icon: 'users' | 'home' | 'calendar' | 'document' | 'key' | 'check' | 'clock' | 'link' | 'sparkles' | 'settings';
  note?: string;
}
export interface AdminPageSummary {
  page: AdminSummaryPage;
  scopeLabel: string;
  period: DashboardPeriod | null;
  metrics: [AdminSummaryMetric, AdminSummaryMetric, AdminSummaryMetric, AdminSummaryMetric];
}
