import {isAssistantTimeZone} from './assistant-dates.js';
import {z} from 'zod';
import type {Paginated} from './property-contracts.js';
import type {AiSource} from './ai-contracts.js';
import type {LeadPreferences} from './lead-contracts.js';
const id=z.uuid(),key=z.uuid(),text=(n:number)=>z.string().trim().min(1).max(n).refine(v=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v));
export const conversationPageSchema=z.object({page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(1).max(50).default(25)}).strict();
export const askReportContextSchema=z.object({from:z.iso.date(),to:z.iso.date(),groupId:id.optional(),region:z.string().trim().min(1).max(100).optional(),agentMembershipId:id.optional(),teamId:id.optional(),attention:z.enum(['all','missing_documents','follow_up_due','staff_review']).optional(),q:z.string().trim().max(200).optional()}).strict().refine(v=>v.from<=v.to&&Date.parse(v.to)-Date.parse(v.from)<=1095*86400000);
export const askContextSchema=z.object({page:z.string().regex(/^\/admin(?:\/[a-z-]+)?$/).default('/admin'),propertyId:id.optional(),leadId:id.optional(),applicationId:id.optional(),maintenanceRequestId:id.optional(),taskId:id.optional(),viewingId:id.optional(),contactId:id.optional(),unitId:id.optional(),report:askReportContextSchema.optional()}).strict();
export const askCreateSchema=z.object({requestKey:key,context:askContextSchema}).strict();
export const askMessageSchema=z.object({requestKey:key,message:text(1500),pageContext:askContextSchema.optional(),choiceToken:key.optional(),timeZone:z.string().trim().min(1).max(100).refine(isAssistantTimeZone,'Choose a valid timezone.').optional(),task:z.object({title:text(300),dueAt:z.iso.datetime({offset:true}),priority:z.enum(['low','normal','high','urgent']).default('normal')}).strict().optional()}).strict();
export const actionConfirmSchema=z.object({requestKey:key,confirm:z.literal(true)}).strict();
export const conversationDirectorySchema=conversationPageSchema.extend({propertyId:id.optional(),ownership:z.enum(['all','ai_active','staff_requested','staff_handling']).default('all'),q:z.string().trim().max(200).default('')}).strict();
export const channelPublishSchema=z.object({requestKey:key,propertyId:id,enabled:z.boolean(),label:text(160),quietStart:z.number().int().min(0).max(23).default(21),quietEnd:z.number().int().min(0).max(23).default(8),timeZone:z.string().min(1).max(100).refine(v=>{try{new Intl.DateTimeFormat('en',{timeZone:v}).format();return true;}catch{return false;}}).default('Africa/Lagos')}).strict();
export const publicStartSchema=z.object({requestKey:key,channelId:id,name:text(200),email:z.union([z.email().max(254),z.literal('')]).default(''),message:text(1500),consent:z.boolean().default(false)}).strict();
const token=z.string().regex(/^[a-f0-9]{64}$/);
export const publicReadSchema=z.object({token,...conversationPageSchema.shape}).strict();
export const publicMessageSchema=z.object({token,requestKey:key,message:text(1500),preferences:z.object({bedrooms:z.number().int().min(0).max(100).nullable().optional(),budgetMax:z.number().min(0).max(9999999999).nullable().optional(),moveInOn:z.iso.date().nullable().optional(),locations:z.array(text(200)).max(10).optional()}).strict().optional()}).strict();
export const conversationReplySchema=z.object({requestKey:key,body:text(3000),kind:z.enum(['staff','internal_note','draft']).default('staff')}).strict();
export const conversationOwnershipSchema=z.object({requestKey:key,ownership:z.enum(['ai_active','staff_requested','staff_handling'])}).strict();
export const conversationConsentSchema=z.object({token,requestKey:key,consent:z.boolean()}).strict();
export const conversationSimulateSchema=z.object({requestKey:key,channelId:id,name:text(200),message:text(1500),consent:z.boolean().default(true)}).strict();
export const outboxProcessSchema=z.object({requestKey:key,outcome:z.enum(['sent','delivered','temporary_failure']).default('delivered')}).strict();
export const publicSlotsSchema=z.object({token,date:z.iso.date().optional(),page:z.number().int().min(1).default(1),pageSize:z.number().int().min(1).max(25).default(10)}).strict();
export const publicBookSchema=z.object({token,requestKey:key,startsAt:z.iso.datetime({offset:true}),slotKey:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export type AskContext=z.infer<typeof askContextSchema>;
export type AskRecordKind='property'|'unit'|'contact'|'lead'|'application'|'maintenance'|'viewing'|'task';
export interface AskRecordReference{kind:AskRecordKind;id:string;propertyId?:string;leadId?:string;contactId?:string;label:string;url:string}
export interface AskChoice{token:string;label:string}export interface AskThread{id:string;context:AskContext;title:string;createdAt:string;updatedAt:string}
export interface AskAction{id:string;kind:'create_task'|'update_task';status:'proposed'|'completed'|'failed';preview:{title:string;dueAt:string;priority:string;propertyId:string;context?:AskContext;taskId?:string;version?:number;ownerMembershipId?:string|null;ownerName?:string;status?:'open'|'completed'|'cancelled';completionComment?:string};taskId:string|null;url:string|null}
export interface AskMessage{id:string;role:'staff'|'assistant';body:string;mode:'simulated'|'live'|'not_configured';status:'completed'|'failed'|'handoff'|'queued';sources:Array<AiSource|{id:string;kind:string;title:string;url:string;excerpt:string;verifiedAt:string|null;simulated:boolean}>;action:AskAction|null;choices?:AskChoice[];references?:AskRecordReference[];createdAt:string}
export interface AskThreadRemoval{removed:true}
export interface AskThreadDetail{thread:AskThread;messages:Paginated<AskMessage>;notice:string}
export interface ConversationChannel{id:string;propertyId:string;propertyName:string;label:string;enabled:boolean;timeZone:string;quietStart:number;quietEnd:number;mode:'simulation'|'native'}
export interface ConversationMessage{id:string;role:'customer'|'assistant'|'staff'|'internal_note'|'draft'|'system';body:string;status:'received'|'proposed'|'queued'|'sent'|'delivered'|'failed'|'cancelled';mode:'simulation'|'native'|'live_model'|'not_configured';sources:Array<{title:string;excerpt:string;verifiedAt:string|null}>;createdAt:string}
export interface CustomerConversation{id:string;property:{id:string;name:string};customerName:string;leadId:string;contactId:string;ownership:'ai_active'|'staff_requested'|'staff_handling';consent:boolean;preferences:Partial<LeadPreferences>;updatedAt:string;createdAt:string;mode:'simulation'|'native';channel:'website'|'simulator'|'voice'|'resident';identityVerified:boolean}
export interface ConversationDetail{conversation:CustomerConversation;messages:Paginated<ConversationMessage>;notice:string;access:{canManage:boolean};reply?:{kind:'text'|'voice'|'unavailable';label:string;url?:string};booking?:{status:string;startsAt:string;endsAt:string}|null}
export interface PublicConversationDetail{conversation:{id:string;propertyName:string;ownership:CustomerConversation['ownership'];consent:boolean;mode:'simulation'|'native';identityVerified:false};messages:Paginated<ConversationMessage>;notice:string;booking?:{status:string;startsAt:string;endsAt:string}|null}
export interface PublicConversationStart{token:string;expiresAt:string;detail:PublicConversationDetail}
export interface ConversationConfiguration{channels:ConversationChannel[];canConfigure:boolean;canSimulate?:boolean;transports:{website:'local'|'native';email:'not_configured';sms:'not_configured'};notice:string}
export interface ConversationDirectory extends Paginated<CustomerConversation>{}
