import {z} from 'zod';
export const paymentKnownStatuses=['unknown','pending','confirmed','unavailable'] as const;
export type PaymentKnownStatus=typeof paymentKnownStatuses[number];
export type PaymentDisplayStatus=PaymentKnownStatus|'verification_needed';
export const paymentActionSchema=z.object({requestKey:z.uuid()}).strict();
export const paymentDestinationSchema=z.object({requestKey:z.uuid(),name:z.string().trim().min(1).max(100).refine(v=>!/[\u0000-\u001f\u007f]/.test(v)),url:z.string().trim().min(1).max(1000),enabled:z.boolean()}).strict();
export const paymentDemoOpenSchema=z.object({token:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const paymentDemoConfirmSchema=paymentDemoOpenSchema.extend({requestKey:z.uuid()}).strict();
export interface PaymentWorkspace{
 applicationId:string;mode:'demo'|'not_configured'|'external';status:PaymentDisplayStatus;lastKnownStatus:PaymentKnownStatus;
 source:string;verifiedAt:string|null;stale:boolean;notice:string;destination:{name:string;configured:boolean}|null;
 access:{canOpen:boolean;canVerify:boolean;canConfigure:boolean};
}
export interface PaymentHandoff{url:string;mode:'demo'|'external';expiresAt:string|null}
export interface DemoPaymentHandoff{mode:'demo';applicationId:string;status:'pending'|'confirmed';notice:string;returnUrl:string;expiresAt:string}
export interface PaymentDestination{id:string;name:string;url:string;enabled:boolean;updatedAt:string}
export interface PaymentDestinations{items:PaymentDestination[];liveVerificationConfigured:false;notice:string}
