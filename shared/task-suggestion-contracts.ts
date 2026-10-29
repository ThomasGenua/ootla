import {z} from 'zod';
import type {TaskRecord} from './task-contracts.js';
export const suggestionConfirmSchema=z.object({action:z.enum(['assign','complete','email_draft','viewing']),version:z.number().int().positive(),confirm:z.literal(true),ownerMembershipId:z.uuid().optional(),comment:z.string().trim().max(2000).refine(v=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)).optional()}).strict();
export interface RecordSuggestion {id:string;kind:'assign'|'complete'|'email_draft'|'viewing'|'open';label:string;description:string;ownerMembershipId?:string;url?:string}
export interface TaskSuggestions {summary:string;context:string[];actions:RecordSuggestion[];canManage:boolean;version:number}
export interface TaskSuggestionResult {version?:number;task?:TaskRecord;draft?:{id:string;subject:string;body:string;url:string};url?:string;message:string}
