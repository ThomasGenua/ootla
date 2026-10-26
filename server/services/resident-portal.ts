import {sessionCookieName,readSessionCookie} from '../http/session-cookies.js';
import {createHmac,randomBytes} from 'node:crypto';
import type {Request,Response} from 'express';
import type {PoolClient,QueryResultRow,QueryResult} from 'pg';
import type {z} from 'zod';
import type {ResidentConfig,ResidentUser,ResidentLease,ResidentLeaseDetail,residentInvitationAcceptSchema} from '../../shared/resident-contracts.js';
import type {Database} from '../db/pool.js';
import type {ServerConfig} from '../config/env.js';
import {ApiError} from '../http/errors.js';
import {hashPassword,verifyPassword} from './passwords.js';
import {isIsolatedDemo} from './demo-environment.js';
import {residentRelationshipAccess,residentCanonicalJoin,residentCanonicalContact,type ResidentPrincipal} from './resident-access.js';
import {validateApprovedPaymentDestination} from './payments.js';
export type {ResidentPrincipal} from './resident-access.js';
type Row=QueryResultRow;interface ResidentConnection{query<T extends QueryResultRow=QueryResultRow>(sql:string,values?:unknown[]):Promise<QueryResult<T>>}
export const residentDemoEmail='resident@demo.ootla.test',residentDemoPassword='OotlaResident!2026',residentStaffDemoEmail='residentstaff@demo.ootla.test';
const life=8*3600000;
const iso=(v:unknown)=>v?(v instanceof Date?v:new Date(String(v))).toISOString():null;
export const residentDigest=(c:ServerConfig,t:string,purpose='session')=>createHmac('sha256',c.sessionSecret).update('ootla-resident:'+purpose+':'+t).digest('hex');
export const residentInvitationToken=(c:ServerConfig,id:string,key:string)=>createHmac('sha256',c.sessionSecret).update('ootla-resident:invite-token:'+id+':'+key).digest('hex');
export const residentLeaseDto=(r:Row):ResidentLease=>({relationshipId:r.id,leaseId:r.lease_id,property:{id:r.property_id,name:r.property_name,timeZone:r.time_zone??'UTC'},unit:r.unit_id?{id:r.unit_id,label:r.unit_label}:null,contactName:r.contact_name,status:r.lease_status,startsOn:r.starts_on?String(r.starts_on).slice(0,10):null,endsOn:r.ends_on?String(r.ends_on).slice(0,10):null,source:r.source,emergencyInstructions:r.emergency_instructions??null});
export class ResidentPortal{
 private dummy:Promise<string>;
 constructor(private db:Database,private config:ServerConfig){this.dummy=hashPassword(randomBytes(32).toString('hex'));}
 private options(){return{httpOnly:true,sameSite:'lax' as const,secure:this.config.production||this.config.secureCookies,path:'/'};}
 private async eligible(c:ResidentConnection,r:Row):Promise<boolean>{const isolated=this.config.demoMode&&await isIsolatedDemo(this.config,c);return !(this.config.demoMode&&!isolated||r.is_demo&&r.environment!=='demo')&&((r.is_demo||r.environment==='demo')?Boolean(isolated&&r.environment==='demo'):r.environment==='live');}
 private async principal(c:ResidentConnection,digest:string):Promise<ResidentPrincipal|null>{
  const r=(await c.query("SELECT u.id,u.email,u.display_name AS name,u.is_demo,o.id AS organization_id,o.name AS organization_name,o.environment,s.expires_at FROM resident_sessions s JOIN users u ON u.id=s.user_id AND u.account_kind=s.account_kind AND u.active JOIN organizations o ON o.id=s.organization_id WHERE s.token_digest=$1 AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND EXISTS(SELECT 1 FROM resident_access_grants g JOIN resident_relationships rr ON rr.id=g.relationship_id AND rr.organization_id=g.organization_id "+residentCanonicalJoin+" WHERE g.user_id=u.id AND g.organization_id=o.id AND g.active AND g.revoked_at IS NULL AND rr.status IN('active','pending_move_in') AND ls.status='active' AND "+residentCanonicalContact+")",[digest])).rows[0];
  return r&&await this.eligible(c,r)?{id:r.id,email:r.email,name:r.name,organization:{id:r.organization_id,name:r.organization_name},sessionExpiresAt:iso(r.expires_at)!,sessionDigest:digest}:null;
 }
 async currentUser(r:Request):Promise<ResidentPrincipal|null>{const t=readSessionCookie(r,this.config,'resident');return t?this.principal(this.db,residentDigest(this.config,t)):null;}
 publicUser(u:ResidentPrincipal):ResidentUser{const{sessionDigest:_,...safe}=u;return safe;}
 async configPublic():Promise<ResidentConfig>{const result:ResidentConfig={demoEnabled:false,notice:'Resident access uses an explicit person-and-lease grant. Applicant, resident and staff sessions remain separate.'};if(!await isIsolatedDemo(this.config,this.db))return result;
  const r=(await this.db.query("SELECT u.password_hash FROM users u JOIN resident_access_grants g ON g.user_id=u.id AND g.active AND g.revoked_at IS NULL JOIN organizations o ON o.id=g.organization_id AND o.slug='ootla-resident-demo' AND o.environment='demo' WHERE u.email=$1 AND u.account_kind='resident' AND u.active AND u.is_demo",[residentDemoEmail])).rows[0];
  if(r&&await verifyPassword(r.password_hash,residentDemoPassword)){result.demoEnabled=true;result.demoCredentials={email:residentDemoEmail,password:residentDemoPassword};}return result;
 }
 private async session(c:PoolClient,r:Request,user:Row,org:string):Promise<string>{const old=readSessionCookie(r,this.config,'resident');if(old)await c.query('UPDATE resident_sessions SET revoked_at=clock_timestamp() WHERE token_digest=$1',[residentDigest(this.config,old)]);const t=randomBytes(32).toString('hex');await c.query("WITH stamp AS MATERIALIZED(SELECT clock_timestamp() AS at) INSERT INTO resident_sessions(token_digest,user_id,organization_id,account_kind,created_at,expires_at) SELECT $1,$2,$3,$4,stamp.at,stamp.at+interval '8 hours' FROM stamp",[residentDigest(this.config,t),user.id,org,user.account_kind]);return t;}
 async login(r:Request,s:Response,i:{email:string;password:string}):Promise<ResidentUser>{
  const found=(await this.db.query("SELECT u.id,u.email,u.password_hash,u.account_kind,u.is_demo,o.id AS organization_id,o.environment FROM users u JOIN resident_access_grants g ON g.user_id=u.id AND g.active AND g.revoked_at IS NULL JOIN organizations o ON o.id=g.organization_id WHERE u.email=$1 AND u.active AND u.account_kind IN('applicant','resident') ORDER BY g.created_at,g.id LIMIT 1",[i.email])).rows[0];
  const valid=await verifyPassword(found?.password_hash??await this.dummy,i.password);if(!found||!valid||!await this.eligible(this.db,found))throw new ApiError(401,'INVALID_CREDENTIALS','The email or password is incorrect.');
  const t=await this.db.transaction(async c=>{const current=(await c.query('SELECT u.*,o.environment FROM users u JOIN organizations o ON o.id=$2 WHERE u.id=$1 AND u.active FOR SHARE OF u,o',[found.id,found.organization_id])).rows[0];if(!current||current.password_hash!==found.password_hash||!await this.eligible(c,current))throw new ApiError(401,'INVALID_CREDENTIALS','The email or password is incorrect.');const value=await this.session(c,r,current,found.organization_id);if(!await this.principal(c,residentDigest(this.config,value)))throw new ApiError(403,'RESIDENT_GRANT_REQUIRED','An active explicit resident lease grant is required.');await c.query("INSERT INTO audit_events(organization_id,actor_user_id,action) VALUES($1,$2,'resident.login')",[found.organization_id,current.id]);return value;});
  s.cookie(sessionCookieName(this.config,'resident'),t,{...this.options(),maxAge:life});const u=await this.principal(this.db,residentDigest(this.config,t));if(!u)throw new ApiError(401,'RESIDENT_AUTH_REQUIRED','Sign in again.');return this.publicUser(u);
 }
 async logout(r:Request,s:Response):Promise<void>{const t=readSessionCookie(r,this.config,'resident');if(t)await this.db.query('UPDATE resident_sessions SET revoked_at=clock_timestamp() WHERE token_digest=$1',[residentDigest(this.config,t)]);s.clearCookie(sessionCookieName(this.config,'resident'),this.options());}
 async leases(u:ResidentPrincipal,p:{page:number;pageSize:number}):Promise<{items:ResidentLease[];total:number;page:number;pageSize:number;totalPages:number}>{return this.db.transaction(async c=>{
  const rows=(await c.query('SELECT relationship_id FROM resident_access_grants WHERE organization_id=$1 AND user_id=$2 AND active AND revoked_at IS NULL ORDER BY created_at,id LIMIT $3 OFFSET $4',[u.organization.id,u.id,p.pageSize,(p.page-1)*p.pageSize])).rows,items:ResidentLease[]=[];
  for(const r of rows){try{items.push(residentLeaseDto(await residentRelationshipAccess(c,this.config,u,r.relationship_id)));}catch(e){if(!(e instanceof ApiError)||e.status!==404)throw e;}}
  const total=Number((await c.query('SELECT count(*) AS total FROM resident_access_grants WHERE organization_id=$1 AND user_id=$2 AND active AND revoked_at IS NULL',[u.organization.id,u.id])).rows[0].total);return{items,total,...p,totalPages:Math.ceil(total/p.pageSize)};
 });}
 async lease(u:ResidentPrincipal,id:string):Promise<ResidentLeaseDetail>{return this.db.transaction(async c=>{
  const rr=await residentRelationshipAccess(c,this.config,u,id),offer=(await c.query("SELECT * FROM resident_renewal_offers WHERE organization_id=$1 AND relationship_id=$2 AND active AND (valid_until IS NULL OR valid_until>clock_timestamp()) ORDER BY approved_at DESC,id DESC LIMIT 1",[u.organization.id,id])).rows[0];
  const demo=await isIsolatedDemo(this.config,c),destination=(await c.query('SELECT name,url FROM payment_destinations WHERE organization_id=$1 AND enabled',[u.organization.id])).rows[0];if(destination)validateApprovedPaymentDestination(destination.url);
  return{lease:residentLeaseDto(rr),renewal:offer?{terms:offer.terms,source:offer.source,evidence:offer.source==='staff_approved'?'Reviewed and approved by authorized staff.':'Verified provider terms.',approvedAt:iso(offer.approved_at)!,validUntil:iso(offer.valid_until)}:null,payment:{configured:Boolean(destination&&!demo),name:!demo?destination?.name??null:null,mode:destination&&!demo?'external':'not_configured',notice:demo?'Isolated demo: no external payment portal is opened and no funds move.':'Ootla only opens an existing approved payment provider. It does not authorize, charge, capture or refund payments.'},notice:'Only explicitly granted lease information is shown. Renewal terms appear only after source approval; Ootla does not negotiate, sign or invent concessions.'};
 });}
 async paymentHandoff(u:ResidentPrincipal,id:string,key:string):Promise<{url:string;mode:'external';expiresAt:null}>{return this.db.transaction(async c=>{
  await residentRelationshipAccess(c,this.config,u,id);if(await isIsolatedDemo(this.config,c))throw new ApiError(409,'RESIDENT_DEMO_PAYMENT_UNAVAILABLE','This resident demo does not open external payment providers or move funds.');
  const d=(await c.query('SELECT name,url FROM payment_destinations WHERE organization_id=$1 AND enabled FOR SHARE',[u.organization.id])).rows[0];if(!d)throw new ApiError(409,'PAYMENT_NOT_CONFIGURED','Ask staff to configure an approved existing payment-provider destination.');
  const url=validateApprovedPaymentDestination(d.url);await c.query("INSERT INTO audit_events(organization_id,actor_user_id,action,metadata) VALUES($1,$2,'resident.payment_handoff',$3)",[u.organization.id,u.id,JSON.stringify({relationshipId:id,requestKey:key})]);return{url,mode:'external',expiresAt:null};
 });}
 async accept(r:Request,s:Response,i:z.infer<typeof residentInvitationAcceptSchema>):Promise<ResidentUser>{
  const result=await this.db.transaction(async c=>{
   const inv=(await c.query("SELECT inv.*,o.environment FROM resident_invitations inv JOIN organizations o ON o.id=inv.organization_id WHERE token_digest=$1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR UPDATE OF inv",[residentDigest(this.config,i.token,'invitation')])).rows[0];
   if(!inv)throw new ApiError(410,'RESIDENT_INVITATION_UNAVAILABLE','This invitation expired, was used or was revoked. Ask staff for another.');
   if(!await this.eligible(c,{is_demo:inv.environment==='demo',environment:inv.environment}))throw new ApiError(403,'RESIDENT_ENVIRONMENT_DENIED','This invitation belongs to another configured environment.');
   const staff=(await c.query("SELECT m.id,m.role FROM organization_memberships m JOIN users u ON u.id=m.user_id AND u.active WHERE m.id=$1 AND m.user_id=$2 AND m.organization_id=$3 AND m.active AND m.role IN('organization_admin','property_manager') FOR SHARE OF m,u",[inv.created_by_membership_id,inv.created_by_user_id,inv.organization_id])).rows[0];if(!staff)throw new ApiError(410,'RESIDENT_INVITATION_UNAVAILABLE','The inviting staff access ended. Ask authorized staff for a new invitation.');
   const rr=(await c.query('SELECT rr.* FROM resident_relationships rr '+residentCanonicalJoin+" WHERE rr.id=$1 AND rr.organization_id=$2 AND ls.status='active' AND "+residentCanonicalContact+' FOR SHARE OF rr,ls',[inv.relationship_id,inv.organization_id])).rows[0];if(!rr)throw new ApiError(410,'RESIDENT_INVITATION_UNAVAILABLE','The resident relationship changed. Ask authorized staff for a new invitation.');
   if(staff.role!=='organization_admin'){const ids=[...new Set([rr.property_id,...(await c.query('SELECT property_id FROM lead_property_interests WHERE organization_id=$1 AND lead_id=$2 ORDER BY property_id FOR SHARE',[inv.organization_id,rr.lead_id])).rows.map(v=>v.property_id)])];if((await c.query('SELECT property_id FROM property_access_assignments WHERE organization_id=$1 AND membership_id=$2 AND property_id=ANY($3::uuid[]) FOR SHARE',[inv.organization_id,inv.created_by_membership_id,ids])).rowCount!==ids.length)throw new ApiError(410,'RESIDENT_INVITATION_UNAVAILABLE','The inviting staff property access changed.');}
   let user=(await c.query('SELECT * FROM users WHERE email=$1 FOR UPDATE',[inv.email])).rows[0];
   if(user){if(!['applicant','resident'].includes(user.account_kind)||!user.active||!await verifyPassword(user.password_hash,i.password))throw new ApiError(401,'RESIDENT_EXISTING_ACCOUNT','Use the existing applicant/resident account password for this invited email.');}
   else user=(await c.query("INSERT INTO users(email,display_name,password_hash,account_kind,is_demo) VALUES($1,$2,$3,'resident',$4) RETURNING *",[inv.email,i.name,await hashPassword(i.password),inv.environment==='demo'])).rows[0];
   await c.query('INSERT INTO resident_access_grants(organization_id,relationship_id,user_id,account_kind,granted_by_user_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(organization_id,relationship_id,user_id) DO UPDATE SET active=true,revoked_at=NULL',[inv.organization_id,inv.relationship_id,user.id,user.account_kind,inv.created_by_user_id]);
   await c.query('UPDATE resident_invitations SET used_at=clock_timestamp() WHERE id=$1',[inv.id]);const t=await this.session(c,r,user,inv.organization_id);
   await c.query("INSERT INTO audit_events(organization_id,actor_user_id,action,metadata) VALUES($1,$2,'resident.invitation_accepted',$3)",[inv.organization_id,user.id,JSON.stringify({relationshipId:inv.relationship_id})]);return t;
  });s.cookie(sessionCookieName(this.config,'resident'),result,{...this.options(),maxAge:life});const user=await this.principal(this.db,residentDigest(this.config,result));if(!user)throw new ApiError(401,'RESIDENT_AUTH_REQUIRED','Sign in again.');return this.publicUser(user);
 }
}
