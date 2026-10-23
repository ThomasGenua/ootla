import { z } from 'zod';
export const screeningConsentVersion = 'demo-screening-v1' as const;
export const screeningConsentText = 'I consent to the isolated Ootla demonstration screening for this application. It uses synthetic records, sends no live screening request and makes no eligibility decision. A live provider requires separately approved purpose, wording, notice and retention policies.';
export const screeningStatuses = ['consent_required','ready_to_submit','submitted','provider_reviewing','report_received','failed','staff_review_pending'] as const;
export type ScreeningStatus = typeof screeningStatuses[number];
export const applicationDecisions = ['approved','declined','request_information','withdrawn'] as const;
export type ApplicationDecision = typeof applicationDecisions[number];
export const screeningRequestSchema = z.object({participantId:z.uuid(),requestKey:z.uuid()}).strict();
export const screeningActionSchema = z.object({requestKey:z.uuid()}).strict();
export const screeningProcessSchema = screeningActionSchema.extend({simulateFailure:z.boolean().default(false)}).strict();
export const screeningConsentSchema = z.object({version:z.literal(screeningConsentVersion),accepted:z.literal(true)}).strict();
export const applicationDecisionSchema = z.object({requestKey:z.uuid(),decision:z.enum(applicationDecisions),reason:z.string().trim().min(5).max(2000).refine(v=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v))}).strict();
export const screeningDemoCallbackSchema = z.object({eventId:z.uuid(),organizationId:z.uuid(),screeningId:z.uuid(),providerRequestId:z.uuid(),status:z.enum(['provider_reviewing','report_received'])}).strict();
export interface ScreeningConsent {purpose:'screening';version:typeof screeningConsentVersion;text:string;acceptedAt:string|null;configured:boolean}
export interface ScreeningRecord {id:string;participantId:string;status:ScreeningStatus;attempts:number;maxAttempts:3;nextAttemptAt:string|null;error:string|null;createdAt:string;updatedAt:string;reportAvailable:boolean;reportUrl:string|null;reviewedAt:string|null;providerRequestId:string}
export interface ApplicationDecisionRecord {id:string;decision:ApplicationDecision;reason:string;actorName:string;createdAt:string}
export interface ScreeningWorkspace {
 applicationId:string;mode:'demo'|'not_configured';status:ScreeningStatus;notice:string;
 participants:{id:string;name:string;role:'primary'|'co_applicant';consentAcceptedAt:string|null;screeningId:string|null;status:ScreeningStatus}[];
 screenings:ScreeningRecord[];decisions:ApplicationDecisionRecord[];
 access:{canRequest:boolean;canProcess:boolean;canReview:boolean;canDecide:boolean;canReadReports:boolean};
 policy:{noticesConfigured:false;retentionConfigured:false;message:string};
}
