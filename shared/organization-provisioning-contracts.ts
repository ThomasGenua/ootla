import {z} from 'zod';
const text=(max:number)=>z.string().trim().min(1).max(max).refine(v=>!/[\u0000-\u001f\u007f]/.test(v));
const hours=z.number().int().min(1).max(72).default(48);
export const organizationProvisioningSchema=z.object({requestKey:z.uuid(),organization:z.object({name:text(200),slug:z.string().trim().min(1).max(100).regex(/^[a-z0-9][a-z0-9-]*$/),mode:z.enum(['standalone','yardi_connected']),timeZone:text(100).refine(v=>{try{new Intl.DateTimeFormat('en',{timeZone:v}).format();return true;}catch{return false;}})}).strict(),administrator:z.object({name:text(200),email:z.email().max(254).transform(v=>v.trim().toLowerCase())}).strict(),expiresInHours:hours}).strict();
export const organizationInvitationReissueSchema=z.object({requestKey:z.uuid(),organizationId:z.uuid(),expiresInHours:hours}).strict();
export const organizationInvitationRevokeSchema=z.object({requestKey:z.uuid(),organizationId:z.uuid()}).strict();
export const staffInvitationResolveSchema=z.object({token:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const staffInvitationAcceptSchema=staffInvitationResolveSchema.extend({password:z.string().min(12).max(128).refine(v=>!/[\u0000-\u001f\u007f]/.test(v))}).strict();
export type OrganizationProvisioningManifest=z.infer<typeof organizationProvisioningSchema>;
export type OrganizationInvitationReissue=z.infer<typeof organizationInvitationReissueSchema>;
export type OrganizationInvitationRevoke=z.infer<typeof organizationInvitationRevokeSchema>;
export type StaffInvitationAccept=z.infer<typeof staffInvitationAcceptSchema>;
export type StaffInvitationState='pending'|'accepted'|'expired'|'revoked';
export interface OrganizationProvisioningResult{organization:{id:string;name:string;slug:string};administrator:{userId:string;membershipId:string;name:string;email:string};invitation:{id:string;url:string|null;expiresAt:string;state:StaffInvitationState};replayed:boolean}
export interface StaffInvitationResolution{organization:{name:string};administrator:{name:string;email:string};expiresAt:string;state:'pending'}
export interface StaffInvitationAcceptance{accepted:true;signInUrl:'/admin/login'}
export interface OrganizationInvitationRevocation{revoked:true;organizationId:string;invitationId:string;replayed:boolean}
