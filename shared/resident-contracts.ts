import {z} from 'zod';
import type {Paginated} from './property-contracts.js';
export const maintenanceStatuses=['submitted','awaiting_assignment','assigned','appointment_scheduled','in_progress','resolved','closed'] as const;
export type MaintenanceStatus=typeof maintenanceStatuses[number];
const text=(max:number)=>z.string().trim().max(max).refine(v=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v));
const id=z.uuid(),key=z.uuid();
export const residentLoginSchema=z.object({email:z.email().toLowerCase().max(254),password:z.string().min(1).max(1024)}).strict();
export const residentInvitationAcceptSchema=z.object({token:z.string().regex(/^[a-f0-9]{64}$/),password:z.string().min(12).max(1024),name:text(200).min(1)}).strict();
export const residentRequestSchema=z.object({requestKey:key,relationshipId:id,category:z.enum(['plumbing','electrical','appliance','heating_cooling','building','other']),location:text(160).min(2),description:text(4000).min(8),urgency:z.enum(['routine','urgent','possible_emergency']),contactPreferences:text(500).min(1),accessPreferences:text(1000).min(1),acknowledgeEmergencyInstructions:z.boolean()}).strict();
export const maintenanceListSchema=z.object({q:text(200).default(''),propertyId:id.optional(),status:z.enum([...maintenanceStatuses,'all','unresolved']).default('all'),ownerMembershipId:id.optional(),unassigned:z.enum(['true','false']).optional(),page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(1).max(50).default(25)}).strict();
export const residentPageSchema=z.object({page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(1).max(50).default(25)}).strict();
export const maintenanceMessageSchema=z.object({requestKey:key,body:text(4000).min(1),visibility:z.enum(['resident','internal']).default('resident')}).strict();
export const maintenanceAssignmentSchema=z.object({requestKey:key,version:z.number().int().positive(),ownerMembershipId:id.nullable(),dueAt:z.iso.datetime({offset:true}).nullable()}).strict();
export const maintenanceStatusSchema=z.object({requestKey:key,version:z.number().int().positive(),status:z.enum(maintenanceStatuses),confirmation:text(1000).min(5),appointmentAt:z.iso.datetime({offset:true}).nullable().optional(),appointmentConfirmed:z.boolean().default(false)}).strict();
export const maintenanceOptionsSchema=z.object({q:text(200).default(''),propertyId:id.optional(),page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(1).max(50).default(25)}).strict();
export const maintenanceSettingsSchema=z.object({requestKey:key,propertyId:id,emergencyInstructions:text(2000).min(10),emergencyStaffMembershipId:id.nullable(),defaultDueHours:z.number().int().min(1).max(720),enabled:z.boolean()}).strict();
export const maintenanceFileSchema=z.object({requestKey:key,name:text(180).min(1)}).strict();
export const residentInvitationSchema=z.object({requestKey:key,relationshipId:id,email:z.email().toLowerCase().max(254),expiresHours:z.number().int().min(1).max(168).default(48)}).strict();
export const residentRenewalSchema=z.object({requestKey:key,relationshipId:id,terms:text(3000).min(10),source:z.enum(['staff_approved','provider_verified']),evidence:text(500).min(5),validUntil:z.iso.datetime({offset:true}).nullable()}).strict();
export interface ResidentUser{id:string;name:string;email:string;organization:{id:string;name:string};sessionExpiresAt:string}
export interface ResidentConfig{demoEnabled:boolean;demoCredentials?:{email:string;password:string};notice:string}
export interface ResidentLease{relationshipId:string;leaseId:string;property:{id:string;name:string;timeZone:string};unit:{id:string;label:string}|null;contactName:string;status:string;startsOn:string|null;endsOn:string|null;source:string;emergencyInstructions:string|null}
export interface ResidentRenewal{terms:string;source:'staff_approved'|'provider_verified';evidence:string;approvedAt:string;validUntil:string|null}
export interface ResidentLeaseDetail{lease:ResidentLease;renewal:ResidentRenewal|null;payment:{configured:boolean;name:string|null;mode:'external'|'not_configured';notice:string};notice:string}
export interface MaintenanceFile{id:string;name:string;mediaType:string;sizeBytes:number;createdAt:string;downloadUrl:string}
export interface MaintenanceRequest{id:string;relationshipId:string;property:{id:string;name:string;address?:string;city?:string;timeZone:string};unit:{id:string;label:string}|null;contactName:string;category:string;location:string;description:string;urgency:string;contactPreferences:string;accessPreferences:string;status:MaintenanceStatus;owner:{membershipId:string;name:string}|null;dueAt:string|null;appointmentAt:string|null;appointmentConfirmation:string|null;sourceState:'local'|'awaiting_configuration';sourceNotice:string;version:number;createdAt:string;updatedAt:string;relatedUrl:string}
export interface MaintenanceMessage{id:string;body:string;visibility:'resident'|'internal';actorKind:'resident'|'staff'|'system';actorName:string;createdAt:string}
export interface MaintenanceEvent{id:string;kind:string;summary:string;createdAt:string}
export interface MaintenanceDetailCounts{messages:number;files:number;events:number;assignedStaff:number}
export interface MaintenanceDetail{counts?:MaintenanceDetailCounts;request:MaintenanceRequest;messages:Paginated<MaintenanceMessage>;events:MaintenanceEvent[];files:MaintenanceFile[];access:{canManage:boolean;canMessage:boolean;canUpload:boolean};emergencyInstructions:string|null;notice:string}
export interface MaintenanceDirectory extends Paginated<MaintenanceRequest>{counts:{unassigned:number;overdue:number;open:number};canManage:boolean}
export interface MaintenanceOptions{properties:Paginated<{id:string;name:string}>;owners:Paginated<{membershipId:string;name:string}>;relationships:Paginated<{id:string;label:string;propertyId:string}>;settings:{propertyId:string;enabled:boolean;emergencyInstructions:string;emergencyStaffMembershipId:string|null;defaultDueHours:number}|null;canManage:boolean}
