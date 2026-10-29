import {z} from 'zod';
import type {Paginated} from './property-contracts.js';
import {residentRenewalSchema,residentInvitationSchema} from './resident-contracts.js';
const text=(max:number)=>z.string().trim().max(max).refine(v=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v));
const page={page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(1).max(50).default(25)};
export const renewalDirectorySchema=z.object({...page,q:text(200).default(''),propertyId:z.uuid().optional(),status:z.enum(['all','current','expired','not_published','inactive']).default('all'),dueWindow:z.enum(['all','past_due','30','60','90']).default('all'),sort:z.enum(['lease_end','resident','recent']).default('lease_end')}).strict();
export const renewalDetailSchema=z.object({offerPage:page.page,taskPage:page.page,pageSize:page.pageSize}).strict();
export const renewalTermsSchema=residentRenewalSchema.omit({relationshipId:true,source:true}).strict();
export const residentAdministrationDirectorySchema=z.object({...page,q:text(200).default(''),propertyId:z.uuid().optional(),status:z.enum(['all','active','not_invited','pending','inactive']).default('all')}).strict();
export const residentAdministrationDetailSchema=z.object({grantPage:page.page,invitationPage:page.page,pageSize:page.pageSize}).strict();
export const residentAdministrationInvitationSchema=residentInvitationSchema.omit({relationshipId:true}).strict();
export const residentAdministrationGrantSchema=z.object({active:z.boolean()}).strict();
export const renewalOptionsSchema=z.object({...page,q:text(200).default(''),propertyId:z.uuid().optional()}).strict();
export interface RenewalProperty{id:string;name:string;address:string;city:string;timeZone:string}
export interface RenewalResident{id:string;name:string;email:string|null;phone:string|null}
export interface RenewalLease{id:string;status:'draft'|'active'|'ended';startsOn:string|null;endsOn:string|null;source:string;readOnlyFields:string[]}
export interface RenewalAccess{canPublish:boolean;canInvite:boolean;canManageGrant:boolean;reason:string|null}
export interface RenewalOffer{id:string;terms:string;source:'staff_approved'|'provider_verified';evidence:string;approvedBy:{id:string;name:string};approvedAt:string;validUntil:string|null;active:boolean;state:'current'|'expired'|'superseded';preview:boolean}
export interface RenewalTask{id:string;title:string;status:'open'|'completed'|'cancelled';dueAt:string;completedAt:string|null;owner:{membershipId:string;name:string}|null;url:string}
export interface RenewalRecord{relationshipId:string;resident:RenewalResident;property:RenewalProperty;unit:{id:string;label:string}|null;lease:RenewalLease;applicationId:string;leadId:string|null;termsStatus:'current'|'expired'|'not_published'|'inactive';currentOffer:RenewalOffer|null;latestOffer:RenewalOffer|null;nextTask:RenewalTask|null;preview:boolean;access:RenewalAccess}
export interface RenewalDirectory extends Paginated<RenewalRecord>{counts:{current:number;expired:number;notPublished:number;inactive:number};notice:string}
export interface RenewalDetail{record:RenewalRecord;offers:Paginated<RenewalOffer>;tasks:Paginated<RenewalTask>;applicationUrl:string;notice:string}
export interface ResidentAdministrationRecord{relationshipId:string;resident:RenewalResident;property:RenewalProperty;unit:{id:string;label:string}|null;lease:RenewalLease;activeGrants:number;pendingInvitations:number;preview:boolean;access:RenewalAccess}
export interface ResidentAdministrationDirectory extends Paginated<ResidentAdministrationRecord>{counts:{activeGrants:number;pendingInvitations:number;notInvited:number;inactive:number};notice:string}
export interface ResidentAdministrationGrant{id:string;user:{id:string;name:string;email:string};active:boolean;createdAt:string;revokedAt:string|null}
export interface ResidentAdministrationInvitation{id:string;email:string;createdAt:string;expiresAt:string;usedAt:string|null;revokedAt:string|null;status:'pending'|'expired'|'accepted'|'revoked'}
export interface ResidentAdministrationDetail{record:ResidentAdministrationRecord;grants:Paginated<ResidentAdministrationGrant>;invitations:Paginated<ResidentAdministrationInvitation>;notice:string}
export interface RenewalOptions{properties:Paginated<{id:string;name:string}>}
