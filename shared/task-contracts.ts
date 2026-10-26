import { z } from 'zod';
import type { LeadOwner } from './lead-contracts.js';
import type { Paginated } from './property-contracts.js';
const text = (n: number) => z.string().trim().min(1).max(n).refine(v => !/[\u0000-\u001f\u007f]/.test(v));
const details = z.string().trim().max(5000).refine(v => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v));
export const taskStatuses = ['open', 'completed', 'cancelled'] as const;
export const taskPriorities = ['low', 'normal', 'high', 'urgent'] as const;
export type TaskStatus = typeof taskStatuses[number];
export type TaskPriority = typeof taskPriorities[number];
export const taskPageSchema = z.object({ page: z.coerce.number().int().min(1).max(1000000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) }).strict();
export const taskDirectorySchema = taskPageSchema.extend({ view: z.enum(['my', 'team', 'unassigned']).default('my'), q: z.string().trim().max(200).default(''), propertyId: z.uuid().optional(), ownerMembershipId: z.uuid().optional(), teamId: z.uuid().optional(), status: z.enum(['open', 'completed', 'cancelled', 'all']).default('open'), priority: z.enum(taskPriorities).optional(), overdue: z.enum(['true', 'false']).optional(), sort: z.enum(['due_asc', 'due_desc', 'created_desc']).default('due_asc') }).strict();
export const taskCreateSchema = z.object({ propertyId: z.uuid(), leadId: z.uuid().nullable().default(null), contactId: z.uuid().nullable().default(null), applicationId: z.uuid().nullable().default(null), tourId: z.uuid().nullable().default(null), maintenanceRequestId:z.uuid().nullable().optional(), title: text(300), details: details.default(''), dueAt: z.iso.datetime({ offset: true }), priority: z.enum(taskPriorities).default('normal'), ownerMembershipId: z.uuid().nullable().default(null), assignment: z.enum(['manual', 'routing']).default('manual') }).strict();
export const taskUpdateSchema = z.object({ version: z.number().int().positive(), title: text(300).optional(), details: details.optional(), dueAt: z.iso.datetime({ offset: true }).optional(), priority: z.enum(taskPriorities).optional(), status: z.enum(taskStatuses).optional(), ownerMembershipId: z.uuid().nullable().optional(), assignment: z.enum(['manual', 'routing']).optional() }).strict().refine(v => Object.keys(v).length > 1);
export const taskOptionsSchema = z.object({ propertyId: z.uuid().optional(), leadId: z.uuid().optional(),q:z.string().trim().max(200).default('') }).strict();
export const taskFollowupsSchema = z.object({ stages: z.string().max(400).regex(/^[a-z_,]*$/).default(''), q: z.string().trim().max(200).default('') }).strict();
export const taskTeamSchema = z.object({ name: text(120), membershipIds: z.array(z.uuid()).max(100).refine(v => new Set(v).size === v.length) }).strict();
export const taskRoutingSchema = z.object({ propertyId: z.uuid(), teamId: z.uuid().nullable(), enabled: z.boolean() }).strict();
export const taskSnoozeSchema = z.object({ minutes: z.union([z.literal(15), z.literal(60), z.literal(1440)]) }).strict();
export interface TaskRecord {
    purpose?: 'crm' | 'move_in';
    id: string;
    propertyId: string;
    propertyName: string;
    leadId: string | null;
    contactId: string | null;
    contactName: string | null;
    applicationId: string | null;
    tourId: string | null;
    maintenanceRequestId?:string|null;
    title: string;
    details: string;
    dueAt: string;
    overdue: boolean;
    priority: TaskPriority;
    status: TaskStatus;
    origin: 'manual' | 'demo' | 'ai_simulation' | 'import' | 'system';
    owner: LeadOwner | null;
    team: {
        id: string;
        name: string;
    } | null;
    assignment: 'manual' | 'routing';
    assignmentNotice: string | null;
    version: number;
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
    completedBy: {
        id: string;
        name: string;
    } | null;
    relatedUrl: string;
    relatedLabel: string;
    linkedRecord?: {kind:'application'|'tour';id:string;status:string|null;startsAt:string|null;available:boolean};
    leadStage: string | null;
    leadStageLabel: string | null;
    unitDescription: string | null;
    actionable: boolean;
}
export interface TaskEvent {
    id: string;
    kind: 'created' | 'updated' | 'completed' | 'reopened' | 'cancelled' | 'assigned' | 'reminder_snoozed';
    actor: {
        id: string;
        name: string;
    } | null;
    occurredAt: string;
    metadata: Record<string, unknown>;
}
export interface TaskDetail {
    task: TaskRecord;
    history: Paginated<TaskEvent>;
    access: {
        canManage: boolean;
    };
}
export interface TaskDirectory extends Paginated<TaskRecord> {
    access: {
        canManage: boolean;
        canConfigure: boolean;
    };
}
export interface TaskTeam {
    id: string;
    name: string;
    membershipIds: string[];
}
export interface TaskRoutingRule {
    id: string;
    propertyId: string;
    propertyName: string;
    teamId: string | null;
    teamName: string | null;
    enabled: boolean;
}
export interface TaskOptions {
    owners: LeadOwner[];
    ownerTotal: number;
    teams: TaskTeam[];
    rules: TaskRoutingRule[];
    access: {
        canManage: boolean;
        canConfigure: boolean;
    };
    reminderPolicy: {
        channel: 'in_app';
        maximumAttempts: 3;
        maximumSnoozes: 3;
        snoozeMinutes: readonly [
            15,
            60,
            1440
        ];
        maximumSnoozeDays: 7;
    };
}
export interface TaskReminder {
    id: string;
    taskId: string;
    title: string;
    dueAt: string;
    propertyName: string;
    relatedUrl: string;
    deliveredAt: string | null;
    status: 'delivered' | 'snoozed';
    snoozedUntil: string | null;
    snoozeCount: number;
    canSnooze: boolean;
}
