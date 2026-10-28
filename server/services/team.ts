import { createHmac, randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { z } from 'zod';
import type { AuthUser } from '../../shared/contracts.js';
import type { inviteStaffSchema, recoveryStaffSchema, acceptStaffSchema, TeamWorkspace } from '../../shared/pilot-contracts.js';
import type { ServerConfig } from '../config/env.js';
import type { Database } from '../db/pool.js';
import { ApiError } from '../http/errors.js';
import { staffOrganizationAccess } from './application-access.js';
import { hashPassword, verifyPassword } from './passwords.js';
import { isIsolatedDemo } from './demo-environment.js';
const unavailable=()=>new ApiError(410,'ACCESS_LINK_UNAVAILABLE','This access link is expired or unavailable. Ask your organization administrator for a new link.');
export class TeamService {
 constructor(private database:Database,private config:ServerConfig){}
 private async lockOrganization(c:PoolClient,organizationId:string){await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['ootla.team:'+organizationId]);}
 private digest(token:string){return createHmac('sha256',this.config.sessionSecret).update('ootla-staff-access:'+token).digest('hex');}
 private async admin(c:PoolClient,user:AuthUser,digest:string,password?:string){
  const actor=await staffOrganizationAccess(c,this.config,user,digest,{permission:'memberships.manage'});
  if(actor.organization.role!=='organization_admin')throw new ApiError(403,'ADMIN_REQUIRED','An organization administrator is required.');
  if(password!==undefined){const row=(await c.query('SELECT password_hash FROM users WHERE id=$1',[actor.id])).rows[0];if(!await verifyPassword(row.password_hash,password))throw new ApiError(403,'PASSWORD_REQUIRED','Confirm your current password.');}
  return actor;
 }
 private async audit(c:PoolClient,org:string,actor:string,action:string,metadata:Record<string,unknown>){await c.query('INSERT INTO audit_events(organization_id,actor_user_id,action,metadata) VALUES($1,$2,$3,$4)',[org,actor,action,JSON.stringify(metadata)]);}
 async workspace(user:AuthUser,digest:string,page:number,propertyPage:number,q:string):Promise<TeamWorkspace>{return this.database.transaction(async c=>{
  const actor=await this.admin(c,user,digest),org=actor.organization.id;
  const members=(await c.query(`SELECT m.id,m.user_id,u.display_name,u.email,m.role,m.active,ARRAY(SELECT pa.property_id FROM property_access_assignments pa WHERE pa.membership_id=m.id AND pa.organization_id=m.organization_id) AS properties FROM organization_memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 ORDER BY lower(u.display_name),m.id LIMIT 25 OFFSET $2`,[org,(page-1)*25])).rows;
  const propertyFilter="organization_id=$1 AND strpos(lower(name),lower($2))>0";
  return {members:members.map(r=>({id:r.id,userId:r.user_id,name:r.display_name,email:r.email,role:r.role,active:r.active,properties:r.properties})),properties:(await c.query('SELECT id,name FROM properties WHERE '+propertyFilter+' ORDER BY lower(name),id LIMIT 100 OFFSET $3',[org,q,(propertyPage-1)*100])).rows as TeamWorkspace['properties'],
   links:(await c.query('SELECT id,email,kind,expires_at,consumed_at,revoked_at FROM staff_access_links WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 50',[org])).rows.map(r=>({id:r.id,email:r.email,kind:r.kind,expiresAt:r.expires_at.toISOString(),consumedAt:r.consumed_at?.toISOString()??null,revokedAt:r.revoked_at?.toISOString()??null})),
   totalMembers:Number((await c.query('SELECT count(*) AS n FROM organization_memberships WHERE organization_id=$1',[org])).rows[0].n),page,pageSize:25,
   totalProperties:Number((await c.query('SELECT count(*) AS n FROM properties WHERE '+propertyFilter,[org,q])).rows[0].n),propertyPage};
 });}
 async invite(user:AuthUser,digest:string,input:z.infer<typeof inviteStaffSchema>){return this.database.transaction(async c=>{
  await this.lockOrganization(c,user.organization.id);
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['ootla.invite:'+input.email]);
  const actor=await this.admin(c,user,digest,input.currentPassword);
  if((await c.query('SELECT 1 FROM users WHERE email=$1',[input.email])).rowCount)throw new ApiError(409,'ACCOUNT_EXISTS','This email already has an account. Manage its existing membership or use another email.');
  const propertyIds=[...new Set(input.propertyIds)];
  if((await c.query('SELECT id FROM properties WHERE organization_id=$1 AND id=ANY($2::uuid[]) FOR SHARE',[actor.organization.id,propertyIds])).rowCount!==propertyIds.length)throw new ApiError(400,'INVALID_PROPERTIES','Choose properties in this organization.');
  await c.query('UPDATE staff_access_links SET revoked_at=now() WHERE organization_id=$1 AND email=$2 AND consumed_at IS NULL AND revoked_at IS NULL',[actor.organization.id,input.email]);
  const token=randomBytes(32).toString('hex');
  const row=(await c.query("INSERT INTO staff_access_links(organization_id,kind,token_digest,email,display_name,role,property_ids,created_by,expires_at) VALUES($1,'invitation',$2,$3,$4,$5,$6,$7,now()+interval '24 hours') RETURNING id,expires_at",[actor.organization.id,this.digest(token),input.email,input.name,input.role,propertyIds,actor.id])).rows[0];
  await this.audit(c,actor.organization.id,actor.id,'staff.invitation_issued',{linkId:row.id,role:input.role,propertyCount:propertyIds.length});
  return{id:row.id,url:this.config.appUrl+'/staff/access#token='+token,expiresAt:row.expires_at.toISOString()};
 });}
 async recovery(user:AuthUser,digest:string,input:z.infer<typeof recoveryStaffSchema>){return this.database.transaction(async c=>{
  await this.lockOrganization(c,user.organization.id);
  const actor=await this.admin(c,user,digest,input.currentPassword);
  const row=(await c.query("SELECT u.*,m.role FROM users u JOIN organization_memberships m ON m.user_id=u.id AND m.organization_id=$1 AND m.active WHERE u.id=$2 AND u.active AND u.account_kind='staff' FOR UPDATE OF u",[actor.organization.id,input.userId])).rows[0];
  if(!row||row.is_demo||row.email===this.config.demoAdminEmail||row.email.endsWith('@demo.ootla.test')||Number((await c.query('SELECT count(*) AS n FROM organization_memberships WHERE user_id=$1',[input.userId])).rows[0].n)!==1)throw new ApiError(409,'RECOVERY_UNAVAILABLE','Recovery links require an individual staff account belonging only to this organization. Shared demo accounts retain their password.');
  await c.query('UPDATE staff_access_links SET revoked_at=now() WHERE target_user_id=$1 AND consumed_at IS NULL AND revoked_at IS NULL',[row.id]);
  const token=randomBytes(32).toString('hex');
  const link=(await c.query("INSERT INTO staff_access_links(organization_id,kind,token_digest,email,display_name,role,target_user_id,created_by,expires_at) VALUES($1,'recovery',$2,$3,$4,$5,$6,$7,now()+interval '30 minutes') RETURNING id,expires_at",[actor.organization.id,this.digest(token),row.email,row.display_name,row.role,row.id,actor.id])).rows[0];
  await this.audit(c,actor.organization.id,actor.id,'staff.recovery_issued',{linkId:link.id,targetUserId:row.id});return{id:link.id,url:this.config.appUrl+'/staff/access#token='+token,expiresAt:link.expires_at.toISOString()};
 });}
 async revoke(user:AuthUser,digest:string,id:string){return this.database.transaction(async c=>{await this.lockOrganization(c,user.organization.id);const actor=await this.admin(c,user,digest);const result=await c.query('UPDATE staff_access_links SET revoked_at=COALESCE(revoked_at,now()) WHERE organization_id=$1 AND id=$2 RETURNING id',[actor.organization.id,id]);if(!result.rowCount)throw unavailable();await this.audit(c,actor.organization.id,actor.id,'staff.access_revoked',{linkId:id});return{revoked:true};});}
 async accept(input:z.infer<typeof acceptStaffSchema>){
  const passwordHash=await hashPassword(input.password);
  return this.database.transaction(async c=>{
   // Use the same organization -> email -> link lock order as issuance. The
   // unlocked lookup only supplies lock keys; validity is checked again below.
   const candidate=(await c.query('SELECT organization_id,email FROM staff_access_links WHERE token_digest=$1',[this.digest(input.token)])).rows[0];if(!candidate)throw unavailable();
   await this.lockOrganization(c,candidate.organization_id);
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['ootla.invite:'+candidate.email]);
   const row=(await c.query('SELECT * FROM staff_access_links WHERE token_digest=$1 AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR UPDATE',[this.digest(input.token)])).rows[0];if(!row)throw unavailable();
   const issuer=(await c.query("SELECT m.id FROM organization_memberships m JOIN users u ON u.id=m.user_id AND u.active WHERE m.organization_id=$1 AND m.user_id=$2 AND m.active AND m.role='organization_admin' FOR SHARE OF m,u",[row.organization_id,row.created_by])).rows[0];if(!issuer)throw unavailable();
   const org=(await c.query('SELECT environment FROM organizations WHERE id=$1 FOR SHARE',[row.organization_id])).rows[0];const isolated=await isIsolatedDemo(this.config,c);
   if(this.config.demoMode&&!isolated||org.environment==='demo'&&!isolated||org.environment==='live'&&this.config.demoMode)throw unavailable();
   let userId:string;
   if(row.kind==='invitation'){
    if((await c.query('SELECT 1 FROM users WHERE email=$1',[row.email])).rowCount)throw unavailable();
    if((await c.query('SELECT id FROM properties WHERE organization_id=$1 AND id=ANY($2::uuid[]) FOR SHARE',[row.organization_id,row.property_ids])).rowCount!==row.property_ids.length)throw unavailable();
    userId=(await c.query("INSERT INTO users(email,display_name,password_hash,account_kind) VALUES($1,$2,$3,'staff') RETURNING id",[row.email,row.display_name,passwordHash])).rows[0].id;
    const membership=(await c.query('INSERT INTO organization_memberships(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id',[row.organization_id,userId,row.role])).rows[0];
    for(const propertyId of row.property_ids)await c.query('INSERT INTO property_access_assignments(organization_id,membership_id,property_id) VALUES($1,$2,$3)',[row.organization_id,membership.id,propertyId]);
   }else{
    const target=(await c.query("SELECT u.id FROM users u JOIN organization_memberships m ON m.user_id=u.id AND m.organization_id=$1 AND m.active WHERE u.id=$2 AND u.active AND NOT u.is_demo AND u.account_kind='staff' AND u.email=$3 AND (SELECT count(*) FROM organization_memberships WHERE user_id=u.id)=1 FOR UPDATE OF u",[row.organization_id,row.target_user_id,row.email])).rows[0];if(!target)throw unavailable();userId=target.id;
    await c.query('UPDATE users SET password_hash=$2,updated_at=now() WHERE id=$1',[userId,passwordHash]);
    await c.query('DELETE FROM sessions WHERE user_id=$1',[userId]);
   }
   await c.query('UPDATE staff_access_links SET consumed_at=clock_timestamp() WHERE id=$1',[row.id]);
   await this.audit(c,row.organization_id,userId,'staff.access_accepted',{linkId:row.id,kind:row.kind});return{accepted:true};
  });
 }
}
