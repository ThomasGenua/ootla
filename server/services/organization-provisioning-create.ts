import {randomBytes,randomUUID} from 'node:crypto';
import type {Database} from '../db/pool.js';
import type {ServerConfig} from '../config/env.js';
import {ApiError} from '../http/errors.js';
import {hashPassword} from './passwords.js';
import {organizationProvisioningSchema,type OrganizationProvisioningManifest,type OrganizationProvisioningResult} from '../../shared/organization-provisioning-contracts.js';
import {payloadDigest,provisioningRuntime,invitationResult,provisioningReceipt,saveProvisioningReceipt,createStaffInvitation,provisioningAudit} from './organization-provisioning-access.js';
/** Trusted operator only: creates inactive identities, never an authenticated account/session. */
export async function provisionPendingOrganization(database:Database,config:ServerConfig,manifest:OrganizationProvisioningManifest):Promise<OrganizationProvisioningResult>{
 const input=organizationProvisioningSchema.parse(manifest);
 if(input.administrator.email.endsWith('@demo.ootla.test')||['ootla-demo','ootla-standalone-demo','ootla-applicant-demo','ootla-resident-demo'].includes(input.organization.slug))throw new ApiError(409,'PREVIEW_IDENTITY_RESERVED','Preview identities and organization names cannot be used for customer onboarding.');
 await provisioningRuntime(database,config);const payload=payloadDigest(input),unknownPasswordHash=await hashPassword(randomBytes(48).toString('base64url'));
 return database.transaction(async c=>{
  const prior=await provisioningReceipt(c,input.requestKey,'provision',payload);if(prior)return invitationResult(c,config,prior.invitation_id,true);
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['ootla.first-admin.email:'+input.administrator.email]);
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['ootla.first-admin.slug:'+input.organization.slug]);
  if((await c.query('SELECT id FROM users WHERE email=$1',[input.administrator.email])).rowCount)throw new ApiError(409,'ADMINISTRATOR_IDENTITY_EXISTS','That email already belongs to an existing identity. No account was linked or password reset.');
  if((await c.query('SELECT id FROM organizations WHERE slug=$1',[input.organization.slug])).rowCount)throw new ApiError(409,'ORGANIZATION_SLUG_EXISTS','That organization identifier is already in use. No existing organization was changed.');
  const organizationId=randomUUID(),userId=randomUUID();
  try{
   await c.query("INSERT INTO organizations(id,name,slug,environment) VALUES($1,$2,$3,'live')",[organizationId,input.organization.name,input.organization.slug]);
   await c.query('INSERT INTO organization_data_settings(organization_id,mode) VALUES($1,$2)',[organizationId,input.organization.mode]);
   await c.query("INSERT INTO users(id,email,display_name,password_hash,active,account_kind,is_demo) VALUES($1,$2,$3,$4,false,'staff',false)",[userId,input.administrator.email,input.administrator.name,unknownPasswordHash]);
   const membershipId=(await c.query("INSERT INTO organization_memberships(organization_id,user_id,role,active) VALUES($1,$2,'organization_admin',false) RETURNING id",[organizationId,userId])).rows[0]!.id as string;
   await c.query('INSERT INTO organization_admin_settings(organization_id,time_zone,updated_by_user_id) VALUES($1,$2,$3)',[organizationId,input.organization.timeZone,userId]);
   await c.query("INSERT INTO organization_assistant_policies(organization_id,allow_task_creation,enabled,public_enabled,permitted_tools,updated_by_user_id) VALUES($1,false,false,false,ARRAY['native_read']::text[],$2)",[organizationId,userId]);
   const invitation=await createStaffInvitation(c,config,{id:randomUUID(),key:input.requestKey,organizationId,userId,membershipId,hours:input.expiresInHours});
   await saveProvisioningReceipt(c,input.requestKey,'provision',payload,invitation);await provisioningAudit(c,organizationId,'organization.provisioned',input.requestKey,invitation.id);return invitationResult(c,config,invitation.id,false);
  }catch(issue){if(typeof issue==='object'&&issue!==null&&'code'in issue&&issue.code==='23505')throw new ApiError(409,'PROVISIONING_COLLISION','An identity or organization already exists. No existing account was linked or password reset.');throw issue;}
 });
}
