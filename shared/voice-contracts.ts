import {z} from 'zod';
import type {Paginated} from './property-contracts.js';
import type {PublicCalendarInvitation,PublicCalendarConfirmation} from './calendar-contracts.js';
const text=(n:number)=>z.string().trim().max(n).refine(v=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v));
export const voiceScenarios=['property_questions','viewing_enquiry','application_next_steps','staff_handoff'] as const;
export const voiceEventKinds=['transcript','silence','unclear','interruption','timeout','provider_failure','repeat','slot_unavailable','failed_transfer','end'] as const;
export const voiceSettingsSchema=z.object({requestKey:z.uuid(),enabled:z.boolean(),retentionDays:z.number().int().min(0).max(30),consentRequired:z.boolean(),consentNotice:text(1200).nullable(),recordingEnabled:z.literal(false)}).strict().refine(v=>!v.consentRequired||Boolean(v.consentNotice),'Configure approved client consent wording before requiring consent.');
export const voiceStartSchema=z.object({requestKey:z.uuid(),channelId:z.uuid(),name:text(200).min(1).default('Demo voice caller'),scenario:z.enum(voiceScenarios),consentAccepted:z.boolean().default(false)}).strict();
export const voiceEventSchema=z.object({requestKey:z.uuid(),kind:z.enum(voiceEventKinds),text:text(1500).optional()}).strict().refine(v=>v.kind!=='transcript'||Boolean(v.text),'Provide synthetic transcript text.');
export const voiceListSchema=z.object({propertyId:z.uuid().optional(),q:text(200).default(''),page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(1).max(50).default(25)}).strict();
export const voicePageSchema=z.object({page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(1).max(50).default(25)}).strict();
export const voiceActionSchema=z.object({requestKey:z.uuid()}).strict();
export const voiceVerifySchema=voiceActionSchema.extend({applicationId:z.uuid()}).strict();
export const voiceSlotsSchema=z.object({date:z.iso.date().optional(),page:z.coerce.number().int().min(1).max(1000).default(1),pageSize:z.coerce.number().int().min(1).max(25).default(10)}).strict();
export const voiceBookSchema=voiceActionSchema.extend({startsAt:z.iso.datetime({offset:true}),slotKey:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export interface VoiceSettings{enabled:boolean;retentionDays:number;consentRequired:boolean;consentNotice:string|null;recordingEnabled:false;provider:'not_configured';mode:'disabled'|'transcript_playback';canConfigure:boolean;canReadTranscripts:boolean;notice:string}
export interface VoiceOptions{channels:Paginated<{id:string;propertyId:string;propertyName:string;label:string}>;notice:string}
export type VoiceSessionStatus='active'|'interrupted'|'awaiting_staff'|'completed'|'timed_out'|'failed';
export interface VoiceSession{id:string;conversationId:string;leadId:string;contactId:string;property:{id:string;name:string};name:string;scenario:typeof voiceScenarios[number];status:VoiceSessionStatus;outcome:string;summary:string;startedAt:string;endedAt:string|null;lastEventAt:string;turnCount:number;recordingEnabled:false;mode:'transcript_playback';conversationUrl:string;transcriptState:'off'|'retained'|'expired'|'deleted'}
export interface VoiceTurn{id:string;kind:string;input:string|null;output:string|null;private:boolean;recognition:string;dialogue:string;tool:string;outputState:string;handoff:string;createdAt:string;expiresAt:string|null}
export interface VoiceDetail{session:VoiceSession;turns:Paginated<VoiceTurn>;lastOutput:string|null;verification:{verified:boolean;applicationId:string|null;expiresAt:string|null;notice:string};access:{canControl:boolean;canReadTranscripts:boolean;canDeleteTranscripts:boolean};notice:string}
export interface VoiceDirectory extends Paginated<VoiceSession>{metrics:{sessions:number;active:number;booked:number;handoffs:number};settings:VoiceSettings}
export type VoiceSlots=PublicCalendarInvitation;
export type VoiceBooking=PublicCalendarConfirmation;
