import { z } from 'zod';
import { staffRoleSchema } from './contracts.js';
export const assistantActionSchema = z.enum(['summary', 'follow_up', 'next_actions']);
export const assistantRequestSchema = z.object({ leadId: z.uuid(), requestKey: z.uuid(), action: assistantActionSchema }).strict();
export const assistantOutputSchema = z.object({
 title: z.string().min(1).max(160), body: z.string().min(1).max(4000),
 nextActions: z.array(z.string().min(1).max(400)).max(5),
 cautions: z.array(z.string().min(1).max(400)).max(5),
}).strict();
export type AssistantOutput = z.infer<typeof assistantOutputSchema>;
export interface AssistantResult { id: string; leadId: string; action: string; mode: 'demo'|'live'; status: string; result: AssistantOutput|null; createdAt: string; reviewedAt: string|null }
export const inviteStaffSchema = z.object({ email: z.email().trim().toLowerCase().max(254), name: z.string().trim().min(1).max(200), role: staffRoleSchema, propertyIds: z.array(z.uuid()).max(100), currentPassword: z.string().min(1).max(1024) }).strict();
export const recoveryStaffSchema = z.object({ userId: z.uuid(), currentPassword: z.string().min(1).max(1024) }).strict();
export const acceptStaffSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: z.string().min(12).max(128) }).strict();
export interface TeamWorkspace {
 members: Array<{ id:string; userId:string; name:string; email:string; role:string; active:boolean; properties:string[] }>;
 properties: Array<{ id:string; name:string }>;
 links: Array<{ id:string; email:string; kind:string; expiresAt:string; consumedAt:string|null; revokedAt:string|null }>;
 totalMembers: number; page:number; pageSize:number; totalProperties:number; propertyPage:number;
}
export interface AnalyticsSnapshot {
 days:number; asOf:string; cohortLeads:number; toured:number; applicationsStarted:number; applicationsSubmitted:number; leased:number;
 inquiryToTourPercent:number|null; applicationCompletionPercent:number|null; medianDaysToLease:number|null; overdueTasks:number;
 stages:Array<{stage:string;count:number}>; sources:Array<{source:string;leads:number;leased:number}>;
}
