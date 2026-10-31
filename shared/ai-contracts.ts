import {isAssistantTimeZone} from './assistant-dates.js';
import {z} from 'zod';
import type {Paginated} from './property-contracts.js';
export const aiIntents=['property_question','availability','viewing_options','application_checklist','create_follow_up','staff_handoff'] as const;
export type AiIntent=typeof aiIntents[number];
const text=(max:number)=>z.string().trim().min(1).max(max).refine(v=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v));
export const aiTaskSchema=z.object({title:text(300),dueAt:z.iso.datetime({offset:true}),priority:z.enum(['low','normal','high','urgent']).default('normal')}).strict();
export const aiRequestSchema=z.object({requestKey:z.uuid(),message:text(1500),timeZone:z.string().trim().min(1).max(100).refine(isAssistantTimeZone,'Choose a valid timezone.').optional(),propertyId:z.uuid(),applicationId:z.uuid().optional(),leadId:z.uuid().optional(),task:aiTaskSchema.optional(),confirmAction:z.literal(true).optional()}).strict();
export const aiOptionsSchema=z.object({propertyId:z.uuid().optional(),propertySearch:z.string().trim().max(120).default(''),recordSearch:z.string().trim().max(120).default(''),page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(1).max(25).default(25)}).strict();
export const aiKnowledgeQuerySchema=z.object({propertyId:z.uuid(),q:z.string().trim().max(120).default(''),page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(1).max(25).default(25)}).strict();
export const aiKnowledgeCreateSchema=z.object({requestKey:z.uuid(),propertyId:z.uuid(),title:text(160),body:text(4000),status:z.enum(['draft','approved']),publicEnabled:z.boolean().default(false)}).strict();
export const aiKnowledgeUpdateSchema=z.object({requestKey:z.uuid(),title:text(160).optional(),body:text(4000).optional(),status:z.enum(['draft','approved','retired']).optional(),publicEnabled:z.boolean().optional()}).strict().refine(v=>Object.keys(v).length>1);
export const aiStructuredResultSchema=z.object({response:text(3000),internalSummary:text(300),sourceIds:z.array(z.string().min(1).max(180)).max(12),proposedActions:z.array(z.object({name:z.literal('create_staff_task'),arguments:aiTaskSchema}).strict()).max(1),handoffReason:z.string().trim().max(300).nullable()}).strict();
export interface AiSource{version?:number;id:string;kind:'knowledge'|'property'|'availability'|'viewing'|'application_checklist'|'lead'|'task'|'report'|'maintenance';title:string;url:string;excerpt:string;verifiedAt:string|null;simulated:boolean}
export interface AiToolTrace{name:string;status:'completed'|'failed'|'refused'|'skipped';reason:string}
export interface AiResponse{
 id:string;mode:'simulated'|'live'|'not_configured';intent:AiIntent;response:string;internalSummary:string;sources:AiSource[];
 actions:{name:string;status:'completed'|'failed'|'refused'|'proposed';taskId?:string;url?:string;message:string}[];
 executionStatus:'queued'|'completed'|'partial'|'handoff'|'refused'|'failed';staffHandoffReason:string|null;
 trace:{tools:AiToolTrace[];latencyMs:number;usage:{inputTokens:number;outputTokens:number;estimated:boolean;costMicros:number}};createdAt:string;
}
export interface AiConfiguration{mode:AiResponse['mode'];label:string;notice:string;limits:{maxRequestsPerMinute:number;maxTokensPerRequest:number;dailyTokenBudget:number;dailyCostBudgetMicros:number;timeoutMs:number};access:{canRun:boolean;canManageKnowledge:boolean};capabilities:AiIntent[]}
export interface AiOptions{properties:Paginated<{id:string;name:string}>;selectedProperty:{id:string;name:string}|null;applications:{id:string;label:string;status:string;leadId:string|null}[];applicationTotal:number;leads:{id:string;name:string;stage:string}[];leadTotal:number}
export interface AiKnowledge{publicEnabled?:boolean;id:string;propertyId:string;title:string;body:string;status:'draft'|'approved'|'retired';version:number;approvedAt:string|null;updatedAt:string}
export interface AiKnowledgeDirectory extends Paginated<AiKnowledge>{access:{canManage:boolean}}
