import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {Database} from '../db/pool.js';
import type {ServerConfig} from '../config/env.js';
import {ApiError} from '../http/errors.js';
import {organizationInvitationReissueSchema,organizationInvitationRevokeSchema,type OrganizationInvitationReissue,type OrganizationInvitationRevoke,type OrganizationInvitationRevocation,type OrganizationProvisioningResult} from '../../shared/organization-provisioning-contracts.js';
import {payloadDigest,provisioningRuntime,invitationTargetPending,invitationById,invitationResult,unusableInvitation,provisioningReceipt,saveProvisioningReceipt,createStaffInvitation,provisioningAudit} from './organization-provisioning-access.js';
export async function lockProvisioningOrganization(c:PoolClient,id:string):Promise<void>{await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['ootla.first-admin.organization:'+id]);}
/** Operator-only invitation lifecycle. Never changes a user, password, role or membership. */
export async function reissueFirstAdministrator(database:Database,config:ServerConfig,manifest:OrganizationInvitationReissue):Promise<OrganizationProvisioningResult>{
 const input=organizationInvitationReissueSchema.parse(manifest);await provisioningRuntime(database,config);const payload=payloadDigest(input);
 return database.transaction(async c=>{
  const prior=await provisioningReceipt(c,input.requestKey,'reissue',payload);if(prior)return invitationResult(c,config,prior.invitation_id,true);
  await lockProvisioningOrganization(c,input.organizationId);
  const latest=(await c.query('SELECT id FROM staff_admin_invitations WHERE organization_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1',[input.organizationId])).rows[0];if(!latest)unusableInvitation();
  const old=await invitationById(c,latest.id,true);if(!old||!invitationTargetPending(old)||old.accepted_at)throw new ApiError(409,'ADMINISTRATOR_ALREADY_ACTIVATED','Only an unaccepted pending administrator invitation can be replaced. No active account or password was changed.');
  await c.query('UPDATE staff_admin_invitations SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE organization_id=$1 AND accepted_at IS NULL AND revoked_at IS NULL',[input.organizationId]);
  const invitation=await createStaffInvitation(c,config,{id:randomUUID(),key:input.requestKey,organizationId:old.organization_id,userId:old.user_id,membershipId:old.membership_id,hours:input.expiresInHours});
  await saveProvisioningReceipt(c,input.requestKey,'reissue',payload,invitation);await provisioningAudit(c,old.organization_id,'organization.admin_invitation_reissued',input.requestKey,invitation.id);return invitationResult(c,config,invitation.id,false);
 });
}
export async function revokeFirstAdministrator(database:Database,config:ServerConfig,manifest:OrganizationInvitationRevoke):Promise<OrganizationInvitationRevocation>{
 const input=organizationInvitationRevokeSchema.parse(manifest);await provisioningRuntime(database,config);const payload=payloadDigest(input);
 return database.transaction(async c=>{
  const prior=await provisioningReceipt(c,input.requestKey,'revoke',payload);if(prior)return{revoked:true,organizationId:prior.organization_id,invitationId:prior.invitation_id,replayed:true};
  await lockProvisioningOrganization(c,input.organizationId);const latest=(await c.query('SELECT id FROM staff_admin_invitations WHERE organization_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1',[input.organizationId])).rows[0];if(!latest)unusableInvitation();
  const invitation=await invitationById(c,latest.id,true);if(!invitation||!invitationTargetPending(invitation)||invitation.accepted_at)throw new ApiError(409,'ADMINISTRATOR_ALREADY_ACTIVATED','An activated administrator account cannot be revoked using invitation controls. Use authorized membership management.');
  await c.query('UPDATE staff_admin_invitations SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE id=$1',[invitation.id]);await saveProvisioningReceipt(c,input.requestKey,'revoke',payload,invitation);await provisioningAudit(c,invitation.organization_id,'organization.admin_invitation_revoked',input.requestKey,invitation.id);return{revoked:true,organizationId:invitation.organization_id,invitationId:invitation.id,replayed:false};
 });
}
