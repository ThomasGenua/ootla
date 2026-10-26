import{z}from'zod';import type{Paginated}from'./property-contracts.js';
export const retentionCategories=['conversation_transcripts','assistant_history','retired_knowledge','operational_traces','closed_record_files']as const;
export const retentionUpdateSchema=z.object({requestKey:z.uuid(),policies:z.array(z.object({category:z.enum(retentionCategories),retentionDays:z.number().int().min(1).max(36500).nullable()}).strict()).max(5)}).strict().refine(v=>new Set(v.policies.map(p=>p.category)).size===v.policies.length,'Use one policy per category.');
export const retentionRunSchema=z.object({requestKey:z.uuid(),confirmation:z.literal('PURGE EXPIRED CONTENT')}).strict();
export const auditQuerySchema=z.object({q:z.string().trim().max(120).default(''),action:z.string().trim().max(120).default(''),from:z.iso.date().optional(),to:z.iso.date().optional(),page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(1).max(100).default(25)}).strict().refine(v=>!v.from||!v.to||v.from<=v.to,'Choose an ordered date range.');
export type RetentionCategory=typeof retentionCategories[number];
export interface RetentionPolicy{category:RetentionCategory|'core_crm'|'audit_history'|'exports'|'voice';label:string;retentionDays:number|null;enabled:boolean;supported:boolean;notice:string}
export interface RetentionSnapshot{policies:RetentionPolicy[];lastRunAt:string|null;notice:string}
export interface RetentionPreview{items:{category:RetentionCategory;eligible:number}[];notice:string}
export interface RetentionResult{runId:string;counts:Record<string,number>;completedAt:string;notice:string}
export interface IntegrationHealthItem{key:string;name:string;status:'not_configured'|'simulated'|'configured_unverified'|'live_verified'|'degraded'|'disconnected';mode:string;lastSuccessAt:string|null;lastAttemptAt:string|null;freshness:string;reason:string|null;nextStep:string;controls:{label:string;href:string}[]}
export interface IntegrationHealth{services:IntegrationHealthItem[];observedAt:string;notice:string}
export interface AuditItem{id:string;action:string;actor:{id:string;name:string}|null;recordType:string|null;recordId:string|null;occurredAt:string;source:string;outcome:string;metadata:Record<string,string|number|boolean|null>}
export interface AuditDirectory extends Paginated<AuditItem>{observedAt:string}
