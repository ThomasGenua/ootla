import type {PoolClient} from 'pg';
import type {Database} from '../db/pool.js';
import type {ServerConfig} from '../config/env.js';
import {ApiError} from '../http/errors.js';
import {hashPassword} from './passwords.js';
import {staffInvitationResolveSchema,staffInvitationAcceptSchema,type StaffInvitationResolution,type StaffInvitationAcceptance,type StaffInvitationAccept} from '../../shared/organization-provisioning-contracts.js';
import {type InvitationRow,invitationDigest,provisioningRuntime,invitationState,invitationTargetPending,invitationById,unusableInvitation,provisioningAudit} from './organization-provisioning-access.js';
import {lockProvisioningOrganization} from './organization-invitation-management.js';
async function pendingInvitation(c:PoolClient,token:string,lock=false):Promise<InvitationRow>{
 const found=(await c.query('SELECT id,organization_id FROM staff_admin_invitations WHERE token_digest=$1',[invitationDigest(token)])).rows[0];if(!found)unusableInvitation();
 if(lock)await lockProvisioningOrganization(c,found.organization_id);
 const row=await invitationById(c,found.id,lock);if(!row||row.token_digest!==invitationDigest(token)||invitationState(row)!=='pending'||!invitationTargetPending(row))unusableInvitation();return row;
}
export async function resolveStaffInvitation(database:Database,config:ServerConfig,rawToken:string):Promise<StaffInvitationResolution>{
 const{token}=staffInvitationResolveSchema.parse({token:rawToken});await provisioningRuntime(database,config);return database.transaction(async c=>{const row=await pendingInvitation(c,token);return{organization:{name:row.organization_name},administrator:{name:row.administrator_name,email:row.administrator_email},expiresAt:new Date(row.expires_at).toISOString(),state:'pending'};});
}
/** A valid unexpired operator invitation activates only its newly created inactive target. No session is issued. */
export async function acceptStaffInvitation(database:Database,config:ServerConfig,rawInput:StaffInvitationAccept):Promise<StaffInvitationAcceptance>{
 const input=staffInvitationAcceptSchema.parse(rawInput);await provisioningRuntime(database,config);
 if(input.password===config.demoAdminPassword||input.password==='OotlaDemo!2026')throw new ApiError(400,'PERSONAL_PASSWORD_REQUIRED','Choose your own password rather than the shared preview password.');
 await database.transaction(c=>pendingInvitation(c,input.token));const passwordHash=await hashPassword(input.password);
 return database.transaction(async c=>{const row=await pendingInvitation(c,input.token,true);
  const user=await c.query("UPDATE users SET password_hash=$2,active=true,updated_at=clock_timestamp() WHERE id=$1 AND active=false AND account_kind='staff' AND is_demo=false RETURNING id",[row.user_id,passwordHash]);
  const member=await c.query("UPDATE organization_memberships SET active=true,updated_at=clock_timestamp() WHERE id=$1 AND user_id=$2 AND organization_id=$3 AND active=false AND role='organization_admin' RETURNING id",[row.membership_id,row.user_id,row.organization_id]);
  if(user.rowCount!==1||member.rowCount!==1)unusableInvitation();
  await c.query('UPDATE staff_admin_invitations SET accepted_at=clock_timestamp() WHERE id=$1',[row.id]);await provisioningAudit(c,row.organization_id,'organization.admin_invitation_accepted',row.request_key,row.id,row.user_id);return{accepted:true,signInUrl:'/admin/login'};
 });
}
